from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from backend.models.common import PyObjectId

class RiskHistoryModel(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    hotspot_id: str
    date: datetime
    rainfall_mm: float
    elevation: float
    risk_score: float
    model_version: str

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={datetime: lambda dt: dt.isoformat()},
    )

class RiskHistoryResponse(BaseModel):
    id: str
    hotspot_id: str
    date: datetime
    rainfall_mm: float
    elevation: float
    risk_score: float
    model_version: str
