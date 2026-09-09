from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Query, HTTPException, status

try:
    from backend.services.weather import get_current_weather, get_historical_weather
except ImportError:
    from services.weather import get_current_weather, get_historical_weather

router = APIRouter(prefix="/weather", tags=["Weather"])


class CurrentWeatherResponse(BaseModel):
    status: str
    lat: float
    lng: float
    temperature_celsius: float
    rainfall_mm_hr: float
    next_3h_precipitation_mm: float
    humidity_percent: int
    wind_speed_kmh: float
    condition: str
    fetched_at: datetime
    source: str


class HistoricalWeatherResponse(BaseModel):
    status: str
    lat: float
    lng: float
    date: str
    total_rainfall_mm: float
    peak_intensity_mm_hr: float
    rain_duration_hours: float
    source: str


@router.get("/current", response_model=CurrentWeatherResponse)
async def fetch_current_weather(
    lat: float = Query(default=17.3850, description="Latitude (default: Hyderabad center)"),
    lng: float = Query(default=78.4867, description="Longitude (default: Hyderabad center)"),
):
    """
    Fetch live or cached current weather conditions and near-future precipitation
    from the Open-Meteo Forecast API.
    """
    try:
        data = await get_current_weather(lat=lat, lng=lng)
        return CurrentWeatherResponse(**data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve current weather: {str(e)}",
        )


@router.get("/historical", response_model=HistoricalWeatherResponse)
async def fetch_historical_weather(
    lat: float = Query(default=17.3850, description="Latitude"),
    lng: float = Query(default=78.4867, description="Longitude"),
    date: str = Query(default="2024-08-15", description="Date in YYYY-MM-DD format"),
):
    """
    Fetch historical daily rainfall and peak intensity from the Open-Meteo Archive API.
    """
    try:
        data = await get_historical_weather(lat=lat, lng=lng, date_str=date)
        return HistoricalWeatherResponse(**data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve historical weather: {str(e)}",
        )
