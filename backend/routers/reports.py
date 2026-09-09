import math
from datetime import datetime, timedelta
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

router = APIRouter(prefix="/reports", tags=["Reports"])


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


def format_report(doc: dict) -> ReportResponse:
    return ReportResponse(
        id=str(doc["_id"]),
        user_id=doc.get("user_id"),
        photo_url=doc.get("photo_url"),
        lat=doc.get("lat", 0.0),
        lng=doc.get("lng", 0.0),
        severity=doc.get("severity", "ankle"),
        status=doc.get("status", "pending"),
        ai_verified=doc.get("ai_verified", False),
        ai_confidence=doc.get("ai_confidence"),
        corroboration_count=doc.get("corroboration_count", 0),
        timestamp=doc.get("timestamp", datetime.utcnow()),
        note=doc.get("note"),
    )


@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(report_in: ReportCreateModel):
    """
    Create a new citizen flood report with Gemini Vision photo verification
    and automatic temporal-spatial corroboration clustering.
    """
    try:
        coll = get_collection("reports")
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    # 1. Vision Verification with Gemini Flash
    ai_verified = False
    ai_confidence = None
    initial_status: ReportStatus = "pending"
    final_severity = report_in.severity

    if report_in.photo_url:
        vision_result = await verify_flood_photo(report_in.photo_url)
        is_flood = vision_result.get("is_flood", False)
        ai_confidence = vision_result.get("ai_confidence")
        est_severity = vision_result.get("ai_estimated_severity")

        if not is_flood:
            # Not a flood photo -> reject
            initial_status = "rejected"
            ai_verified = False
        else:
            initial_status = "pending"
            ai_verified = True
            if est_severity in ["ankle", "knee", "impassable"]:
                final_severity = est_severity

    doc = {
        "user_id": report_in.user_id,
        "photo_url": report_in.photo_url,
        "lat": report_in.lat,
        "lng": report_in.lng,
        "severity": final_severity,
        "status": initial_status,
        "ai_verified": ai_verified,
        "ai_confidence": ai_confidence,
        "corroboration_count": 0,
        "timestamp": datetime.utcnow(),
        "note": report_in.note,
    }

    insert_result = await coll.insert_one(doc)
    new_id = insert_result.inserted_id
    doc["_id"] = new_id

    # 2. Corroboration Logic (only for non-rejected reports)
    if initial_status != "rejected":
        try:
            two_hours_ago = datetime.utcnow() - timedelta(hours=2)
            cursor = coll.find({
                "status": {"$in": ["pending", "verified"]},
                "timestamp": {"$gte": two_hours_ago},
            })
            recent_reports = await cursor.to_list(length=100)

            # Find reports within ~300 meters
            cluster = [
                r for r in recent_reports
                if haversine_km(report_in.lat, report_in.lng, r["lat"], r["lng"]) <= 0.300
            ]

            if len(cluster) >= 2:
                cluster_ids = [r["_id"] for r in cluster]
                corroborated_count = len(cluster)

                # Auto-promote all clustered reports to "verified"
                await coll.update_many(
                    {"_id": {"$in": cluster_ids}},
                    {
                        "$set": {
                            "status": "verified",
                            "corroboration_count": corroborated_count,
                        }
                    },
                )
                doc["status"] = "verified"
                doc["corroboration_count"] = corroborated_count
        except Exception:
            pass  # Corroboration error should not fail the report submission

    return format_report(doc)


@router.get("", response_model=List[ReportResponse])
async def list_reports(
    status_filter: Optional[ReportStatus] = Query(
        default=None, alias="status", description="Filter reports by status"
    ),
    limit: int = Query(default=50, ge=1, le=100),
):
    """List citizen flood reports with optional status filtering."""
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
    """Update report verification status (pending, verified, rejected, resolved)."""
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
