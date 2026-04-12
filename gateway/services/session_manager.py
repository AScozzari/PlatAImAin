"""
Session Manager — orchestratore pod RunPod + session affinity.

Logica di routing `next_backend()`:
  1. Se conversation_id → cerca conversation_workers → pod pinned
  2. Altrimenti: query pod_definitions ordinati per priority ASC
     - session_type=persistent → usa se running; avvia se stopped
     - session_type=idle       → usa se running; avvia se stopped (cold start)
     - session_type=fallback   → usa solo se tutti i precedenti sono saturi/errore
     - session_type=scheduled  → usa solo se nella finestra cron corrente
  3. Saturazione detection: GET /metrics → vllm:num_requests_waiting > threshold
  4. Legacy fallback: env var VLLM_LLM_URL ecc.

Background tasks:
  - _health_loop():    ogni 30s → health check pod running, marca error
  - _idle_loop():      ogni 5min → ferma pod idle > timeout
  - _schedule_loop():  ogni 60s → avvia/ferma pod scheduled per cron
  - _prewarm_loop():   ogni 60s → pre-avvia pod scheduled N min prima
"""

import asyncio
import json
import logging
import os
import uuid
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Redis key prefixes
_KEY_BACKENDS = "sm:backends:{model_id}"
_CACHE_TTL    = 30

# Category → legacy env-var fallback
_LEGACY_ENV: dict[str, str] = {
    "llm":       "VLLM_LLM_URL",
    "reasoning": "VLLM_LLM_URL",
    "coding":    "VLLM_CODING_URL",
    "vision":    "VLLM_VISION_URL",
    "embedding": "VLLM_EMBEDDING_URL",
    "stt":       "STT_SERVICE_URL",
    "tts":       "TTS_SERVICE_URL",
}

_db    = None
_redis = None
_http: Optional[httpx.AsyncClient]   = None
_health_task: Optional[asyncio.Task] = None
_idle_task:   Optional[asyncio.Task] = None
_schedule_task: Optional[asyncio.Task] = None
_prewarm_task:  Optional[asyncio.Task] = None
_settings = None


# ─── Init / Shutdown ──────────────────────────────────────────────────────────

async def init(db, redis) -> None:
    global _db, _redis, _http, _health_task, _idle_task, _schedule_task, _prewarm_task, _settings
    _db    = db
    _redis = redis
    _http  = httpx.AsyncClient(timeout=3.0)

    from gateway.config.settings import get_settings
    _settings = get_settings()

    await _warm_cache()

    _health_task   = asyncio.create_task(_health_loop())
    _idle_task     = asyncio.create_task(_idle_loop())
    _schedule_task = asyncio.create_task(_schedule_loop())
    _prewarm_task  = asyncio.create_task(_prewarm_loop())

    logger.info("SessionManager initialised (pod_definitions-based)")


async def shutdown() -> None:
    for task in (_health_task, _idle_task, _schedule_task, _prewarm_task):
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    if _http:
        await _http.aclose()


# ─── Public API ───────────────────────────────────────────────────────────────

async def next_backend(
    model_id: str,
    category: Optional[str] = None,
    conversation_id: Optional[str] = None,
) -> Optional[str]:
    """
    Return the best backend URL for the request.
    Handles session affinity, pod lifecycle, and legacy fallback.
    """
    # 1. Session affinity: if conversation_id pinned → use its pod
    if conversation_id:
        model_class = _category_to_class(category)
        pinned_url = await _get_pinned_backend(conversation_id, model_class, model_id)
        if pinned_url:
            return pinned_url

    # 2. Pod-definitions-based routing
    pod, url = await _pick_best_pod(model_id, category)
    if url:
        # Pin to conversation if conversation_id provided
        if conversation_id and pod:
            model_class = _category_to_class(category)
            await _pin_conversation(conversation_id, model_class, pod["id"], model_id)
        return url

    # 3. Legacy env-var fallback
    if category:
        env_key = _LEGACY_ENV.get(category)
        if env_key:
            url = os.environ.get(env_key)
            if url:
                return url.rstrip("/")

    return None


async def invalidate_pod_cache(model_id: str) -> None:
    """Called by pod_definitions routes after status changes."""
    await _invalidate_cache(model_id)


async def count_running(model_id: str) -> int:
    if not _db:
        return 0
    rows = await _db.fetch(
        "SELECT id FROM pod_definitions WHERE model_id=$1 AND pod_status='running'", model_id
    )
    return len(rows)


# ─── Legacy model_sessions API (backward compat for sessions.py router) ───────

async def register_session(
    model_id: str,
    backend_url: str,
    gpu_ids: list,
    tensor_parallel_size: int = 1,
    max_model_len: Optional[int] = None,
    started_by: Optional[str] = None,
    extra_config: Optional[dict] = None,
) -> dict:
    row = await _db.fetchrow(
        """
        INSERT INTO model_sessions
            (model_id, backend_url, gpu_ids, status,
             tensor_parallel_size, max_model_len,
             started_at, started_by, extra_config)
        VALUES ($1,$2,$3,'running',$4,$5,NOW(),$6,$7)
        RETURNING *
        """,
        model_id, backend_url.rstrip("/"), gpu_ids,
        tensor_parallel_size, max_model_len, started_by,
        json.dumps(extra_config or {}),
    )
    await _invalidate_cache(model_id)
    return dict(row)


async def stop_session(session_id: str) -> Optional[dict]:
    row = await _db.fetchrow(
        "UPDATE model_sessions SET status='stopped', stopped_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *",
        session_id,
    )
    if row:
        await _invalidate_cache(row["model_id"])
    return dict(row) if row else None


async def delete_session(session_id: str) -> bool:
    result = await _db.execute("DELETE FROM model_sessions WHERE id=$1", session_id)
    return result == "DELETE 1"


async def update_session_status(session_id: str, status: str) -> Optional[dict]:
    row = await _db.fetchrow(
        "UPDATE model_sessions SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *",
        session_id, status,
    )
    if row:
        await _invalidate_cache(row["model_id"])
    return dict(row) if row else None


async def list_sessions(model_id: Optional[str] = None) -> list[dict]:
    if model_id:
        rows = await _db.fetch(
            "SELECT * FROM model_sessions WHERE model_id=$1 ORDER BY created_at DESC", model_id
        )
    else:
        rows = await _db.fetch("SELECT * FROM model_sessions ORDER BY model_id, created_at DESC")
    return [dict(r) for r in rows]


async def get_session(session_id: str) -> Optional[dict]:
    row = await _db.fetchrow("SELECT * FROM model_sessions WHERE id=$1", session_id)
    return dict(row) if row else None


# ─── Pod-based routing internals ──────────────────────────────────────────────

async def _pick_best_pod(
    model_id: str,
    category: Optional[str],
) -> tuple[Optional[dict], Optional[str]]:
    """
    Select the best pod for a model_id.
    Returns (pod_dict, backend_url) or (None, None).
    """
    if not _db:
        return None, None

    pods = await _db.fetch(
        """
        SELECT * FROM pod_definitions
        WHERE model_id=$1
        ORDER BY priority ASC, created_at ASC
        """,
        model_id,
    )

    if not pods:
        return None, None

    # Separate by session_type
    primary_pods    = [p for p in pods if dict(p)["session_type"] in ("persistent", "idle")]
    scheduled_pods  = [p for p in pods if dict(p)["session_type"] == "scheduled"]
    fallback_pods   = [p for p in pods if dict(p)["session_type"] == "fallback"]

    # Try primary pods first
    for pod_row in primary_pods:
        pod = dict(pod_row)
        result = await _try_use_pod(pod)
        if result:
            return pod, result

    # Try scheduled pods (only if within their cron window)
    for pod_row in scheduled_pods:
        pod = dict(pod_row)
        if _is_in_schedule(pod.get("schedule_cron"), pod.get("schedule_stop_cron")):
            result = await _try_use_pod(pod)
            if result:
                return pod, result

    # All primary saturated or unavailable — try fallback pods
    if fallback_pods:
        for pod_row in fallback_pods:
            pod = dict(pod_row)
            result = await _try_use_pod(pod)
            if result:
                return pod, result

    return None, None


async def _try_use_pod(pod: dict) -> Optional[str]:
    """
    Attempt to get a usable backend URL from a pod.
    - If running and healthy → return backend_url
    - If running but saturated → return None (caller tries next)
    - If stopped and startable → start it → return backend_url (cold start)
    - If error → return None
    """
    status = pod.get("pod_status", "stopped")
    backend_url = pod.get("backend_url")
    pod_id = str(pod["id"])

    if status == "running" and backend_url:
        # Check saturation for vLLM pods
        if pod.get("worker_type") == "vllm":
            threshold = _settings.runpod_saturation_threshold if _settings else 5
            queue = await _get_queue_depth(backend_url)
            if queue > threshold:
                logger.debug("Pod %s saturated (queue=%d > %d)", pod_id, queue, threshold)
                return None
        return backend_url

    if status in ("error", "scaling"):
        return None

    if status == "starting":
        # Already starting, let caller wait or use another pod
        return None

    # stopped → start it (cold start for idle/persistent, scheduled if in window)
    session_type = pod.get("session_type", "idle")
    if session_type in ("idle", "persistent", "scheduled", "fallback"):
        return await _cold_start_pod(pod)

    return None


async def _cold_start_pod(pod: dict) -> Optional[str]:
    """Start a stopped pod on RunPod and wait for it to be ready."""
    pod_id = str(pod["id"])
    runpod_pod_id = pod.get("runpod_pod_id")

    if not runpod_pod_id:
        logger.warning("Pod %s has no runpod_pod_id — cannot cold start", pod_id)
        return None

    # Mark as starting
    await _db.execute(
        "UPDATE pod_definitions SET pod_status='starting', started_at=NOW(), updated_at=NOW() WHERE id=$1::uuid",
        pod_id,
    )

    try:
        from gateway.services import runpod_manager
        backend_url = await runpod_manager.start_pod(runpod_pod_id)
        await _db.execute(
            "UPDATE pod_definitions SET pod_status='running', backend_url=$1, updated_at=NOW() WHERE id=$2::uuid",
            backend_url, pod_id,
        )
        await _invalidate_cache(pod["model_id"])
        logger.info("Cold start pod %s (%s) → %s", pod_id, pod.get("name"), backend_url)
        return backend_url
    except Exception as e:
        await _db.execute(
            "UPDATE pod_definitions SET pod_status='error', updated_at=NOW() WHERE id=$1::uuid", pod_id
        )
        logger.error("Cold start pod %s failed: %s", pod_id, e)
        return None


async def _get_queue_depth(backend_url: str) -> int:
    try:
        r = await _http.get(f"{backend_url}/metrics", timeout=2.0)
        for line in r.text.splitlines():
            if line.startswith("vllm:num_requests_waiting"):
                return int(float(line.split()[-1]))
        return 0
    except Exception:
        return 0


def _is_in_schedule(start_cron: Optional[str], stop_cron: Optional[str]) -> bool:
    """Return True if current time is within the scheduled window."""
    if not start_cron:
        return False
    try:
        from croniter import croniter
        from datetime import datetime
        now = datetime.utcnow()
        # Check if start is in the past and stop is in the future (or no stop cron)
        iter_start = croniter(start_cron, now)
        last_start = iter_start.get_prev(datetime)

        if stop_cron:
            iter_stop = croniter(stop_cron, now)
            last_stop = iter_stop.get_prev(datetime)
            return last_start > last_stop
        else:
            # No stop cron: always in window if last start was within 24h
            delta = (now - last_start).total_seconds()
            return delta < 86400
    except Exception as e:
        logger.debug("_is_in_schedule error: %s", e)
        return False


def _category_to_class(category: Optional[str]) -> str:
    if category in ("llm", "reasoning", "coding", "vision", "embedding"):
        return "llm"
    if category == "stt":
        return "stt"
    if category == "tts":
        return "tts"
    return "llm"


# ─── Session affinity ─────────────────────────────────────────────────────────

async def _get_pinned_backend(
    conversation_id: str,
    model_class: str,
    model_id: str,
) -> Optional[str]:
    if not _db:
        return None
    row = await _db.fetchrow(
        """
        SELECT pd.backend_url, pd.pod_status
        FROM conversation_workers cw
        JOIN pod_definitions pd ON pd.id = cw.pod_definition_id
        WHERE cw.conversation_id=$1::uuid AND cw.model_class=$2
        """,
        conversation_id, model_class,
    )
    if not row:
        return None
    if row["pod_status"] != "running":
        return None
    # Update last_activity
    await _db.execute(
        """
        UPDATE conversation_workers SET last_activity=NOW()
        WHERE conversation_id=$1::uuid AND model_class=$2
        """,
        conversation_id, model_class,
    )
    await _db.execute(
        "UPDATE conversations SET last_activity=NOW() WHERE id=$1::uuid", conversation_id
    )
    return row["backend_url"]


async def _pin_conversation(
    conversation_id: str,
    model_class: str,
    pod_definition_id,
    model_id: str,
) -> None:
    """Ensure the conversation → pod mapping exists."""
    if not _db:
        return
    # Ensure conversation row exists
    await _db.execute(
        """
        INSERT INTO conversations (id, tenant_id, warm_state, last_activity)
        VALUES ($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'active', NOW())
        ON CONFLICT (id) DO UPDATE SET last_activity=NOW(), warm_state='active'
        """,
        conversation_id,
    )
    await _db.execute(
        """
        INSERT INTO conversation_workers
            (conversation_id, model_class, pod_definition_id, model_id, last_activity)
        VALUES ($1::uuid, $2, $3::uuid, $4, NOW())
        ON CONFLICT (conversation_id, model_class) DO UPDATE SET last_activity=NOW()
        """,
        conversation_id, model_class, str(pod_definition_id), model_id,
    )


# ─── Cache helpers ────────────────────────────────────────────────────────────

async def _get_cached(model_id: str) -> Optional[list[str]]:
    if not _redis:
        return None
    key = _KEY_BACKENDS.format(model_id=model_id)
    val = await _redis.get(key)
    return json.loads(val) if val else None


async def _fetch_and_cache(model_id: str) -> list[str]:
    if not _db:
        return []
    rows = await _db.fetch(
        "SELECT backend_url FROM pod_definitions WHERE model_id=$1 AND pod_status='running' AND backend_url IS NOT NULL",
        model_id,
    )
    backends = [r["backend_url"] for r in rows]
    if _redis and backends:
        key = _KEY_BACKENDS.format(model_id=model_id)
        await _redis.setex(key, _CACHE_TTL, json.dumps(backends))
    return backends


async def _invalidate_cache(model_id: str) -> None:
    if _redis:
        await _redis.delete(_KEY_BACKENDS.format(model_id=model_id))


async def _warm_cache() -> None:
    if not _db:
        return
    rows = await _db.fetch(
        "SELECT DISTINCT model_id FROM pod_definitions WHERE pod_status='running'"
    )
    for row in rows:
        await _fetch_and_cache(row["model_id"])
    logger.info("SessionManager cache warmed for %d models", len(rows))


# ─── Background loops ─────────────────────────────────────────────────────────

async def _health_loop() -> None:
    """Every 30s: health-check running pods, mark error if unreachable."""
    interval = _settings.health_check_interval_seconds if _settings else 30
    while True:
        try:
            await asyncio.sleep(interval)
            await _run_health_checks()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("Health-loop error: %s", e)


async def _run_health_checks() -> None:
    if not _db:
        return
    rows = await _db.fetch(
        "SELECT id, model_id, backend_url FROM pod_definitions WHERE pod_status='running' AND backend_url IS NOT NULL"
    )
    for row in rows:
        healthy = await _check_backend_health(row["backend_url"])
        if not healthy:
            logger.warning("Pod %s @ %s failed health check → error", row["id"], row["backend_url"])
            await _db.execute(
                "UPDATE pod_definitions SET pod_status='error', updated_at=NOW() WHERE id=$1",
                row["id"],
            )
            await _invalidate_cache(row["model_id"])


async def _check_backend_health(url: str) -> bool:
    if not _http:
        return True
    try:
        r = await _http.get(f"{url}/health", timeout=3.0)
        return r.status_code < 500
    except Exception:
        return False


async def _idle_loop() -> None:
    """Every 5min: stop idle pods that have exceeded their timeout."""
    interval = _settings.idle_check_interval_seconds if _settings else 300
    while True:
        try:
            await asyncio.sleep(interval)
            await _stop_idle_pods()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("Idle-loop error: %s", e)


async def _stop_idle_pods() -> None:
    if not _db:
        return
    rows = await _db.fetch(
        """
        SELECT id, model_id, runpod_pod_id, idle_timeout_minutes, name
        FROM pod_definitions
        WHERE pod_status = 'running'
          AND session_type = 'idle'
          AND last_request_at IS NOT NULL
          AND last_request_at < NOW() - (idle_timeout_minutes || ' minutes')::INTERVAL
        """
    )
    for row in rows:
        logger.info(
            "Pod %s (%s) idle > %dmin → stopping",
            row["id"], row["name"], row["idle_timeout_minutes"],
        )
        if row.get("runpod_pod_id"):
            try:
                from gateway.services import runpod_manager
                await runpod_manager.stop_pod(row["runpod_pod_id"])
            except Exception as e:
                logger.warning("Could not stop idle pod %s via RunPod: %s", row["id"], e)
        await _db.execute(
            "UPDATE pod_definitions SET pod_status='stopped', backend_url=NULL, updated_at=NOW() WHERE id=$1",
            row["id"],
        )
        await _invalidate_cache(row["model_id"])


async def _schedule_loop() -> None:
    """Every 60s: start/stop scheduled pods based on cron windows."""
    interval = _settings.schedule_check_interval_seconds if _settings else 60
    while True:
        try:
            await asyncio.sleep(interval)
            await _evaluate_scheduled_pods()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("Schedule-loop error: %s", e)


async def _evaluate_scheduled_pods() -> None:
    if not _db:
        return
    rows = await _db.fetch(
        "SELECT * FROM pod_definitions WHERE session_type='scheduled'"
    )
    for pod_row in rows:
        pod = dict(pod_row)
        in_window = _is_in_schedule(pod.get("schedule_cron"), pod.get("schedule_stop_cron"))
        status = pod.get("pod_status")

        if in_window and status == "stopped" and pod.get("runpod_pod_id"):
            logger.info("Scheduled pod %s entering window → starting", pod["id"])
            await _cold_start_pod(pod)

        elif not in_window and status == "running" and pod.get("runpod_pod_id"):
            logger.info("Scheduled pod %s outside window → stopping", pod["id"])
            try:
                from gateway.services import runpod_manager
                await runpod_manager.stop_pod(pod["runpod_pod_id"])
            except Exception as e:
                logger.warning("Could not stop scheduled pod %s: %s", pod["id"], e)
            await _db.execute(
                "UPDATE pod_definitions SET pod_status='stopped', backend_url=NULL, updated_at=NOW() WHERE id=$1::uuid",
                str(pod["id"]),
            )
            await _invalidate_cache(pod["model_id"])


async def _prewarm_loop() -> None:
    """Every 60s: pre-start scheduled pods N minutes before their window opens."""
    interval = _settings.schedule_check_interval_seconds if _settings else 60
    while True:
        try:
            await asyncio.sleep(interval)
            await _prewarm_scheduled_pods()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("Prewarm-loop error: %s", e)


async def _prewarm_scheduled_pods() -> None:
    if not _db:
        return
    rows = await _db.fetch(
        "SELECT * FROM pod_definitions WHERE session_type='scheduled' AND pod_status='stopped' AND schedule_cron IS NOT NULL"
    )
    from datetime import datetime
    try:
        from croniter import croniter
    except ImportError:
        return

    now = datetime.utcnow()
    for pod_row in rows:
        pod = dict(pod_row)
        prewarm_minutes = pod.get("prewarm_minutes", 15)
        cron_expr = pod.get("schedule_cron")
        if not cron_expr:
            continue
        try:
            it = croniter(cron_expr, now)
            next_start = it.get_next(datetime)
            minutes_until = (next_start - now).total_seconds() / 60
            if 0 < minutes_until <= prewarm_minutes and pod.get("runpod_pod_id"):
                logger.info(
                    "Pre-warming scheduled pod %s (%dmin until window)",
                    pod["id"], int(minutes_until),
                )
                await _cold_start_pod(pod)
        except Exception as e:
            logger.debug("Prewarm check pod %s: %s", pod["id"], e)
