import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import joblib
import numpy as np

try:
    from backend.data.hotspots_seed import HOTSPOTS_SEED_DATA
    from backend.db.mongodb import get_collection
    from backend.services.elevation import get_elevation
except ImportError:
    from data.hotspots_seed import HOTSPOTS_SEED_DATA
    from db.mongodb import get_collection
    from services.elevation import get_elevation

logger = logging.getLogger("floodsense.services.risk")

MODEL_PATH = Path(__file__).resolve().parent.parent / "data" / "risk_model.joblib"

_rf_model = None


def load_model():
    """Load the trained Random Forest model from disk if available."""
    global _rf_model
    if MODEL_PATH.exists():
        try:
            _rf_model = joblib.load(MODEL_PATH)
            logger.info(f"Loaded Random Forest model from {MODEL_PATH}")
        except Exception as e:
            logger.error(f"Failed to load model from {MODEL_PATH}: {e}")
            _rf_model = None
    else:
        logger.warning(f"Model file not found at {MODEL_PATH}. Retraining or train script needed.")
        _rf_model = None
    return _rf_model


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Compute distance in kilometers between two geographic points."""
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2.0) ** 2
    )
    return r * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


async def get_hotspots_list() -> List[Dict[str, Any]]:
    """Retrieve hotspots from database with fallback to seed data."""
    try:
        coll = get_collection("hotspots")
        docs = await coll.find({}).to_list(length=100)
        if docs:
            return docs
    except Exception:
        pass
    return HOTSPOTS_SEED_DATA


def find_nearest_hotspot(lat: float, lng: float, hotspots: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], float]:
    """Find the nearest hotspot and its distance in kilometers."""
    nearest = None
    min_dist = 99999.0
    for h in hotspots:
        d = haversine_km(lat, lng, h["lat"], h["lng"])
        if d < min_dist:
            min_dist = d
            nearest = h
    return nearest, min_dist


def compute_physics_score(
    elevation: float,
    rainfall_intensity: float,
    duration_minutes: int,
    distance_to_hotspot_km: float,
    nearest_hotspot: Optional[Dict[str, Any]],
) -> Tuple[float, Dict[str, Any]]:
    """
    Physics-informed base risk score (0-100) factoring:
    1. Elevation gradient relative to Hyderabad terrain (480m - 610m)
    2. Rainfall rate & volume
    3. Proximity to historical bottleneck
    """
    # 1. Elevation factor (lower ground = higher water collection)
    # Hyderabad range: ~480m (Musi riverbed) to ~610m (Banjara ridges)
    elev_score = max(0.0, min(1.0, (610.0 - elevation) / (610.0 - 480.0)))

    # 2. Rainfall factor
    total_volume_mm = rainfall_intensity * (duration_minutes / 60.0)
    rate_factor = min(1.0, rainfall_intensity / 75.0)  # 75mm/hr torrential
    vol_factor = min(1.0, total_volume_mm / 60.0)      # 60mm total deluge
    rain_score = (0.65 * rate_factor) + (0.35 * vol_factor)

    # 3. Proximity factor (attenuates beyond 2.5 km)
    hs_base_risk = (nearest_hotspot.get("current_risk_score", 60.0) / 100.0) if nearest_hotspot else 0.6
    prox_decay = max(0.0, 1.0 - (distance_to_hotspot_km / 2.5))
    prox_score = prox_decay * hs_base_risk

    # Composite weighted physics score
    physics_score = ((0.40 * rain_score) + (0.35 * elev_score) + (0.25 * prox_score)) * 100.0
    physics_score = max(0.0, min(100.0, physics_score))

    factors = {
        "elevation_m": round(elevation, 1),
        "elevation_vulnerability": round(elev_score, 2),
        "rainfall_intensity_mm_hr": rainfall_intensity,
        "rainfall_total_mm": round(total_volume_mm, 1),
        "rainfall_factor": round(rain_score, 2),
        "distance_to_hotspot_km": round(distance_to_hotspot_km, 2),
        "nearest_hotspot_name": nearest_hotspot["name"] if nearest_hotspot else "Unknown",
        "proximity_factor": round(prox_score, 2),
    }

    return round(physics_score, 1), factors


def get_severity_label(risk_score: float) -> str:
    if risk_score >= 75.0:
        return "severe"
    elif risk_score >= 50.0:
        return "high"
    elif risk_score >= 25.0:
        return "moderate"
    else:
        return "low"


async def predict_risk_hybrid(
    lat: float,
    lng: float,
    rainfall_intensity: float,
    duration_minutes: int,
    physics_weight: float = 0.40,
    rf_weight: float = 0.60,
) -> Dict[str, Any]:
    """
    Run hybrid Physics + Random Forest risk prediction.
    """
    global _rf_model
    if _rf_model is None:
        load_model()

    # 1. Fetch elevation (with caching)
    elevation = await get_elevation(lat, lng)

    # 2. Find nearest hotspot
    hotspots = await get_hotspots_list()
    nearest_hs, dist_km = find_nearest_hotspot(lat, lng, hotspots)

    # 3. Compute physics score
    physics_score, factors = compute_physics_score(
        elevation=elevation,
        rainfall_intensity=rainfall_intensity,
        duration_minutes=duration_minutes,
        distance_to_hotspot_km=dist_km,
        nearest_hotspot=nearest_hs,
    )

    # 4. Compute Random Forest score
    if _rf_model is not None:
        feature_vec = np.array([[elevation, rainfall_intensity, duration_minutes, dist_km]], dtype=float)
        rf_prob = float(_rf_model.predict_proba(feature_vec)[0][1])
        rf_score = round(rf_prob * 100.0, 1)
    else:
        rf_score = physics_score

    # 5. Hybrid blend
    final_score = round((physics_weight * physics_score) + (rf_weight * rf_score), 1)
    final_score = max(0.0, min(100.0, final_score))

    severity = get_severity_label(final_score)

    return {
        "lat": lat,
        "lng": lng,
        "rainfall_intensity": rainfall_intensity,
        "duration_minutes": duration_minutes,
        "risk_score": final_score,
        "severity_label": severity,
        "physics_base_score": physics_score,
        "ml_probability_score": rf_score,
        "model_version": "hybrid-physics-rf-v1",
        "contributing_factors": factors,
        "nearest_hotspot": {
            "id": str(nearest_hs.get("_id", "")) if nearest_hs else "",
            "name": nearest_hs["name"] if nearest_hs else "",
            "distance_km": round(dist_km, 2),
        } if nearest_hs else None,
    }


async def predict_grid_hybrid(
    min_lat: float,
    max_lat: float,
    min_lng: float,
    max_lng: float,
    grid_resolution: int = 8,
    rainfall_intensity: float = 40.0,
    duration_minutes: int = 60,
) -> Dict[str, Any]:
    """
    Batch risk scoring across a bounding box grid for citywide heatmaps.
    """
    res = max(3, min(15, grid_resolution))  # between 3x3 and 15x15
    lats = np.linspace(min_lat, max_lat, res)
    lngs = np.linspace(min_lng, max_lng, res)

    hotspots = await get_hotspots_list()
    grid_results = []

    for lat in lats:
        for lng in lngs:
            lat_f = round(float(lat), 4)
            lng_f = round(float(lng), 4)
            pred = await predict_risk_hybrid(
                lat=lat_f,
                lng=lng_f,
                rainfall_intensity=rainfall_intensity,
                duration_minutes=duration_minutes,
            )
            grid_results.append({
                "lat": lat_f,
                "lng": lng_f,
                "elevation": pred["contributing_factors"]["elevation_m"],
                "risk_score": pred["risk_score"],
                "severity": pred["severity_label"],
            })

    return {
        "status": "success",
        "bounding_box": {
            "min_lat": min_lat,
            "max_lat": max_lat,
            "min_lng": min_lng,
            "max_lng": max_lng,
        },
        "resolution": res,
        "total_points": len(grid_results),
        "rainfall_intensity": rainfall_intensity,
        "duration_minutes": duration_minutes,
        "grid": grid_results,
    }
