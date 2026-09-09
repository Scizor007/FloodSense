from typing import List
from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
from backend.db.mongodb import get_collection
from backend.models.hotspot import HotspotResponse

router = APIRouter(prefix="/hotspots", tags=["Hotspots"])

def format_hotspot(doc: dict) -> HotspotResponse:
    return HotspotResponse(
        id=str(doc["_id"]),
        name=doc.get("name", ""),
        lat=doc.get("lat", 0.0),
        lng=doc.get("lng", 0.0),
        cause=doc.get("cause", ""),
        severity_tag=doc.get("severity_tag", "recurrent"),
        source=doc.get("source", ""),
        elevation=doc.get("elevation"),
        current_risk_score=doc.get("current_risk_score"),
        last_updated=doc.get("last_updated"),
    )

@router.get("", response_model=List[HotspotResponse])
async def list_hotspots():
    """Retrieve all monitored Hyderabad waterlogging hotspots."""
    try:
        coll = get_collection("hotspots")
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    cursor = coll.find({}).sort("current_risk_score", -1)
    docs = await cursor.to_list(length=100)
    return [format_hotspot(doc) for doc in docs]

@router.get("/{id}", response_model=HotspotResponse)
async def get_hotspot(id: str):
    """Retrieve a single hotspot by its MongoDB ID."""
    try:
        coll = get_collection("hotspots")
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    if not ObjectId.is_valid(id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hotspot with ID '{id}' not found.",
        )

    doc = await coll.find_one({"_id": ObjectId(id)})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hotspot with ID '{id}' not found.",
        )

    return format_hotspot(doc)
