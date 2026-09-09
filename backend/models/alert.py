from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field
from backend.models.common import PyObjectId

AlertChannel = Literal["app", "sms", "whatsapp"]

class AlertCreateModel(BaseModel):
    hotspot_id: str
    risk_score: float
    message: str
    route_suggestion: Optional[str] = None
    channel: AlertChannel = "app"
    recipients_radius_km: float = 2.0

class AlertModel(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    hotspot_id: str
    risk_score: float
    message: str
    route_suggestion: Optional[str] = None
    channel: AlertChannel
    sent_at: datetime = Field(default_factory=datetime.utcnow)
    recipients_radius_km: float = 2.0

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={datetime: lambda dt: dt.isoformat()},
    )

class AlertResponse(BaseModel):
    id: str
    hotspot_id: str
    risk_score: float
    message: str
    route_suggestion: Optional[str] = None
    channel: AlertChannel
    sent_at: datetime
    recipients_radius_km: float
