import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

try:
    from config import settings
except ImportError:
    from backend.config import settings

logger = logging.getLogger("floodsense.db")

class MongoDBManager:
    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None

    async def connect(self):
        if not settings.MONGODB_URL:
            logger.warning("MONGODB_URL is not set. Database operations will fail.")
            return

        try:
            self.client = AsyncIOMotorClient(
                settings.MONGODB_URL,
                serverSelectionTimeoutMS=5000,
            )
            self.db = self.client[settings.DATABASE_NAME]
            # Ping to verify active connection
            await self.client.admin.command("ping")
            logger.info("Successfully connected to MongoDB Atlas.")
        except Exception:
            logger.error("Could not connect to MongoDB Atlas. Please check credentials or network.")
            # Note: We do NOT re-raise with string representations to prevent leaking credentials

    async def close(self):
        if self.client:
            self.client.close()
            self.client = None
            self.db = None
            logger.info("Closed MongoDB Atlas connection.")

    async def ping(self) -> bool:
        if not self.client:
            return False
        try:
            await self.client.admin.command("ping")
            return True
        except Exception:
            return False

    def get_collection(self, name: str):
        if self.db is None:
            raise RuntimeError("Database connection is not initialized.")
        return self.db[name]

db_manager = MongoDBManager()

def get_database() -> Optional[AsyncIOMotorDatabase]:
    return db_manager.db

def get_collection(name: str):
    return db_manager.get_collection(name)
