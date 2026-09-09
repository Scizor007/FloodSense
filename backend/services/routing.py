import logging
import math
from datetime import datetime
from typing import Any, Dict, List, Optional
import httpx

try:
    from backend.config import settings
    from backend.data.hotspots_seed import HOTSPOTS_SEED_DATA
    from backend.db.mongodb import get_collection
except ImportError:
    from config import settings
    from data.hotspots_seed import HOTSPOTS_SEED_DATA
    from db.mongodb import get_collection

logger = logging.getLogger("floodsense.services.routing")

ORS_DIRECTIONS_URL = "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson"
OSRM_ROUTE_URL = "http://router.project-osrm.org/route/v1/driving"


async def get_hotspot_coords(hotspot_id_or_name: str) -> Optional[Dict[str, Any]]:
    """Lookup hotspot coordinates from DB or seed fallback."""
    try:
        coll = get_collection("hotspots")
        doc = await coll.find_one({
            "$or": [
                {"name": hotspot_id_or_name},
                {"_id": hotspot_id_or_name},
            ]
        })
        if doc:
            return doc
    except Exception:
        pass

    for h in HOTSPOTS_SEED_DATA:
        if h["name"].lower() == hotspot_id_or_name.lower() or hotspot_id_or_name in h.get("name", ""):
            return h
    return None


async def get_corridor_high_risk_hotspots(
    origin: Dict[str, float],
    destination: Dict[str, float],
    max_hotspots: int = 5,
) -> List[Dict[str, Any]]:
    """Find active/severe flood hotspots between origin and destination."""
    min_lat = min(origin["lat"], destination["lat"]) - 0.025
    max_lat = max(origin["lat"], destination["lat"]) + 0.025
    min_lng = min(origin["lng"], destination["lng"]) - 0.025
    max_lng = max(origin["lng"], destination["lng"]) + 0.025

    candidates: List[Dict[str, Any]] = []

    # Check MongoDB first
    try:
        coll = get_collection("hotspots")
        cursor = coll.find({
            "lat": {"$gte": min_lat, "$lte": max_lat},
            "lng": {"$gte": min_lng, "$lte": max_lng},
            "$or": [
                {"current_risk_score": {"$gte": 55.0}},
                {"severity_tag": {"$in": ["major", "severe", "recurrent"]}},
            ],
        })
        docs = await cursor.to_list(length=20)
        if docs:
            candidates.extend(docs)
    except Exception:
        pass

    if not candidates:
        for h in HOTSPOTS_SEED_DATA:
            if (min_lat <= h["lat"] <= max_lat) and (min_lng <= h["lng"] <= max_lng):
                if h.get("current_risk_score", 0) >= 55.0 or h.get("severity_tag") in ["major", "severe", "recurrent"]:
                    candidates.append(h)

    # Filter out hotspots that are extremely close to origin or destination (< 350m)
    # to avoid ORS failing with start/end inside avoid polygon
    safe_candidates = []
    for c in candidates:
        d_orig = math.hypot(c["lat"] - origin["lat"], c["lng"] - origin["lng"])
        d_dest = math.hypot(c["lat"] - destination["lat"], c["lng"] - destination["lng"])
        if d_orig > 0.004 and d_dest > 0.004:
            safe_candidates.append(c)

    safe_candidates.sort(key=lambda x: x.get("current_risk_score", 0), reverse=True)
    return safe_candidates[:max_hotspots]


def build_avoid_polygon(lat: float, lng: float, radius_deg: float = 0.005) -> List[List[float]]:
    """Build a square bounding polygon in GeoJSON [lng, lat] format."""
    return [
        [lng - radius_deg, lat - radius_deg],
        [lng + radius_deg, lat - radius_deg],
        [lng + radius_deg, lat + radius_deg],
        [lng - radius_deg, lat + radius_deg],
        [lng - radius_deg, lat - radius_deg],
    ]


async def query_ors(
    origin: Dict[str, float],
    destination: Dict[str, float],
    avoid_polygons: List[List[List[float]]],
) -> Optional[Dict[str, Any]]:
    """Query OpenRouteService directions with avoid_polygons."""
    api_key = settings.ORS_API_KEY.strip()
    if not api_key:
        logger.info("ORS_API_KEY is not configured. Skipping ORS call.")
        return None

    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json",
    }

    body: Dict[str, Any] = {
        "coordinates": [
            [origin["lng"], origin["lat"]],
            [destination["lng"], destination["lat"]],
        ],
    }

    if avoid_polygons:
        body["options"] = {
            "avoid_polygons": {
                "type": "MultiPolygon",
                "coordinates": [[poly] for poly in avoid_polygons],
            }
        }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(ORS_DIRECTIONS_URL, json=body, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                feature = data["features"][0]
                summary = feature["properties"]["summary"]
                coords = feature["geometry"]["coordinates"]
                return {
                    "provider": "OpenRouteService",
                    "distance_km": round(summary["distance"] / 1000.0, 2),
                    "duration_minutes": round(summary["duration"] / 60.0, 1),
                    "coordinates": coords,
                }
            else:
                logger.warning(f"ORS request returned {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.warning(f"ORS API request failed: {e}")

    return None


async def query_osrm_fallback(
    origin: Dict[str, float],
    destination: Dict[str, float],
    avoid_hotspots: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Fallback using public OSRM server with via-point detour trick
    to route traffic around flooded coordinate polygons.
    """
    mid_lat = (origin["lat"] + destination["lat"]) / 2.0
    mid_lng = (origin["lng"] + destination["lng"]) / 2.0

    # If there are hotspots to avoid, push the midpoint away from the nearest avoided hotspot
    if avoid_hotspots:
        h = avoid_hotspots[0]
        d_lat = mid_lat - h["lat"]
        d_lng = mid_lng - h["lng"]
        norm = math.hypot(d_lat, d_lng) or 1.0
        # Offset detour waypoint by ~1.5 - 2 km
        offset_deg = 0.016
        via_lat = round(mid_lat + (d_lat / norm) * offset_deg, 4)
        via_lng = round(mid_lng + (d_lng / norm) * offset_deg, 4)
        coord_str = f"{origin['lng']},{origin['lat']};{via_lng},{via_lat};{destination['lng']},{destination['lat']}"
    else:
        coord_str = f"{origin['lng']},{origin['lat']};{destination['lng']},{destination['lat']}"

    url = f"{OSRM_ROUTE_URL}/{coord_str}?overview=full&geometries=geojson"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    route = data["routes"][0]
    return {
        "provider": "OSRM fallback",
        "distance_km": round(route["distance"] / 1000.0, 2),
        "duration_minutes": round(route["duration"] / 60.0, 1),
        "coordinates": route["geometry"]["coordinates"],
    }


async def get_reroute(
    origin: Dict[str, float],
    destination: Dict[str, float],
    avoid_hotspot_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Calculate safe driving route avoiding waterlogged hotspots.
    Attempts OpenRouteService with avoid_polygons, falls back to OSRM.
    Results are cached in route_cache collection.
    """
    avoid_ids = sorted(avoid_hotspot_ids or [])
    cache_key = f"{round(origin['lat'],4)},{round(origin['lng'],4)}->{round(destination['lat'],4)},{round(destination['lng'],4)}|{','.join(avoid_ids)}"

    # 1. Check MongoDB route_cache
    try:
        coll = get_collection("route_cache")
        cached = await coll.find_one({"cache_key": cache_key})
        if cached:
            logger.info(f"Route cache HIT for {cache_key}")
            return cached["route_data"]
    except Exception as e:
        logger.warning(f"Route cache lookup error: {e}")
        coll = None

    # 2. Lookup avoided hotspots coordinates and build avoid polygons
    avoid_hotspots_info = []
    avoid_polygons = []

    if avoid_ids:
        for hs_id in avoid_ids:
            hs = await get_hotspot_coords(hs_id)
            if hs:
                avoid_hotspots_info.append(hs)
                poly = build_avoid_polygon(hs["lat"], hs["lng"])
                avoid_polygons.append(poly)
    else:
        # Auto-detect high-risk hotspots along route corridor
        corridor_hotspots = await get_corridor_high_risk_hotspots(origin, destination)
        for hs in corridor_hotspots:
            avoid_hotspots_info.append(hs)
            poly = build_avoid_polygon(hs["lat"], hs["lng"])
            avoid_polygons.append(poly)

    # 3. Try ORS with avoid_polygons first (Primary provider)
    route_res = None
    if avoid_polygons:
        route_res = await query_ors(origin, destination, avoid_polygons)
        # If avoid_polygons resulted in an unroutable path in ORS, try ORS direct
        if not route_res:
            logger.info("ORS with avoid_polygons returned no route, attempting ORS baseline...")
            route_res = await query_ors(origin, destination, avoid_polygons=[])

    if not route_res:
        route_res = await query_ors(origin, destination, avoid_polygons=[])

    # 4. Fallback to OSRM if ORS is unavailable or fails
    if not route_res:
        logger.info("Falling back to public OSRM server via-point detour...")
        route_res = await query_osrm_fallback(origin, destination, avoid_hotspots_info)

    # 5. Calculate direct baseline route for comparison (if we had avoid polygons)
    original_route_info = None
    if avoid_polygons:
        direct_ors = await query_ors(origin, destination, avoid_polygons=[])
        if direct_ors:
            original_route_info = direct_ors
        elif route_res.get("provider") == "OSRM fallback":
            try:
                direct_osrm = await query_osrm_fallback(origin, destination, avoid_hotspots=[])
                original_route_info = direct_osrm
            except Exception:
                pass

    avoided_names = [h["name"] for h in avoid_hotspots_info] or avoid_ids

    # Format simplified waypoints from full geometry
    full_coords = route_res.get("coordinates", [])
    step = max(1, len(full_coords) // 6)
    sampled_waypoints = [
        {"lat": pt[1], "lng": pt[0], "instruction": "En route safe corridor"}
        for pt in full_coords[::step]
    ]

    added_distance_km = 0.0
    added_duration_minutes = 0.0
    original_geometry = None
    original_dist = None
    original_dur = None

    if original_route_info:
        original_dist = original_route_info["distance_km"]
        original_dur = original_route_info["duration_minutes"]
        original_geometry = {
            "type": "LineString",
            "coordinates": original_route_info["coordinates"],
        }
        added_distance_km = round(max(0.0, route_res["distance_km"] - original_dist), 2)
        added_duration_minutes = round(max(0.0, route_res["duration_minutes"] - original_dur), 1)

    result = {
        "status": "success",
        "provider": route_res["provider"],
        "summary": f"Calculated alternate safe route avoiding {len(avoided_names)} flooded zones via {route_res['provider']}",
        "distance_km": route_res["distance_km"],
        "duration_minutes": route_res["duration_minutes"],
        "avoided_zones": avoided_names,
        "waypoints": sampled_waypoints,
        "geometry": {
            "type": "LineString",
            "coordinates": full_coords,
        },
        "original_geometry": original_geometry,
        "original_distance_km": original_dist,
        "original_duration_minutes": original_dur,
        "added_distance_km": added_distance_km,
        "added_duration_minutes": added_duration_minutes,
    }

    # 6. Save to route_cache
    if coll is not None:
        try:
            await coll.update_one(
                {"cache_key": cache_key},
                {
                    "$set": {
                        "cache_key": cache_key,
                        "route_data": result,
                        "created_at": datetime.utcnow(),
                    }
                },
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"Failed to cache route: {e}")

    return result
