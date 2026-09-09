from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, status

try:
    from backend.db.mongodb import get_collection
    from backend.services.risk_model import predict_risk_hybrid, predict_grid_hybrid
except ImportError:
    from db.mongodb import get_collection
    from services.risk_model import predict_risk_hybrid, predict_grid_hybrid

router = APIRouter(prefix="/risk", tags=["Risk Prediction"])


class RiskPredictionRequest(BaseModel):
    lat: float = Field(..., description="Latitude of the location")
    lng: float = Field(..., description="Longitude of the location")
    rainfall_intensity: float = Field(..., ge=0, description="Rainfall intensity in mm/hr")
    duration_minutes: int = Field(default=60, ge=1, description="Duration in minutes")


class ContributingFactors(BaseModel):
    elevation_m: float
    elevation_vulnerability: float
    rainfall_intensity_mm_hr: float
    rainfall_total_mm: float
    rainfall_factor: float
    distance_to_hotspot_km: float
    nearest_hotspot_name: str
    proximity_factor: float


class NearestHotspotInfo(BaseModel):
    id: str
    name: str
    distance_km: float


class RiskPredictionResponse(BaseModel):
    lat: float
    lng: float
    rainfall_intensity: float
    duration_minutes: int
    risk_score: float
    severity_label: str
    physics_base_score: float
    ml_probability_score: float
    model_version: str
    contributing_factors: ContributingFactors
    nearest_hotspot: Optional[NearestHotspotInfo] = None
    logged_to_history: bool = False


class GridPredictionRequest(BaseModel):
    min_lat: float = Field(default=17.34, description="Southern latitude boundary")
    max_lat: float = Field(default=17.48, description="Northern latitude boundary")
    min_lng: float = Field(default=78.36, description="Western longitude boundary")
    max_lng: float = Field(default=78.56, description="Eastern longitude boundary")
    grid_resolution: int = Field(default=8, ge=3, le=15, description="Grid points along each axis")
    rainfall_intensity: float = Field(default=40.0, ge=0, description="Rainfall intensity in mm/hr")
    duration_minutes: int = Field(default=60, ge=1, description="Rainfall duration in minutes")


class GridPointRisk(BaseModel):
    lat: float
    lng: float
    elevation: float
    risk_score: float
    severity: str


class GridPredictionResponse(BaseModel):
    status: str
    bounding_box: Dict[str, float]
    resolution: int
    total_points: int
    rainfall_intensity: float
    duration_minutes: int
    grid: List[GridPointRisk]


@router.post("/predict", response_model=RiskPredictionResponse)
async def predict_risk(request: RiskPredictionRequest):
    """
    Compute real-time waterlogging risk using a hybrid physics-informed formula
    and Random Forest classifier trained on Hyderabad terrain and historical hotspots.
    """
    try:
        result = await predict_risk_hybrid(
            lat=request.lat,
            lng=request.lng,
            rainfall_intensity=request.rainfall_intensity,
            duration_minutes=request.duration_minutes,
        )

        logged = False
        # Log to risk_history if within proximity of a known hotspot (<= 350 meters)
        nearest = result.get("nearest_hotspot")
        if nearest and nearest["distance_km"] <= 0.35:
            try:
                coll = get_collection("risk_history")
                history_doc = {
                    "hotspot_id": nearest["id"],
                    "hotspot_name": nearest["name"],
                    "date": datetime.utcnow(),
                    "rainfall_mm": request.rainfall_intensity * (request.duration_minutes / 60.0),
                    "elevation": result["contributing_factors"]["elevation_m"],
                    "risk_score": result["risk_score"],
                    "model_version": result["model_version"],
                }
                await coll.insert_one(history_doc)
                logged = True
            except Exception:
                pass  # Do not fail prediction if history logging encounters an issue

        result["logged_to_history"] = logged
        return RiskPredictionResponse(**result)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Risk prediction computation failed: {str(e)}",
        )


@router.post("/predict-grid", response_model=GridPredictionResponse)
async def predict_risk_grid(request: GridPredictionRequest):
    """
    Batch risk scoring across a bounding box grid for citywide waterlogging heatmaps.
    """
    try:
        result = await predict_grid_hybrid(
            min_lat=request.min_lat,
            max_lat=request.max_lat,
            min_lng=request.min_lng,
            max_lng=request.max_lng,
            grid_resolution=request.grid_resolution,
            rainfall_intensity=request.rainfall_intensity,
            duration_minutes=request.duration_minutes,
        )
        return GridPredictionResponse(**result)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch grid risk prediction failed: {str(e)}",
        )
