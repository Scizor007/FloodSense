from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field
from backend.models.common import PyObjectId

class HotspotModel(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    name: str
    lat: float
    lng: float
    cause: str
    severity_tag: Literal["major", "recurrent"]
    source: str
    elevation: Optional[float] = None
    current_risk_score: Optional[float] = None
    last_updated: Optional[datetime] = None

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={datetime: lambda dt: dt.isoformat()},
        extra="allow",
    )

class HotspotResponse(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    cause: str
    severity_tag: Literal["major", "recurrent"]
    source: str
    elevation: Optional[float] = None
    current_risk_score: Optional[float] = None
    last_updated: Optional[datetime] = None
