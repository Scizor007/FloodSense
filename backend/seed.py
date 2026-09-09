import asyncio
import sys
from datetime import datetime
from pathlib import Path

# Ensure backend directory is in python path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

try:
    from config import settings
    from db.mongodb import db_manager
    from db.indexes import create_indexes
    from data.hotspots_seed import HOTSPOTS_SEED_DATA
except ImportError:
    from backend.config import settings
    from backend.db.mongodb import db_manager
    from backend.db.indexes import create_indexes
    from backend.data.hotspots_seed import HOTSPOTS_SEED_DATA


async def seed_hotspots():
    print(f"Connecting to MongoDB database: '{settings.DATABASE_NAME}'...")
    await db_manager.connect()

    if db_manager.db is None:
        print("ERROR: Could not connect to MongoDB Atlas. Check MONGODB_URL in your .env file.")
        sys.exit(1)

    print("Ensuring collection indexes...")
    await create_indexes(db_manager.db)

    collection = db_manager.get_collection("hotspots")
    now = datetime.utcnow()

    upserted_count = 0
    updated_count = 0

    for spot in HOTSPOTS_SEED_DATA:
        record = dict(spot)
        record["last_updated"] = now

        result = await collection.update_one(
            {"name": record["name"]},
            {"$set": record},
            upsert=True,
        )

        if result.upserted_id:
            upserted_count += 1
        elif result.modified_count > 0:
            updated_count += 1

    total_in_db = await collection.count_documents({})
    print(f"Seeding complete!")
    print(f" - New hotspots inserted: {upserted_count}")
    print(f" - Existing hotspots updated: {updated_count}")
    print(f" - Total hotspots now in collection: {total_in_db}")

    await db_manager.close()


if __name__ == "__main__":
    asyncio.run(seed_hotspots())
