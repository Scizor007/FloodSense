import logging
from pymongo import ASCENDING, DESCENDING
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("floodsense.db.indexes")

async def create_indexes(db: AsyncIOMotorDatabase):
    """Create indexes for FloodSense collections to support geographic and temporal queries."""
    if db is None:
        logger.warning("Skipping index creation: database is not connected.")
        return

    try:
        # Hotspots indexes
        hotspots = db["hotspots"]
        await hotspots.create_index([("name", ASCENDING)], unique=True)
        await hotspots.create_index([("lat", ASCENDING), ("lng", ASCENDING)])
        logger.info("Hotspots indexes verified.")

        # Rainfall cache indexes
        rainfall_cache = db["rainfall_cache"]
        await rainfall_cache.create_index(
            [("lat", ASCENDING), ("lng", ASCENDING), ("date", ASCENDING), ("source", ASCENDING)]
        )
        logger.info("Rainfall cache indexes verified.")

        # Reports indexes
        reports = db["reports"]
        await reports.create_index([("timestamp", DESCENDING)])
        await reports.create_index([("status", ASCENDING)])
        await reports.create_index([("lat", ASCENDING), ("lng", ASCENDING)])
        logger.info("Reports indexes verified.")

        # Alerts indexes
        alerts = db["alerts"]
        await alerts.create_index([("hotspot_id", ASCENDING)])
        await alerts.create_index([("sent_at", DESCENDING)])
        logger.info("Alerts indexes verified.")

        # Risk history indexes
        risk_history = db["risk_history"]
        await risk_history.create_index([("hotspot_id", ASCENDING), ("date", DESCENDING)])
        logger.info("Risk history indexes verified.")

        # Users indexes
        users = db["users"]
        await users.create_index([("role", ASCENDING)])
        logger.info("Users indexes verified.")

    except Exception as e:
        logger.error(f"Error ensuring database indexes: {type(e).__name__}")
