from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field
from backend.models.common import PyObjectId

UserRole = Literal["citizen", "authority"]

class UserModel(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    name: str
    phone: Optional[str] = None
    role: UserRole = "citizen"
    last_known_lat: Optional[float] = None
    last_known_lng: Optional[float] = None

    model_config = ConfigDict(
        populate_by_name=True,
    )

class UserResponse(BaseModel):
    id: str
    name: str
    phone: Optional[str] = None
    role: UserRole
    last_known_lat: Optional[float] = None
    last_known_lng: Optional[float] = None
