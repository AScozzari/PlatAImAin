import asyncpg
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None


async def init_db(database_url: str, min_size: int = 5, max_size: int = 20) -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        database_url,
        min_size=min_size,
        max_size=max_size,
        command_timeout=60,
    )
    logger.info("PostgreSQL pool created (min=%d, max=%d)", min_size, max_size)
    await _run_migrations()


async def _run_migrations() -> None:
    migrations_dir = Path(__file__).parent.parent.parent / "migrations"
    migration_files = sorted(migrations_dir.glob("*.sql"))

    async with get_connection() as conn:
        for migration_file in migration_files:
            logger.info("Running migration: %s", migration_file.name)
            sql = migration_file.read_text(encoding="utf-8")
            await conn.execute(sql)

    logger.info("All migrations applied successfully")


async def close_db() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("PostgreSQL pool closed")


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_db() first.")
    return _pool


@asynccontextmanager
async def get_connection():
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn


async def execute(query: str, *args: Any) -> str:
    async with get_connection() as conn:
        return await conn.execute(query, *args)


async def executemany(query: str, args: list) -> None:
    async with get_connection() as conn:
        await conn.executemany(query, args)


async def fetch(query: str, *args: Any) -> list[asyncpg.Record]:
    async with get_connection() as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args: Any) -> Optional[asyncpg.Record]:
    async with get_connection() as conn:
        return await conn.fetchrow(query, *args)


async def fetchval(query: str, *args: Any) -> Any:
    async with get_connection() as conn:
        return await conn.fetchval(query, *args)
