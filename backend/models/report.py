from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field
try:
    from backend.models.common import PyObjectId
except ImportError:
    from models.common import PyObjectId

ReportSeverity = Literal["ankle", "knee", "impassable"]
ReportStatus = Literal["pending", "verified", "rejected", "resolved"]

class ReportCreateModel(BaseModel):
    user_id: Optional[str] = None
    photo_url: Optional[str] = None
    lat: float
    lng: float
    severity: ReportSeverity = "knee"
    citizen_reported_depth: Optional[str] = None
    note: Optional[str] = None

class ReportStatusUpdateModel(BaseModel):
    status: ReportStatus

class ReportModel(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    user_id: Optional[str] = None
    photo_url: Optional[str] = None
    lat: float
    lng: float
    severity: str = "knee"
    citizen_reported_depth: Optional[str] = None
    status: ReportStatus = "pending"
    ai_verified: bool = False
    ai_confidence: Optional[float] = None
    ai_explanation: Optional[str] = None
    image_usable: Optional[bool] = None
    corroboration_count: int = 0
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    note: Optional[str] = None

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={datetime: lambda dt: dt.isoformat()},
    )

class ReportResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    photo_url: Optional[str] = None
    lat: float
    lng: float
    severity: str = "knee"
    citizen_reported_depth: Optional[str] = None
    status: ReportStatus
    ai_verified: bool
    ai_confidence: Optional[float] = None
    ai_explanation: Optional[str] = None
    image_usable: Optional[bool] = None
    corroboration_count: int
    timestamp: datetime
    note: Optional[str] = None
