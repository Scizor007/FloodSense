import base64
import logging
import math
import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, status

try:
    from backend.db.mongodb import get_collection
    from backend.models.report import (
        ReportCreateModel,
        ReportModel,
        ReportResponse,
        ReportStatus,
        ReportStatusUpdateModel,
    )
    from backend.services.vision import verify_flood_photo
except ImportError:
    from db.mongodb import get_collection
    from models.report import (
        ReportCreateModel,
        ReportModel,
        ReportResponse,
        ReportStatus,
        ReportStatusUpdateModel,
    )
    from services.vision import verify_flood_photo

logger = logging.getLogger("floodsense.routers.reports")

router = APIRouter(prefix="/reports", tags=["Reports"])

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in kilometers between two lat/lng coordinates."""
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2.0) ** 2
    )
    return r * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def save_image_if_data_uri(photo_input: Optional[str]) -> Optional[str]:
    """
    If photo_input is a base64 data URI, save it to backend/uploads and return relative URL.
    Otherwise return photo_input unchanged.
    """
    if not photo_input or not photo_input.startswith("data:image/"):
        return photo_input

    try:
        header, base64_data = photo_input.split(",", 1)
        mime_match = re.search(r"data:image/(\w+);", header)
        ext = mime_match.group(1).lower() if mime_match else "jpeg"
        if ext == "jpeg":
            ext = "jpg"

        file_bytes = base64.b64decode(base64_data)
        filename = f"report_{uuid.uuid4().hex[:12]}.{ext}"
        filepath = UPLOADS_DIR / filename
        with open(filepath, "wb") as f:
            f.write(file_bytes)

        logger.info(f"Saved uploaded report photo to {filepath} ({len(file_bytes)} bytes)")
        return f"/uploads/{filename}"
    except Exception as e:
        logger.warning(f"Failed to persist base64 image locally: {e}. Preserving original input.")
        return photo_input


def format_report(doc: dict) -> ReportResponse:
    citizen_depth = doc.get("citizen_reported_depth")
    if not citizen_depth:
        depth_labels = {
            "ankle": "Ankle-deep",
            "knee": "Knee-deep",
            "impassable": "Impassable",
        }
        citizen_depth = depth_labels.get(doc.get("severity", "knee"), "Knee-deep")

    return ReportResponse(
        id=str(doc["_id"]),
        user_id=doc.get("user_id"),
        photo_url=doc.get("photo_url"),
        lat=doc.get("lat", 0.0),
        lng=doc.get("lng", 0.0),
        severity=doc.get("severity", "knee"),
        citizen_reported_depth=citizen_depth,
        status=doc.get("status", "pending"),
        ai_verified=doc.get("ai_verified", False),
        ai_confidence=doc.get("ai_confidence"),
        ai_explanation=doc.get("ai_explanation"),
        image_usable=doc.get("image_usable"),
        corroboration_count=doc.get("corroboration_count", 0),
        timestamp=doc.get("timestamp", datetime.utcnow()),
        note=doc.get("note"),
    )


@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(report_in: ReportCreateModel):
    """
    Create a new citizen flood report with Gemini Multimodal photo verification
    and automatic spatial corroboration clustering (300m threshold).

    Verification Rules:
    1. Gemini verifies visible flooding evidence from the submitted photo.
    2. If Gemini rejects (flood_detected = False), status is set to 'rejected'
       and ai_verified = False. Spatial corroboration CANNOT override rejection.
    3. If Gemini confirms flooding, ai_verified = True and the report is eligible
       for spatial corroboration with nearby reports within ~300m.
    4. If no photo is provided or API key is unconfigured, report is stored
       with status='pending' and queued for human authority triage.
    """
    try:
        coll = get_collection("reports")
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    # 1. Resolve citizen-reported water depth
    citizen_depth = report_in.citizen_reported_depth
    if not citizen_depth:
        depth_labels = {
            "ankle": "Ankle-deep",
            "knee": "Knee-deep",
            "impassable": "Impassable",
        }
        citizen_depth = depth_labels.get(report_in.severity, "Knee-deep")

    # 2. Persist image if base64 data URI
    stored_photo_url = save_image_if_data_uri(report_in.photo_url)

    # 3. Vision Verification with Gemini Multimodal Flash
    ai_verified = False
    ai_confidence = None
    ai_explanation = None
    image_usable = None
    initial_status: ReportStatus = "pending"

    if report_in.photo_url:
        vision_result = await verify_flood_photo(report_in.photo_url)
        flood_detected = vision_result.get("flood_detected", False)
        ai_confidence = vision_result.get("confidence")
        ai_explanation = vision_result.get("explanation")
        image_usable = vision_result.get("image_usable")
        provider = vision_result.get("provider", "")

        if provider in ["unconfigured", "error"]:
            # Gemini unconfigured or temporary API error:
            # Keep as pending for authority triage; do NOT reject, do NOT mark ai_verified.
            initial_status = "pending"
            ai_verified = False
        elif not flood_detected:
            # Step 1: Gemini evaluated image and found NO visible flooding -> reject
            # Spatial corroboration must NEVER override this.
            initial_status = "rejected"
            ai_verified = False
        else:
            # Step 2: Gemini confirmed visible flooding -> eligible for corroboration
            initial_status = "pending"
            ai_verified = True
    else:
        ai_explanation = "No photo attached. Queued for authority review."
        image_usable = False

    # 4. Spatial Corroboration Logic
    # Corroboration must NEVER override a failed Gemini flood verification.
    if initial_status == "rejected":
        corroboration_count = 0
    else:
        corroboration_count = 1
        try:
            cutoff_time = datetime.utcnow() - timedelta(hours=24)
            cursor = coll.find({
                "status": {"$in": ["pending", "verified"]},
                "timestamp": {"$gte": cutoff_time},
            })
            recent_reports = await cursor.to_list(length=100)

            # Find nearby eligible reports within ~300 meters
            cluster = [
                r for r in recent_reports
                if haversine_km(report_in.lat, report_in.lng, r["lat"], r["lng"]) <= 0.300
            ]

            # If other eligible reports exist in this 300m area, total cluster >= 2
            if len(cluster) >= 1:
                total_in_cluster = len(cluster) + 1
                cluster_ids = [r["_id"] for r in cluster]

                # Promote all clustered reports in this area to "verified"
                await coll.update_many(
                    {"_id": {"$in": cluster_ids}},
                    {
                        "$set": {
                            "status": "verified",
                            "corroboration_count": total_in_cluster,
                        }
                    },
                )
                initial_status = "verified"
                corroboration_count = total_in_cluster
        except Exception as err:
            logger.warning(f"Corroboration calculation skipped: {err}")

    # 5. Store document in MongoDB
    doc = {
        "user_id": report_in.user_id,
        "photo_url": stored_photo_url,
        "lat": report_in.lat,
        "lng": report_in.lng,
        "severity": report_in.severity,
        "citizen_reported_depth": citizen_depth,
        "status": initial_status,
        "ai_verified": ai_verified,
        "ai_confidence": ai_confidence,
        "ai_explanation": ai_explanation,
        "image_usable": image_usable,
        "corroboration_count": corroboration_count,
        "timestamp": datetime.utcnow(),
        "note": report_in.note,
    }

    insert_result = await coll.insert_one(doc)
    doc["_id"] = insert_result.inserted_id

    return format_report(doc)


@router.get("", response_model=List[ReportResponse])
async def list_reports(
    status_filter: Optional[ReportStatus] = Query(
        default=None, alias="status", description="Filter reports by status"
    ),
    limit: int = Query(default=50, ge=1, le=100),
):
    """
    List citizen flood reports with optional status filtering.
    Does not delete resolved reports; preserves all history.
    """
    try:
        coll = get_collection("reports")
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    query = {}
    if status_filter:
        query["status"] = status_filter

    cursor = coll.find(query).sort("timestamp", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [format_report(d) for d in docs]


@router.patch("/{id}/status", response_model=ReportResponse)
async def update_report_status(id: str, update: ReportStatusUpdateModel):
    """
    Update report verification status (pending, verified, rejected, resolved).
    Allows authorities to review and update reports without deleting history.
    """
    try:
        coll = get_collection("reports")
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID '{id}' not found.",
        )

    result = await coll.find_one_and_update(
        {"_id": ObjectId(id)},
        {"$set": {"status": update.status}},
        return_document=True,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID '{id}' not found.",
        )

    return format_report(result)
