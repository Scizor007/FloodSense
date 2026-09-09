from datetime import datetime
from typing import Any, Dict, List, Optional
from bson import ObjectId
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Query, status

try:
    from backend.db.mongodb import get_collection
    from backend.services.alerts import broadcast_alert
except ImportError:
    from db.mongodb import get_collection
    from services.alerts import broadcast_alert

router = APIRouter(prefix="/alerts", tags=["Alerts"])


class DeliveryStatus(BaseModel):
    recipient: str
    status: str
    channel: Optional[str] = None
    sid: Optional[str] = None
    error: Optional[str] = None
    message: Optional[str] = None


class TriggerAlertRequest(BaseModel):
    hotspot_id: str
    risk_score: float
    message: str
    route_suggestion: Optional[str] = None
    channel: str = Field(default="app", description="'app', 'sms', or 'whatsapp'")
    recipients_radius_km: float = 2.0
    recipients: Optional[List[str]] = Field(
        default=None,
        description="Optional phone numbers for SMS/WhatsApp broadcast (e.g. ['+919876543210'])",
    )


class TriggerAlertResponse(BaseModel):
    id: str
    hotspot_id: str
    risk_score: float
    message: str
    route_suggestion: Optional[str] = None
    channel: str
    sent_at: datetime
    recipients_radius_km: float
    delivery_status: List[DeliveryStatus]


class AlertListItem(BaseModel):
    id: str
    hotspot_id: str
    risk_score: float
    message: str
    route_suggestion: Optional[str] = None
    channel: str
    sent_at: datetime
    recipients_radius_km: float
    delivery_status: Optional[List[Dict[str, Any]]] = None


def format_alert_item(doc: dict) -> AlertListItem:
    return AlertListItem(
        id=str(doc["_id"]),
        hotspot_id=doc.get("hotspot_id", ""),
        risk_score=doc.get("risk_score", 0.0),
        message=doc.get("message", ""),
        route_suggestion=doc.get("route_suggestion"),
        channel=doc.get("channel", "app"),
        sent_at=doc.get("sent_at", datetime.utcnow()),
        recipients_radius_km=doc.get("recipients_radius_km", 2.0),
        delivery_status=doc.get("delivery_status"),
    )


@router.post("/trigger", response_model=TriggerAlertResponse, status_code=status.HTTP_201_CREATED)
async def trigger_alert(alert_in: TriggerAlertRequest):
    """
    Store an alert record in MongoDB and dispatch real broadcast messages
    via Twilio (SMS or WhatsApp) if external channel and recipients are provided.
    """
    try:
        coll = get_collection("alerts")
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    # 1. Dispatch SMS / WhatsApp via Twilio if applicable
    delivery_results = broadcast_alert(
        channel=alert_in.channel.lower(),
        message=alert_in.message,
        recipients=alert_in.recipients,
    )

    doc = {
        "hotspot_id": alert_in.hotspot_id,
        "risk_score": alert_in.risk_score,
        "message": alert_in.message,
        "route_suggestion": alert_in.route_suggestion,
        "channel": alert_in.channel.lower(),
        "sent_at": datetime.utcnow(),
        "recipients_radius_km": alert_in.recipients_radius_km,
        "delivery_status": delivery_results,
    }

    result = await coll.insert_one(doc)
    doc["_id"] = result.inserted_id

    return TriggerAlertResponse(
        id=str(doc["_id"]),
        hotspot_id=doc["hotspot_id"],
        risk_score=doc["risk_score"],
        message=doc["message"],
        route_suggestion=doc.get("route_suggestion"),
        channel=doc["channel"],
        sent_at=doc["sent_at"],
        recipients_radius_km=doc["recipients_radius_km"],
        delivery_status=[DeliveryStatus(**d) for d in delivery_results],
    )


@router.get("", response_model=List[AlertListItem])
async def list_alerts(limit: int = Query(default=50, ge=1, le=100)):
    """Retrieve historical and triggered alerts, most recent first."""
    try:
        coll = get_collection("alerts")
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available.",
        )

    cursor = coll.find({}).sort("sent_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [format_alert_item(d) for d in docs]
