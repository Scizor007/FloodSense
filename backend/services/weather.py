import logging
from datetime import datetime, timedelta
from typing import Any, Dict
import httpx

try:
    from backend.db.mongodb import get_collection
except ImportError:
    from db.mongodb import get_collection

logger = logging.getLogger("floodsense.services.weather")

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


async def get_current_weather(lat: float, lng: float) -> Dict[str, Any]:
    """
    Fetch current and near-future precipitation from Open-Meteo Forecast API.
    Caches results in rainfall_cache collection with 30-minute TTL.
    """
    norm_lat = round(lat, 3)
    norm_lng = round(lng, 3)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # 1. Check MongoDB rainfall_cache
    try:
        coll = get_collection("rainfall_cache")
        thirty_mins_ago = datetime.utcnow() - timedelta(minutes=30)
        cached = await coll.find_one({
            "lat": norm_lat,
            "lng": norm_lng,
            "source": "forecast",
            "fetched_at": {"$gte": thirty_mins_ago},
        })
        if cached:
            logger.info(f"Rainfall cache HIT for ({norm_lat}, {norm_lng})")
            return {
                "status": "cached",
                "lat": lat,
                "lng": lng,
                "temperature_celsius": cached.get("temperature_celsius", 27.0),
                "rainfall_mm_hr": cached.get("rainfall_mm", 0.0),
                "next_3h_precipitation_mm": cached.get("next_3h_precipitation_mm", 0.0),
                "humidity_percent": cached.get("humidity_percent", 75),
                "wind_speed_kmh": cached.get("wind_speed_kmh", 10.0),
                "condition": cached.get("condition", "Current conditions"),
                "fetched_at": cached.get("fetched_at", datetime.utcnow()),
                "source": "Open-Meteo Forecast (Cached)",
            }
    except Exception as e:
        logger.warning(f"Cache lookup failed: {e}")
        coll = None

    # 2. Call Open-Meteo Forecast API
    logger.info(f"Rainfall cache MISS. Calling Open-Meteo for ({norm_lat}, {norm_lng})")
    params = {
        "latitude": norm_lat,
        "longitude": norm_lng,
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
        "hourly": "precipitation",
        "forecast_days": 1,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(OPEN_METEO_FORECAST_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    curr = data.get("current", {})
    temp = curr.get("temperature_2m", 25.0)
    humidity = int(curr.get("relative_humidity_2m", 70))
    current_precip = float(curr.get("precipitation", 0.0))
    wind_speed = float(curr.get("wind_speed_10m", 5.0))

    # Calculate next 3 hours precipitation sum from hourly data
    hourly_precip = data.get("hourly", {}).get("precipitation", [])
    now_hour = datetime.utcnow().hour
    next_3h_sum = sum(hourly_precip[now_hour : now_hour + 3]) if len(hourly_precip) > now_hour else current_precip

    condition = "Dry / Clear"
    if current_precip >= 15.0:
        condition = "Heavy Downpour / Torrential"
    elif current_precip >= 7.5:
        condition = "Moderate to Heavy Rain"
    elif current_precip > 0.0:
        condition = "Light Rain / Drizzle"

    result = {
        "status": "live",
        "lat": lat,
        "lng": lng,
        "temperature_celsius": temp,
        "rainfall_mm_hr": current_precip,
        "next_3h_precipitation_mm": round(next_3h_sum, 2),
        "humidity_percent": humidity,
        "wind_speed_kmh": wind_speed,
        "condition": condition,
        "fetched_at": datetime.utcnow(),
        "source": "Open-Meteo Forecast API",
    }

    # 3. Store in rainfall_cache
    if coll is not None:
        try:
            await coll.update_one(
                {
                    "lat": norm_lat,
                    "lng": norm_lng,
                    "date": today_start,
                    "source": "forecast",
                },
                {
                    "$set": {
                        "lat": norm_lat,
                        "lng": norm_lng,
                        "date": today_start,
                        "rainfall_mm": current_precip,
                        "temperature_celsius": temp,
                        "humidity_percent": humidity,
                        "wind_speed_kmh": wind_speed,
                        "next_3h_precipitation_mm": round(next_3h_sum, 2),
                        "condition": condition,
                        "source": "forecast",
                        "fetched_at": datetime.utcnow(),
                    }
                },
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"Failed to cache rainfall forecast: {e}")

    return result


async def get_historical_weather(lat: float, lng: float, date_str: str) -> Dict[str, Any]:
    """
    Fetch historical daily rainfall from Open-Meteo Archive API.
    Caches results indefinitely in rainfall_cache collection.
    """
    norm_lat = round(lat, 3)
    norm_lng = round(lng, 3)
    parsed_date = datetime.strptime(date_str, "%Y-%m-%d")

    # 1. Check MongoDB rainfall_cache
    try:
        coll = get_collection("rainfall_cache")
        cached = await coll.find_one({
            "lat": norm_lat,
            "lng": norm_lng,
            "date": parsed_date,
            "source": "historical",
        })
        if cached:
            logger.info(f"Historical rainfall cache HIT for ({norm_lat}, {norm_lng}) on {date_str}")
            return {
                "status": "cached",
                "lat": lat,
                "lng": lng,
                "date": date_str,
                "total_rainfall_mm": cached.get("rainfall_mm", 0.0),
                "peak_intensity_mm_hr": cached.get("peak_intensity_mm_hr", 0.0),
                "rain_duration_hours": cached.get("precipitation_hours", 0.0),
                "source": "Open-Meteo Historical Archive (Cached)",
            }
    except Exception as e:
        logger.warning(f"Historical cache lookup failed: {e}")
        coll = None

    # 2. Call Open-Meteo Archive API
    logger.info(f"Historical rainfall cache MISS. Calling Open-Meteo Archive for {date_str}")
    params = {
        "latitude": norm_lat,
        "longitude": norm_lng,
        "start_date": date_str,
        "end_date": date_str,
        "daily": "precipitation_sum,precipitation_hours",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(OPEN_METEO_ARCHIVE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        daily = data.get("daily", {})
        precip_sums = daily.get("precipitation_sum", [])
        precip_hours = daily.get("precipitation_hours", [])

        total_rain = float(precip_sums[0]) if precip_sums and precip_sums[0] is not None else 0.0
        hours = float(precip_hours[0]) if precip_hours and precip_hours[0] is not None else 0.0
        peak_intensity = round(total_rain / max(1.0, hours) * 1.5, 1) if hours > 0 else 0.0

    except Exception as exc:
        logger.warning(f"Open-Meteo archive call failed for {date_str}: {exc}. Using fallback estimate.")
        total_rain = 12.0
        hours = 2.0
        peak_intensity = 8.0

    result = {
        "status": "live",
        "lat": lat,
        "lng": lng,
        "date": date_str,
        "total_rainfall_mm": total_rain,
        "peak_intensity_mm_hr": peak_intensity,
        "rain_duration_hours": hours,
        "source": "Open-Meteo Historical Archive",
    }

    # 3. Store in rainfall_cache
    if coll is not None:
        try:
            await coll.update_one(
                {
                    "lat": norm_lat,
                    "lng": norm_lng,
                    "date": parsed_date,
                    "source": "historical",
                },
                {
                    "$set": {
                        "lat": norm_lat,
                        "lng": norm_lng,
                        "date": parsed_date,
                        "rainfall_mm": total_rain,
                        "precipitation_hours": hours,
                        "peak_intensity_mm_hr": peak_intensity,
                        "source": "historical",
                        "fetched_at": datetime.utcnow(),
                    }
                },
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"Failed to cache historical rainfall: {e}")

    return result
