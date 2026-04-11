import asyncio
import logging
import uuid

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse, Response

from gateway.services import tracking

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB


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

    # Read audio
    audio_bytes = await file.read()
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return JSONResponse(
            status_code=400,
            content={"error": {"type": "invalid_request_error", "message": "File exceeds 25MB limit"}},
        )

    # Use faster-whisper wrapper
    from gateway.models.stt.faster_whisper_wrapper import FasterWhisperWrapper
    wrapper = await FasterWhisperWrapper.get_instance()

    word_timestamps = bool(timestamp_granularities and "word" in timestamp_granularities)
    result = await wrapper.transcribe(audio_bytes, {
        "language": language,
        "temperature": temperature,
        "vad_filter": vad_filter,
        "word_timestamps": word_timestamps,
    })

    duration = result.get("duration", 0.0)

    # Track usage
    asyncio.create_task(
        tracking.record_usage(
            tenant_id=tenant["id"],
            model_id=resolved.model_id,
            category="stt",
            audio_seconds=duration,
            request_id=request_id,
        )
    )

    formatted = wrapper.format_response(result, response_format)

    if response_format == "text":
        return PlainTextResponse(formatted)
    if response_format in ("srt", "vtt"):
        return Response(content=formatted, media_type="text/plain")
    return JSONResponse(content=formatted)
