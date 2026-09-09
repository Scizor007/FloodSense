from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, status

try:
    from backend.services.routing import get_reroute as calculate_reroute
except ImportError:
    from services.routing import get_reroute as calculate_reroute

router = APIRouter(prefix="/routing", tags=["Routing"])


class Coordinates(BaseModel):
    lat: float
    lng: float


class RerouteRequest(BaseModel):
    origin: Coordinates
    destination: Coordinates
    avoid_hotspot_ids: Optional[List[str]] = Field(
        default=None,
        description="List of flooded hotspot IDs or names to avoid",
    )
    check_flood_risk: Optional[bool] = Field(
        default=True,
        description="Evaluate flood risk exposure along the route",
    )
    send_email_alert: Optional[bool] = Field(
        default=False,
        description="Send SMTP email alert if route has high/severe flood exposure",
    )


class Waypoint(BaseModel):
    lat: float
    lng: float
    instruction: Optional[str] = None


class RouteGeometry(BaseModel):
    type: str
    coordinates: List[List[float]]


class RerouteResponse(BaseModel):
    status: str
    provider: str
    summary: str
    distance_km: float
    duration_minutes: float
    avoided_zones: List[str]
    waypoints: List[Waypoint]
    geometry: RouteGeometry
    original_geometry: Optional[RouteGeometry] = None
    original_distance_km: Optional[float] = None
    original_duration_minutes: Optional[float] = None
    added_distance_km: Optional[float] = None
    added_duration_minutes: Optional[float] = None
    # User-safety & flood exposure extensions
    exposure_level: str = "NONE"
    max_risk_score: float = 0.0
    affected_zones: List[str] = Field(default_factory=list)
    is_hazard: bool = False
    warning_message: Optional[str] = None
    alert_triggered: bool = False
    email_sent: bool = False
    email_status: Optional[str] = None


@router.post("/reroute", response_model=RerouteResponse)
async def get_reroute(request: RerouteRequest):
    """
    Compute safe detour driving route avoiding flooded hotspots using
    OpenRouteService avoid-polygons with automatic OSRM fallback,
    evaluating flood exposure along the corridor and sending SMTP alerts if needed.
    """
    try:
        data = await calculate_reroute(
            origin={"lat": request.origin.lat, "lng": request.origin.lng},
            destination={"lat": request.destination.lat, "lng": request.destination.lng},
            avoid_hotspot_ids=request.avoid_hotspot_ids,
            check_flood_risk=request.check_flood_risk if request.check_flood_risk is not None else True,
            send_email_alert=request.send_email_alert if request.send_email_alert is not None else False,
        )
        return RerouteResponse(**data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Route calculation failed: {str(e)}",
        )

