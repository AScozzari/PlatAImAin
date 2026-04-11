import logging
from typing import Optional

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

_redis: Optional[aioredis.Redis] = None

# Lua script: atomic check-then-increment for quota management
# Returns: [new_value, limit, allowed (1/0)]
QUOTA_LUA = """
local current = redis.call('GET', KEYS[1])
if current == false then current = 0 end
current = tonumber(current)
local limit = tonumber(ARGV[2])
local increment = tonumber(ARGV[1])
if limit > 0 and current + increment > limit then
  return {current, limit, 0}
end
local new_val = redis.call('INCRBY', KEYS[1], increment)
redis.call('EXPIRE', KEYS[1], 2678400)
return {new_val, limit, 1}
"""


async def init_redis(redis_url: str) -> None:
    global _redis
    _redis = aioredis.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True,
        max_connections=50,
    )
    await _redis.ping()
    logger.info("Redis connection established: %s", redis_url)


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None
        logger.info("Redis connection closed")


def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return _redis


async def get_str(key: str) -> Optional[str]:
    return await get_redis().get(key)


async def set_str(key: str, value: str, expire_seconds: int = 0) -> None:
    r = get_redis()
    if expire_seconds:
        await r.setex(key, expire_seconds, value)
    else:
        await r.set(key, value)


async def delete(key: str) -> int:
    return await get_redis().delete(key)


async def incr(key: str, expire_seconds: int = 3600) -> int:
    r = get_redis()
    pipe = r.pipeline()
    await pipe.incr(key)
    await pipe.expire(key, expire_seconds)
    results = await pipe.execute()
    return results[0]


async def quota_check_and_increment(
    key: str, increment: int, limit: int
) -> tuple[int, int, bool]:
    """
    Atomically check quota and increment if within limit.
    Returns (new_value, limit, allowed).
    limit=0 means unlimited.
    """
    r = get_redis()
    result = await r.eval(QUOTA_LUA, 1, key, increment, limit)
    new_val, lim, allowed = int(result[0]), int(result[1]), bool(result[2])
    return new_val, lim, allowed


async def get_quota_usage(key: str) -> int:
    val = await get_redis().get(key)
    return int(val) if val else 0


async def ping() -> bool:
    try:
        return await get_redis().ping()
    except Exception:
        return False
