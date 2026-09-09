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


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two points in kilometers."""
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


_DISPATCHED_EMAIL_KEYS: Dict[str, datetime] = {}


async def evaluate_route_flood_risk(
    coordinates: List[List[float]],
    rainfall_intensity: float = 40.0,
    duration_minutes: int = 60,
) -> Dict[str, Any]:
    """
    Evaluates whether points along route coordinates [ [lng, lat], ... ]
    fall inside or close to (<= 350m) high/severe predicted-risk areas or documented flood hotspots.
    """
    if not coordinates or len(coordinates) < 2:
        return {
            "exposure_level": "NONE",
            "max_risk_score": 0.0,
            "affected_zones": [],
            "is_hazard": False,
            "warning_message": "✓ Route currently clear of high/severe flood-risk zones.",
        }

    # Sample points along the route corridor (~25-35 points)
    total_pts = len(coordinates)
    step = max(1, total_pts // 30)
    sampled = coordinates[::step]
    if coordinates[-1] not in sampled:
        sampled.append(coordinates[-1])

    # Fetch active hotspots from DB or seed
    all_hotspots = []
    try:
        coll = get_collection("hotspots")
        docs = await coll.find({}).to_list(length=100)
        if docs:
            all_hotspots = docs
    except Exception:
        pass
    if not all_hotspots:
        all_hotspots = HOTSPOTS_SEED_DATA

    affected_hotspots: Dict[str, float] = {}
    max_risk_score = 0.0

    for pt in sampled:
        pt_lng, pt_lat = pt[0], pt[1]

        # Check proximity to known hotspots
        for hs in all_hotspots:
            dist = haversine_km(pt_lat, pt_lng, hs["lat"], hs["lng"])
            hs_risk = float(hs.get("current_risk_score", 50.0))
            hs_tag = hs.get("severity_tag", "moderate")

            # Route point is within 450 meters of waterlogging hotspot
            if dist <= 0.45:
                if hs_risk >= 50.0 or hs_tag in ["major", "severe", "recurrent"]:
                    affected_hotspots[hs["name"]] = max(affected_hotspots.get(hs["name"], 0.0), hs_risk)
                    elev = float(hs.get("elevation", 500.0))
                    elev_score = max(0.0, min(1.0, (610.0 - elev) / 130.0))
                    rain_score = min(1.0, rainfall_intensity / 60.0)
                    prox_score = max(0.0, 1.0 - (dist / 0.8)) * (hs_risk / 100.0)
                    physics_score = ((0.40 * rain_score) + (0.35 * elev_score) + (0.25 * prox_score)) * 100.0
                    max_risk_score = max(max_risk_score, hs_risk, physics_score)

    affected_zone_names = list(affected_hotspots.keys())

    if max_risk_score >= 75.0:
        exposure_level = "SEVERE"
        is_hazard = True
        zone_str = f" ({', '.join(affected_zone_names[:2])})" if affected_zone_names else ""
        warning_msg = f"⚠️ CRITICAL FLOOD RISK AHEAD: Your selected route passes through a severe waterlogging region{zone_str}. Consider an alternate route."
    elif max_risk_score >= 50.0 or len(affected_zone_names) > 0:
        exposure_level = "HIGH"
        is_hazard = True
        zone_str = f" ({', '.join(affected_zone_names[:2])})" if affected_zone_names else ""
        warning_msg = f"⚠️ FLOOD RISK AHEAD: Your selected route passes through a high-risk waterlogging region{zone_str}. Consider an alternate route."
    elif max_risk_score >= 25.0:
        exposure_level = "MODERATE"
        is_hazard = False
        warning_msg = "Route passes near moderate waterlogging. Drive with caution."
    else:
        exposure_level = "NONE"
        is_hazard = False
        warning_msg = "✓ Route currently clear of high/severe flood-risk zones."

    return {
        "exposure_level": exposure_level,
        "max_risk_score": round(max_risk_score, 1),
        "affected_zones": affected_zone_names,
        "is_hazard": is_hazard,
        "warning_message": warning_msg,
    }


async def get_reroute(
    origin: Dict[str, float],
    destination: Dict[str, float],
    avoid_hotspot_ids: Optional[List[str]] = None,
    check_flood_risk: bool = True,
    send_email_alert: bool = False,
) -> Dict[str, Any]:
    """
    Calculate safe driving route avoiding waterlogged hotspots.
    Attempts OpenRouteService with avoid_polygons, falls back to OSRM.
    Results are checked for flood risk exposure and optional SMTP email dispatch.
    """
    avoid_ids = sorted(avoid_hotspot_ids or [])
    cache_key = f"{round(origin['lat'],4)},{round(origin['lng'],4)}->{round(destination['lat'],4)},{round(destination['lng'],4)}|{','.join(avoid_ids)}"

    # 1. Check MongoDB route_cache (only if not dispatching email alert)
    if not send_email_alert:
        try:
            coll = get_collection("route_cache")
            cached = await coll.find_one({"cache_key": cache_key})
            if cached:
                logger.info(f"Route cache HIT for {cache_key}")
                return cached["route_data"]
        except Exception as e:
            logger.warning(f"Route cache lookup error: {e}")
            coll = None
    else:
        try:
            coll = get_collection("route_cache")
        except Exception:
            coll = None

    # 2. Lookup avoided hotspots coordinates and build avoid polygons
    avoid_hotspots_info = []
    avoid_polygons = []

    if avoid_hotspot_ids is not None:
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

    # 6. Evaluate route flood risk and dispatch safety alerts if requested
    exposure_level = "NONE"
    max_risk_score = 0.0
    affected_zones: List[str] = []
    is_hazard = False
    warning_message = "✓ Route currently clear of high/severe flood-risk zones."
    alert_triggered = False
    email_sent = False
    email_status = None

    if check_flood_risk and full_coords:
        risk_eval = await evaluate_route_flood_risk(full_coords)
        exposure_level = risk_eval["exposure_level"]
        max_risk_score = risk_eval["max_risk_score"]
        affected_zones = risk_eval["affected_zones"]
        is_hazard = risk_eval["is_hazard"]
        warning_message = risk_eval["warning_message"]

        # Also check if baseline corridor had severe hotspots when detour was applied
        if not is_hazard and avoided_names and original_geometry:
            baseline_eval = await evaluate_route_flood_risk(original_geometry["coordinates"])
            if baseline_eval["is_hazard"]:
                warning_message = f"✓ Alternate route successfully bypasses flooded corridor ({', '.join(avoided_names[:2])})."

        if is_hazard:
            alert_triggered = True
            if send_email_alert:
                dispatch_key = f"{round(origin['lat'], 3)},{round(origin['lng'], 3)}->{round(destination['lat'], 3)},{round(destination['lng'], 3)}"
                now = datetime.utcnow()
                last_sent = _DISPATCHED_EMAIL_KEYS.get(dispatch_key)
                if last_sent and (now - last_sent).total_seconds() < 180:
                    email_sent = True
                    email_status = "Alert email already sent for this route"
                else:
                    try:
                        from backend.services.email import send_flood_route_alert_email
                    except ImportError:
                        from services.email import send_flood_route_alert_email

                    start_str = f"{origin['lat']:.4f}°N, {origin['lng']:.4f}°E"
                    dest_str = f"{destination['lat']:.4f}°N, {destination['lng']:.4f}°E"

                    success, msg = await send_flood_route_alert_email(
                        start_str=start_str,
                        dest_str=dest_str,
                        risk_level=exposure_level,
                        risk_score=max_risk_score,
                        affected_zones=affected_zones,
                        distance_km=route_res["distance_km"],
                        duration_minutes=route_res["duration_minutes"],
                    )
                    if success:
                        _DISPATCHED_EMAIL_KEYS[dispatch_key] = now
                        email_sent = True
                        email_status = "Alert email sent"
                    else:
                        email_sent = False
                        email_status = "Flood warning detected, but email delivery failed"

    result = {
        "status": "success",
        "provider": route_res["provider"],
        "summary": f"Calculated safe route via {route_res['provider']}",
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
        "exposure_level": exposure_level,
        "max_risk_score": max_risk_score,
        "affected_zones": affected_zones,
        "is_hazard": is_hazard,
        "warning_message": warning_message,
        "alert_triggered": alert_triggered,
        "email_sent": email_sent,
        "email_status": email_status,
    }

    # 7. Save to route_cache
    if coll is not None and not send_email_alert:
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

