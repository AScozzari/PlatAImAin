import asyncio
import logging

logger = logging.getLogger(__name__)

_ready = False


def is_ready() -> bool:
    return _ready


async def initialize() -> None:
    global _ready
    from gateway.config.settings import get_settings
    settings = get_settings()

    # 1. Init PostgreSQL
    logger.info("Initializing PostgreSQL...")
    from gateway.db.postgres import init_db
    await init_db(settings.database_url, settings.db_pool_min, settings.db_pool_max)

    # 2. Init Redis
    logger.info("Initializing Redis...")
    from gateway.db.redis import init_redis
    await init_redis(settings.redis_url)

    # 3. Load models.config.json → ModelRouter
    logger.info("Loading ModelRouter from %s...", settings.models_config_path)
    from gateway.services.router import init_router
    init_router(settings.models_config_path, settings=settings)

    # 4. Sync models config to DB
    logger.info("Syncing models to database...")
    from gateway.routes.admin.models_admin import sync_models_to_db
    count = await sync_models_to_db()
    logger.info("Synced %d models to DB", count)

    # 5. Run DB pricing seed if needed
    from gateway.db.postgres import fetchval
    pricing_count = await fetchval("SELECT COUNT(*) FROM model_pricing")
    if pricing_count == 0:
        logger.info("Running pricing seed...")
        from pathlib import Path
        seed_sql = (Path(__file__).parent.parent / "migrations" / "002_seed_pricing.sql").read_text()
        from gateway.db.postgres import execute
        await execute(seed_sql)

    # 6. Init Session Manager (round-robin load balancing across model sessions)
    logger.info("Initializing Session Manager...")
    from gateway.db.postgres import get_pool
    from gateway.db.redis import get_redis
    from gateway.services import session_manager
    await session_manager.init(get_pool(), get_redis())

    _ready = True
    logger.info("Gateway ready — pure HTTP proxy, no embedded models")


async def shutdown() -> None:
    global _ready
    _ready = False
    logger.info("Shutting down...")

    from gateway.services import session_manager
    await session_manager.shutdown()

    from gateway.db.postgres import close_db
    from gateway.db.redis import close_redis
    await asyncio.gather(close_db(), close_redis(), return_exceptions=True)
    logger.info("Shutdown complete")
