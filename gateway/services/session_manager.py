"""
Session Manager — round-robin load balancing across model_sessions.

Each model can have 1..N registered sessions (backend URLs pointing at
vLLM / stt-service / tts-service instances). The manager:

  - Caches active backend URLs in Redis for 30 s (key: sm:backends:{model_id})
  - Picks the next backend with an atomic Redis INCR (key: lb:{model_id})
  - Skips unhealthy backends detected by a background health-check loop
  - Falls back to legacy env-var URLs if no sessions are registered in DB
"""

import asyncio
import json
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Redis key prefixes
_KEY_BACKENDS = "sm:backends:{model_id}"   # JSON list of URLs
_KEY_COUNTER  = "lb:{model_id}"            # INCR counter for round-robin
_CACHE_TTL    = 30                         # seconds

# Category → legacy env-var fallback (backward compat when no sessions in DB)
_LEGACY_ENV: dict[str, str] = {
    "llm":       "VLLM_LLM_URL",
    "reasoning": "VLLM_LLM_URL",
    "coding":    "VLLM_CODING_URL",
    "vision":    "VLLM_VISION_URL",
    "embedding": "VLLM_EMBEDDING_URL",
    "stt":       "STT_SERVICE_URL",
    "tts":       "TTS_SERVICE_URL",
}

_db = None       # asyncpg pool (set by init())
_redis = None    # redis.asyncio client (set by init())
_http: Optional[httpx.AsyncClient] = None
_health_task: Optional[asyncio.Task] = None


async def init(db, redis) -> None:
    """Called from startup.py. Inject DB pool and Redis client."""
    global _db, _redis, _http, _health_task
    _db = db
    _redis = redis
    _http = httpx.AsyncClient(timeout=3.0)
    await _warm_cache()
    _health_task = asyncio.create_task(_health_loop())
    logger.info("SessionManager initialised")


async def shutdown() -> None:
    global _health_task, _http
    if _health_task:
        _health_task.cancel()
        try:
            await _health_task
        except asyncio.CancelledError:
            pass
    if _http:
        await _http.aclose()


# ─── Public API ───────────────────────────────────────────────────────────────

async def get_active_backends(model_id: str) -> list[str]:
    """Return list of running backend URLs for model_id (may be empty)."""
    cached = await _get_cached(model_id)
    if cached is not None:
        return cached
    return await _fetch_and_cache(model_id)


async def next_backend(model_id: str, category: Optional[str] = None) -> Optional[str]:
    """
    Round-robin pick of the next healthy backend.
    Falls back to legacy env-var URL if no sessions registered.
    Returns None if nothing is available.
    """
    backends = await get_active_backends(model_id)

    if not backends:
        # Fallback: legacy env var for category
        if category:
            env_key = _LEGACY_ENV.get(category)
            if env_key:
                url = os.environ.get(env_key)
                if url:
                    return url.rstrip("/")
        return None

    if len(backends) == 1:
        return backends[0]

    # Atomic INCR for round-robin
    key = _KEY_COUNTER.format(model_id=model_id)
    idx = await _redis.incr(key)
    return backends[(idx - 1) % len(backends)]


async def count_running(model_id: str) -> int:
    backends = await get_active_backends(model_id)
    return len(backends)


async def register_session(
    model_id: str,
    backend_url: str,
    gpu_ids: list[str],
    tensor_parallel_size: int = 1,
    max_model_len: Optional[int] = None,
    started_by: Optional[str] = None,
    extra_config: Optional[dict] = None,
) -> dict:
    """Insert a new model_session row with status=running."""
    row = await _db.fetchrow(
        """
        INSERT INTO model_sessions
            (model_id, backend_url, gpu_ids, status,
             tensor_parallel_size, max_model_len,
             started_at, started_by, extra_config)
        VALUES
            ($1, $2, $3, 'running',
             $4, $5,
             NOW(), $6, $7)
        RETURNING *
        """,
        model_id,
        backend_url.rstrip("/"),
        gpu_ids,
        tensor_parallel_size,
        max_model_len,
        started_by,
        json.dumps(extra_config or {}),
    )
    await _invalidate_cache(model_id)
    return dict(row)


async def stop_session(session_id: str) -> Optional[dict]:
    row = await _db.fetchrow(
        """
        UPDATE model_sessions
        SET status='stopped', stopped_at=NOW(), updated_at=NOW()
        WHERE id=$1
        RETURNING *
        """,
        session_id,
    )
    if row:
        await _invalidate_cache(row["model_id"])
    return dict(row) if row else None


async def delete_session(session_id: str) -> bool:
    result = await _db.execute(
        "DELETE FROM model_sessions WHERE id=$1", session_id
    )
    return result == "DELETE 1"


async def update_session_status(session_id: str, status: str) -> Optional[dict]:
    row = await _db.fetchrow(
        """
        UPDATE model_sessions
        SET status=$2, updated_at=NOW()
        WHERE id=$1
        RETURNING *
        """,
        session_id,
        status,
    )
    if row:
        await _invalidate_cache(row["model_id"])
    return dict(row) if row else None


async def list_sessions(model_id: Optional[str] = None) -> list[dict]:
    if model_id:
        rows = await _db.fetch(
            "SELECT * FROM model_sessions WHERE model_id=$1 ORDER BY created_at DESC",
            model_id,
        )
    else:
        rows = await _db.fetch(
            "SELECT * FROM model_sessions ORDER BY model_id, created_at DESC"
        )
    return [dict(r) for r in rows]


async def get_session(session_id: str) -> Optional[dict]:
    row = await _db.fetchrow(
        "SELECT * FROM model_sessions WHERE id=$1", session_id
    )
    return dict(row) if row else None


# ─── Internal helpers ─────────────────────────────────────────────────────────

async def _get_cached(model_id: str) -> Optional[list[str]]:
    if not _redis:
        return None
    key = _KEY_BACKENDS.format(model_id=model_id)
    val = await _redis.get(key)
    if val is None:
        return None
    return json.loads(val)


async def _fetch_and_cache(model_id: str) -> list[str]:
    if not _db:
        return []
    rows = await _db.fetch(
        "SELECT backend_url FROM model_sessions WHERE model_id=$1 AND status='running'",
        model_id,
    )
    backends = [r["backend_url"] for r in rows]
    if _redis:
        key = _KEY_BACKENDS.format(model_id=model_id)
        await _redis.setex(key, _CACHE_TTL, json.dumps(backends))
    return backends


async def _invalidate_cache(model_id: str) -> None:
    if _redis:
        key = _KEY_BACKENDS.format(model_id=model_id)
        await _redis.delete(key)


async def _warm_cache() -> None:
    """Pre-warm cache for all models that have running sessions."""
    if not _db:
        return
    rows = await _db.fetch(
        "SELECT DISTINCT model_id FROM model_sessions WHERE status='running'"
    )
    for row in rows:
        await _fetch_and_cache(row["model_id"])
    logger.info("SessionManager cache warmed for %d models", len(rows))


async def _check_backend_health(url: str) -> bool:
    if not _http:
        return True
    try:
        r = await _http.get(f"{url}/health", timeout=3.0)
        return r.status_code < 500
    except Exception:
        return False


async def _health_loop() -> None:
    """Every 30 s: check all running sessions, mark errors, refresh cache."""
    while True:
        try:
            await asyncio.sleep(30)
            await _run_health_checks()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("SessionManager health-loop error: %s", e)


async def _run_health_checks() -> None:
    if not _db:
        return
    rows = await _db.fetch(
        "SELECT id, model_id, backend_url FROM model_sessions WHERE status='running'"
    )
    for row in rows:
        healthy = await _check_backend_health(row["backend_url"])
        if not healthy:
            logger.warning(
                "Session %s (%s @ %s) failed health check — marking error",
                row["id"], row["model_id"], row["backend_url"],
            )
            await _db.execute(
                "UPDATE model_sessions SET status='error', updated_at=NOW() WHERE id=$1",
                row["id"],
            )
            await _invalidate_cache(row["model_id"])
