from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Query, HTTPException, status

try:
    from backend.services.elevation import get_elevation, get_elevation_grid
except ImportError:
    from services.elevation import get_elevation, get_elevation_grid

router = APIRouter(prefix="/elevation", tags=["Elevation"])


class ElevationPoint(BaseModel):
    lat: float
    lng: float
    elevation: float


class ElevationGridResponse(BaseModel):
    center_lat: float
    center_lng: float
    center_elevation: float
    radius_m: float
    grid_size: int
    total_points: int
    min_elevation: float
    max_elevation: float
    elevation_delta: float
    points: List[ElevationPoint]


@router.get("/grid", response_model=ElevationGridResponse)
async def fetch_elevation_grid(
    lat: float = Query(default=17.3850, description="Center latitude"),
    lng: float = Query(default=78.4867, description="Center longitude"),
    radius_m: float = Query(default=1000.0, ge=100.0, le=10000.0, description="Radius in meters"),
    grid_size: int = Query(default=5, ge=3, le=9, description="Grid dimension (N x N, max 9)"),
):
    """
    Retrieve an elevation grid mesh around a coordinate for 3D terrain representation.
    """
    try:
        data = await get_elevation_grid(
            center_lat=lat,
            center_lng=lng,
            radius_m=radius_m,
            grid_size=grid_size,
        )
        return ElevationGridResponse(**data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate elevation grid: {str(e)}",
        )
