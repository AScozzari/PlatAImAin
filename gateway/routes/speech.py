"""
POST /v1/audio/speech — HTTP proxy to tts-service.

The gateway resolves the model, picks a running tts-service session,
then forwards the JSON payload verbatim.  Character count for usage
tracking comes from the X-Characters-Count response header.
"""

import asyncio
import logging
import uuid
from typing import Optional

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from gateway.services import tracking
from gateway.services.voices import get_tenant_voice_path

logger = logging.getLogger(__name__)

router = APIRouter()

MEDIA_TYPES = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "pcm": "audio/pcm",
    "opus": "audio/ogg",
}

_http: httpx.AsyncClient | None = None


def _get_http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=180.0)
    return _http


class SpeechRequest(BaseModel):
    model: str = "tts-1"
    input: str
    voice: str = "alloy"
    language: str = "it"
    speed: float = 1.0
    response_format: str = "mp3"
    # StyleTTS2 / XTTS extra params
    alpha: Optional[float] = None
    beta: Optional[float] = None
    diffusion_steps: Optional[int] = None
    # Optional path for voice-cloning WAV (resolved from tenant voices DB)
    speaker_wav_path: Optional[str] = None


@router.post("/v1/audio/speech")
async def speech(req: SpeechRequest, request: Request):
    tenant = request.state.tenant
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())

    if not req.input:
        return JSONResponse(
            status_code=400,
            content={"error": {"type": "invalid_request_error", "message": "input is required"}},
        )

    # Resolve model
    from gateway.services.router import get_router
    model_router = get_router()
    resolved = model_router.resolve(req.model, tenant.get("plan", "starter"))

    # Resolve custom voice path for tenant (voice cloning)
    voice_wav_path = await get_tenant_voice_path(tenant["id"], req.voice)

    # Pick a backend
    from gateway.services import session_manager
    backend_url = await session_manager.next_backend(resolved.model_id, category="tts")

    if not backend_url:
        return JSONResponse(
            status_code=503,
            content={"error": {"type": "server_error", "message": "No TTS session running — start a session first"}},
        )

    # Build payload for tts-service (superset of OpenAI speech API)
    payload = {
        "model": resolved.model_id,
        "input": req.input,
        "voice": req.voice,
        "language": req.language,
        "speed": req.speed,
        "response_format": req.response_format,
    }
    if req.alpha is not None:
        payload["alpha"] = req.alpha
    if req.beta is not None:
        payload["beta"] = req.beta
    if req.diffusion_steps is not None:
        payload["diffusion_steps"] = req.diffusion_steps
    if voice_wav_path:
        payload["speaker_wav_path"] = voice_wav_path

    # Forward to tts-service
    try:
        resp = await _get_http().post(
            f"{backend_url}/v1/audio/speech",
            json=payload,
            headers={"X-Request-ID": request_id},
        )
    except httpx.RequestError as e:
        logger.error("TTS backend %s unreachable: %s", backend_url, e)
        return JSONResponse(
            status_code=502,
            content={"error": {"type": "server_error", "message": "TTS backend unavailable"}},
        )

    if resp.status_code >= 400:
        return JSONResponse(
            status_code=resp.status_code,
            content=resp.json() if "application/json" in resp.headers.get("content-type", "") else
                    {"error": {"type": "server_error", "message": "TTS backend error"}},
        )

    # Extract character count for usage tracking
    chars = len(req.input)
    try:
        chars = int(resp.headers.get("X-Characters-Count", chars))
    except (ValueError, TypeError):
        pass

    asyncio.create_task(
        tracking.record_usage(
            tenant_id=tenant["id"],
            model_id=resolved.model_id,
            category="tts",
            characters_count=chars,
            request_id=request_id,
        )
    )

    media_type = MEDIA_TYPES.get(req.response_format, "audio/wav")
    return Response(
        content=resp.content,
        status_code=200,
        media_type=media_type,
        headers={"X-Request-ID": request_id},
    )
