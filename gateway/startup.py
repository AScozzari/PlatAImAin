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

    # 6. Load Type B models concurrently
    tasks = []

    if settings.stt_enabled:
        logger.info("Queuing Faster-Whisper load...")
        from gateway.models.stt.faster_whisper_wrapper import FasterWhisperWrapper
        tasks.append(FasterWhisperWrapper.get_instance())

    if settings.tts_xtts_enabled:
        logger.info("Queuing XTTS V2 load...")
        from gateway.models.tts.xtts_wrapper import XTTSWrapper
        tasks.append(XTTSWrapper.get_instance())

    if settings.tts_kokoro_enabled:
        logger.info("Queuing Kokoro TTS load...")
        from gateway.models.tts.kokoro_wrapper import KokoroWrapper
        tasks.append(KokoroWrapper.get_instance())

    if settings.tts_stylett2_enabled:
        logger.info("Queuing StyleTTS2 load...")
        from gateway.models.tts.stylett2_wrapper import StyleTTS2Wrapper
        tasks.append(StyleTTS2Wrapper.get_instance())

    if tasks:
        logger.info("Loading %d Type B model(s) concurrently (this may take a while)...", len(tasks))
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, Exception):
                logger.error("Failed to load a Type B model: %s", result)

    _ready = True
    logger.info("Gateway ready — all models loaded")


async def shutdown() -> None:
    global _ready
    _ready = False
    logger.info("Shutting down...")

    from gateway.db.postgres import close_db
    from gateway.db.redis import close_redis
    await asyncio.gather(close_db(), close_redis(), return_exceptions=True)
    logger.info("Shutdown complete")
