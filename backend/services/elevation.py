import logging
import math
from datetime import datetime
from typing import Any, Dict, List
import httpx

try:
    from backend.db.mongodb import get_collection
except ImportError:
    from db.mongodb import get_collection

logger = logging.getLogger("floodsense.services.elevation")

OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"


async def get_elevation(lat: float, lng: float) -> float:
    """
    Get ground surface elevation in meters for a single coordinate.
    Caches results permanently in the elevation_cache collection.
    """
    norm_lat = round(lat, 4)
    norm_lng = round(lng, 4)

    # 1. Check MongoDB elevation_cache
    try:
        coll = get_collection("elevation_cache")
        cached = await coll.find_one({"lat": norm_lat, "lng": norm_lng})
        if cached and "elevation" in cached:
            return float(cached["elevation"])
    except Exception as e:
        logger.warning(f"Elevation cache check error: {e}")
        coll = None

    # 2. Call Open-Meteo Elevation API
    params = {
        "latitude": str(norm_lat),
        "longitude": str(norm_lng),
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(OPEN_METEO_ELEVATION_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        elevations = data.get("elevation", [])
        elev = float(elevations[0]) if elevations else 505.0
    except Exception as exc:
        logger.warning(f"Open-Meteo elevation call failed for ({norm_lat}, {norm_lng}): {exc}")
        elev = 505.0  # Safe default median elevation for Hyderabad

    # 3. Store in elevation_cache
    if coll is not None:
        try:
            await coll.update_one(
                {"lat": norm_lat, "lng": norm_lng},
                {
                    "$set": {
                        "lat": norm_lat,
                        "lng": norm_lng,
                        "elevation": elev,
                        "cached_at": datetime.utcnow(),
                    }
                },
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"Failed to cache elevation: {e}")

    return elev


async def get_elevation_grid(
    center_lat: float,
    center_lng: float,
    radius_m: float = 1000.0,
    grid_size: int = 5,
) -> Dict[str, Any]:
    """
    Generate a grid_size x grid_size terrain elevation mesh around a center point.
    Batch queries Open-Meteo Elevation API for up to 100 coordinates.
    """
    size = max(3, min(9, grid_size))  # Max 9x9 = 81 points (within 100 limit)

    # Coordinate conversion
    lat_deg_per_m = 1.0 / 111320.0
    lng_deg_per_m = 1.0 / (111320.0 * math.cos(math.radians(center_lat)))

    step_m = (2.0 * radius_m) / (size - 1)

    points_coords: List[Dict[str, float]] = []
    lat_list: List[str] = []
    lng_list: List[str] = []

    for i in range(size):
        offset_y = -radius_m + (i * step_m)
        pt_lat = round(center_lat + (offset_y * lat_deg_per_m), 4)
        for j in range(size):
            offset_x = -radius_m + (j * step_m)
            pt_lng = round(center_lng + (offset_x * lng_deg_per_m), 4)
            points_coords.append({"lat": pt_lat, "lng": pt_lng})
            lat_list.append(str(pt_lat))
            lng_list.append(str(pt_lng))

    # Batch call Open-Meteo
    params = {
        "latitude": ",".join(lat_list),
        "longitude": ",".join(lng_list),
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(OPEN_METEO_ELEVATION_URL, params=params)
            resp.raise_for_status()
            elevations = resp.json().get("elevation", [])
    except Exception as exc:
        logger.warning(f"Batch elevation API failed: {exc}. Using estimates.")
        elevations = [505.0] * len(points_coords)

    grid_points: List[Dict[str, Any]] = []
    min_elev = 9999.0
    max_elev = -9999.0

    for idx, pt in enumerate(points_coords):
        elev = float(elevations[idx]) if idx < len(elevations) and elevations[idx] is not None else 505.0
        min_elev = min(min_elev, elev)
        max_elev = max(max_elev, elev)
        grid_points.append({
            "lat": pt["lat"],
            "lng": pt["lng"],
            "elevation": elev,
        })

    center_elev = await get_elevation(center_lat, center_lng)

    return {
        "center_lat": center_lat,
        "center_lng": center_lng,
        "center_elevation": center_elev,
        "radius_m": radius_m,
        "grid_size": size,
        "total_points": len(grid_points),
        "min_elevation": min_elev,
        "max_elevation": max_elev,
        "elevation_delta": round(max_elev - min_elev, 2),
        "points": grid_points,
    }
