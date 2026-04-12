"""
POST /v1/audio/transcriptions — HTTP proxy to stt-service.

The gateway resolves which model to use, picks a running stt-service
session via the SessionManager, then forwards the multipart/form-data
payload verbatim.  Usage (audio_seconds) is extracted from the
X-Audio-Seconds response header written by stt-service.
"""

import asyncio
import logging
import uuid

import httpx
from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse, Response

from gateway.services import tracking

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB
_http: httpx.AsyncClient | None = None


def _get_http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=120.0)
    return _http


@router.post("/v1/audio/transcriptions")
async def transcribe(
    request: Request,
    file: UploadFile = File(...),
    model: str = Form(default="whisper-1"),
    language: str = Form(default=None),
    temperature: float = Form(default=0.0),
    response_format: str = Form(default="json"),
    timestamp_granularities: list = Form(default=None),
    vad_filter: bool = Form(default=True),
    diarize: bool = Form(default=False),
):
    tenant = request.state.tenant
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())

    # Resolve model alias (whisper-1 → whisper-large-v3-turbo)
    from gateway.services.router import get_router
    model_router = get_router()
    resolved = model_router.resolve(model, tenant.get("plan", "starter"))

    # Read audio bytes
    audio_bytes = await file.read()
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return JSONResponse(
            status_code=400,
            content={"error": {"type": "invalid_request_error", "message": "File exceeds 25MB limit"}},
        )

    # Pick a backend from session manager
    from gateway.services import session_manager
    backend_url = await session_manager.next_backend(resolved.model_id, category="stt")

    if not backend_url:
        return JSONResponse(
            status_code=503,
            content={"error": {"type": "server_error", "message": "No STT session running — start a session first"}},
        )

    # Forward multipart/form-data to stt-service
    try:
        files = {"file": (file.filename or "audio", audio_bytes, file.content_type or "audio/mpeg")}
        data: dict = {
            "model": resolved.model_id,
            "temperature": str(temperature),
            "response_format": response_format,
            "vad_filter": str(vad_filter).lower(),
            "diarize": str(diarize).lower(),
        }
        if language:
            data["language"] = language
        if timestamp_granularities:
            # send as repeated field
            data["timestamp_granularities"] = timestamp_granularities

        resp = await _get_http().post(
            f"{backend_url}/v1/audio/transcriptions",
            files=files,
            data=data,
            headers={"X-Request-ID": request_id},
        )
    except httpx.RequestError as e:
        logger.error("STT backend %s unreachable: %s", backend_url, e)
        return JSONResponse(
            status_code=502,
            content={"error": {"type": "server_error", "message": "STT backend unavailable"}},
        )

    if resp.status_code >= 500:
        return JSONResponse(
            status_code=resp.status_code,
            content={"error": {"type": "server_error", "message": "STT backend error"}},
        )

    # Extract audio duration for usage tracking
    audio_seconds = 0.0
    try:
        audio_seconds = float(resp.headers.get("X-Audio-Seconds", "0"))
    except (ValueError, TypeError):
        pass

    # Record usage in background
    asyncio.create_task(
        tracking.record_usage(
            tenant_id=tenant["id"],
            model_id=resolved.model_id,
            category="stt",
            audio_seconds=audio_seconds,
            request_id=request_id,
        )
    )

    # Return the stt-service response as-is
    content_type = resp.headers.get("content-type", "application/json")
    if "text/plain" in content_type:
        return PlainTextResponse(resp.text, status_code=resp.status_code)
    if resp.status_code != 200:
        return Response(content=resp.content, status_code=resp.status_code, media_type=content_type)
    return Response(
        content=resp.content,
        status_code=200,
        media_type=content_type,
        headers={"X-Request-ID": request_id},
    )
