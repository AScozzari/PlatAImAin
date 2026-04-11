import asyncio
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from gateway.db import postgres as db
from gateway.db import redis as cache
from gateway.middleware.admin_auth import require_admin

router = APIRouter()

VLLM_TIMEOUT = httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=3.0)


async def _check_vllm(name: str, url: str) -> dict:
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=VLLM_TIMEOUT) as client:
            resp = await client.get(f"{url}/health")
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return {"status": "healthy" if resp.status_code == 200 else "unhealthy", "latency_ms": latency_ms}
    except Exception as e:
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return {"status": "unhealthy", "error": str(e), "latency_ms": latency_ms}


async def _check_postgres() -> dict:
    start = time.monotonic()
    try:
        result = await db.fetchval("SELECT 1")
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return {"status": "healthy", "latency_ms": latency_ms}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


async def _check_redis() -> dict:
    start = time.monotonic()
    try:
        ok = await cache.ping()
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return {"status": "healthy" if ok else "unhealthy", "latency_ms": latency_ms}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


async def _check_type_b_model(model_class_name: str) -> dict:
    try:
        if model_class_name == "FasterWhisperWrapper":
            from gateway.models.stt.faster_whisper_wrapper import FasterWhisperWrapper
            instance = FasterWhisperWrapper.get_instance_sync()
        elif model_class_name == "XTTSWrapper":
            from gateway.models.tts.xtts_wrapper import XTTSWrapper
            instance = XTTSWrapper.get_instance_sync()
        elif model_class_name == "KokoroWrapper":
            from gateway.models.tts.kokoro_wrapper import KokoroWrapper
            instance = KokoroWrapper.get_instance_sync()
        elif model_class_name == "StyleTTS2Wrapper":
            from gateway.models.tts.stylett2_wrapper import StyleTTS2Wrapper
            instance = StyleTTS2Wrapper.get_instance_sync()
        else:
            return {"status": "unknown"}

        if instance and instance.is_loaded:
            return {"status": "healthy", "loaded": True}
        elif instance:
            return {"status": "loading", "loaded": False}
        else:
            return {"status": "not_started", "loaded": False}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


@router.get("/health")
async def health_check(_=Depends(require_admin)):
    from gateway.config.settings import get_settings
    settings = get_settings()

    checks = await asyncio.gather(
        _check_vllm("vllm_llm", settings.vllm_llm_url),
        _check_vllm("vllm_vision", settings.vllm_vision_url),
        _check_vllm("vllm_coding", settings.vllm_coding_url),
        _check_vllm("vllm_embedding", settings.vllm_embedding_url),
        _check_postgres(),
        _check_redis(),
        _check_type_b_model("FasterWhisperWrapper"),
        _check_type_b_model("XTTSWrapper"),
        _check_type_b_model("KokoroWrapper"),
        return_exceptions=True,
    )

    keys = ["vllm_llm", "vllm_vision", "vllm_coding", "vllm_embedding", "postgres", "redis", "whisper", "xtts", "kokoro"]
    services = {}
    for key, result in zip(keys, checks):
        if isinstance(result, Exception):
            services[key] = {"status": "unhealthy", "error": str(result)}
        else:
            services[key] = result

    overall = "healthy" if all(s.get("status") == "healthy" for s in services.values()) else "degraded"

    return JSONResponse(content={
        "status": overall,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": services,
    })


@router.get("/models")
async def list_loaded_models(_=Depends(require_admin)):
    from gateway.services.router import get_router
    try:
        model_router = get_router()
        models = model_router.list_all()
        return JSONResponse(content={"data": models, "count": len(models)})
    except RuntimeError:
        return JSONResponse(status_code=503, content={"error": "ModelRouter not initialized"})


@router.post("/models/reload")
async def reload_models(_=Depends(require_admin)):
    from gateway.services.router import get_router
    model_router = get_router()
    model_router.reload()
    return JSONResponse(content={"success": True, "message": "models.config.json reloaded"})
