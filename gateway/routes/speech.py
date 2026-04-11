import asyncio
import io
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import Response
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


class SpeechRequest(BaseModel):
    model: str = "tts-1"
    input: str
    voice: str = "alloy"
    language: str = "it"
    speed: float = 1.0
    response_format: str = "mp3"
    # StyleTTS2 extra params
    alpha: Optional[float] = None
    beta: Optional[float] = None
    diffusion_steps: Optional[int] = None


@router.post("/v1/audio/speech")
async def speech(req: SpeechRequest, request: Request):
    tenant = request.state.tenant
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())

    if not req.input:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=400,
            content={"error": {"type": "invalid_request_error", "message": "input is required"}},
        )

    # Resolve model
    from gateway.services.router import get_router
    model_router = get_router()
    resolved = model_router.resolve(req.model, tenant.get("plan", "starter"))
    model_id = resolved.model_id

    # Get custom voice path for this tenant (if any)
    voice_wav_path = await get_tenant_voice_path(tenant["id"], req.voice)

    params = {
        "language": req.language,
        "speed": req.speed,
        "voice": req.voice,
    }
    if req.alpha is not None:
        params["alpha"] = req.alpha
    if req.beta is not None:
        params["beta"] = req.beta
    if req.diffusion_steps is not None:
        params["diffusion_steps"] = req.diffusion_steps

    audio_bytes = await _dispatch_tts(model_id, req.input, params, voice_wav_path)

    # Convert to requested format if needed (wav is native output)
    if req.response_format == "mp3":
        audio_bytes = await _wav_to_mp3(audio_bytes)

    # Track usage
    asyncio.create_task(
        tracking.record_usage(
            tenant_id=tenant["id"],
            model_id=model_id,
            category="tts",
            characters_count=len(req.input),
            request_id=request_id,
        )
    )

    media_type = MEDIA_TYPES.get(req.response_format, "audio/wav")
    return Response(
        content=audio_bytes,
        media_type=media_type,
        headers={"X-Request-ID": request_id},
    )


async def _dispatch_tts(
    model_id: str, text: str, params: dict, voice_wav_path: Optional[str]
) -> bytes:
    if model_id == "xtts-v2":
        from gateway.models.tts.xtts_wrapper import XTTSWrapper
        wrapper = await XTTSWrapper.get_instance()
        return await wrapper.synthesize(text, params, voice_wav_path=voice_wav_path)

    elif model_id == "kokoro-v1":
        from gateway.models.tts.kokoro_wrapper import KokoroWrapper
        wrapper = await KokoroWrapper.get_instance()
        return await wrapper.synthesize(text, params)

    elif model_id == "stylett2-en":
        from gateway.models.tts.stylett2_wrapper import StyleTTS2Wrapper
        wrapper = await StyleTTS2Wrapper.get_instance()
        return await wrapper.synthesize(text, params)

    else:
        # Default fallback to XTTS
        from gateway.models.tts.xtts_wrapper import XTTSWrapper
        wrapper = await XTTSWrapper.get_instance()
        return await wrapper.synthesize(text, params, voice_wav_path=voice_wav_path)


async def _wav_to_mp3(wav_bytes: bytes) -> bytes:
    """Convert WAV to MP3 using pydub (wraps ffmpeg)."""
    try:
        import asyncio
        from pydub import AudioSegment

        def convert():
            import io
            audio = AudioSegment.from_wav(io.BytesIO(wav_bytes))
            buf = io.BytesIO()
            audio.export(buf, format="mp3", bitrate="128k")
            return buf.getvalue()

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, convert)
    except Exception as e:
        logger.warning("MP3 conversion failed, returning WAV: %s", e)
        return wav_bytes
