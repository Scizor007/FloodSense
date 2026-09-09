from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field
from backend.models.common import PyObjectId

class RainfallCacheModel(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    lat: float
    lng: float
    date: datetime
    rainfall_mm: float
    source: Literal["forecast", "historical"]
    fetched_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={datetime: lambda dt: dt.isoformat()},
    )
