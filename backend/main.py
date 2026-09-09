import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Ensure backend and project root are on sys.path for imports
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    from backend.config import settings
    from backend.db.mongodb import db_manager
    from backend.db.indexes import create_indexes
    from backend.routers import hotspots, risk, reports, routing, alerts, weather, elevation
    from backend.services.risk_model import load_model
except ImportError:
    from config import settings
    from db.mongodb import db_manager
    from db.indexes import create_indexes
    from routers import hotspots, risk, reports, routing, alerts, weather, elevation
    from services.risk_model import load_model

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("floodsense.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing FloodSense Hyderabad API...")
    await db_manager.connect()
    if db_manager.db is not None:
        await create_indexes(db_manager.db)

    # Pre-load risk prediction model
    load_model()
    yield
    # Shutdown
    logger.info("Shutting down FloodSense Hyderabad API...")
    await db_manager.close()


app = FastAPI(
    title="FloodSense Hyderabad API",
    description=(
        "Backend API for FloodSense Hyderabad: AI-powered urban flood prediction, "
        "hotspot monitoring, citizen reporting, and early warnings."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global Exception Handling
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


# Root Endpoint
@app.get("/", tags=["General"])
async def root():
    return {
        "status": "ok",
        "service": "FloodSense Hyderabad API",
    }


# Health Check Endpoint
@app.get("/health", tags=["General"])
async def health():
    is_connected = await db_manager.ping()
    return {
        "status": "ok",
        "api": "running",
        "mongodb": "connected" if is_connected else "disconnected",
        "database": settings.DATABASE_NAME,
    }


# Register Routers
app.include_router(hotspots.router)
app.include_router(risk.router)
app.include_router(weather.router)
app.include_router(elevation.router)
app.include_router(reports.router)
app.include_router(routing.router)
app.include_router(alerts.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)
