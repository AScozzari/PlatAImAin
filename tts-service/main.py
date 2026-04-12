import asyncio
import io
import logging
import os
from typing import Optional

from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="TTS Service", version="1.0.0")

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------

_loaded_models: dict[str, object] = {}   # model_id -> wrapper instance
_loading: bool = True                    # True until startup completes

MEDIA_TYPES = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "pcm": "audio/pcm",
    "opus": "audio/ogg",
}

# Model-id aliases → canonical keys used in _loaded_models
MODEL_ALIASES: dict[str, str] = {
    "xtts-v2": "xtts-v2",
    "tts-1-hd": "xtts-v2",
    "kokoro-v1": "kokoro-v1",
    "tts-1": "kokoro-v1",
    "stylett2-en": "stylett2-en",
}

DEFAULT_MODEL = "kokoro-v1"


# ---------------------------------------------------------------------------
# Pydantic request model
# ---------------------------------------------------------------------------

class SpeechRequest(BaseModel):
    model: str = "tts-1"
    input: str
    voice: str = "alloy"
    language: str = "it"
    speed: float = 1.0
    response_format: str = "mp3"
    # Optional path for voice cloning (file on /data/voices shared volume)
    speaker_wav_path: Optional[str] = None
    # StyleTTS2 extra params
    alpha: Optional[float] = None
    beta: Optional[float] = None
    diffusion_steps: Optional[int] = None


# ---------------------------------------------------------------------------
# Startup: load wrappers concurrently
# ---------------------------------------------------------------------------

async def _load_xtts() -> None:
    from xtts_wrapper import XTTSWrapper
    try:
        instance = await XTTSWrapper.get_instance()
        _loaded_models["xtts-v2"] = instance
        logger.info("XTTSWrapper ready")
    except Exception as exc:
        logger.warning("XTTSWrapper failed to load, skipping: %s", exc)


async def _load_kokoro() -> None:
    from kokoro_wrapper import KokoroWrapper
    try:
        instance = await KokoroWrapper.get_instance()
        _loaded_models["kokoro-v1"] = instance
        logger.info("KokoroWrapper ready")
    except Exception as exc:
        logger.warning("KokoroWrapper failed to load, skipping: %s", exc)


async def _load_stylett2() -> None:
    from stylett2_wrapper import StyleTTS2Wrapper
    try:
        instance = await StyleTTS2Wrapper.get_instance()
        _loaded_models["stylett2-en"] = instance
        logger.info("StyleTTS2Wrapper ready")
    except Exception as exc:
        logger.warning("StyleTTS2Wrapper failed to load, skipping: %s", exc)


@app.on_event("startup")
async def startup_event() -> None:
    global _loading

    xtts_enabled = os.environ.get("XTTS_ENABLED", "true").lower() == "true"
    kokoro_enabled = os.environ.get("KOKORO_ENABLED", "true").lower() == "true"
    stylett2_enabled = os.environ.get("STYLETT2_ENABLED", "false").lower() == "true"

    tasks = []
    if xtts_enabled:
        tasks.append(_load_xtts())
    if kokoro_enabled:
        tasks.append(_load_kokoro())
    if stylett2_enabled:
        tasks.append(_load_stylett2())

    if tasks:
        await asyncio.gather(*tasks)

    _loading = False
    logger.info("Startup complete. Loaded models: %s", list(_loaded_models.keys()))


# ---------------------------------------------------------------------------
# Helper: WAV → MP3 conversion via pydub
# ---------------------------------------------------------------------------

async def _wav_to_mp3(wav_bytes: bytes) -> bytes:
    """Convert WAV bytes to MP3 using pydub (wraps ffmpeg)."""
    try:
        from pydub import AudioSegment

        def convert() -> bytes:
            audio = AudioSegment.from_wav(io.BytesIO(wav_bytes))
            buf = io.BytesIO()
            audio.export(buf, format="mp3", bitrate="128k")
            return buf.getvalue()

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, convert)
    except Exception as exc:
        logger.warning("MP3 conversion failed, returning WAV: %s", exc)
        return wav_bytes


# ---------------------------------------------------------------------------
# Helper: resolve wrapper from model alias
# ---------------------------------------------------------------------------

def _resolve_wrapper(model: str):
    """Return the loaded wrapper for the requested model, or the default fallback."""
    canonical = MODEL_ALIASES.get(model, DEFAULT_MODEL)

    wrapper = _loaded_models.get(canonical)
    if wrapper is not None:
        return wrapper

    # Requested model not available — fall back to lightest loaded model
    logger.warning(
        "Model '%s' (canonical: '%s') not loaded; falling back to default '%s'",
        model, canonical, DEFAULT_MODEL,
    )
    fallback = _loaded_models.get(DEFAULT_MODEL)
    if fallback is not None:
        return fallback

    # Last resort: return whatever is loaded
    if _loaded_models:
        first = next(iter(_loaded_models.values()))
        return first

    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> JSONResponse:
    if _loading:
        return JSONResponse(
            status_code=200,
            content={"status": "loading", "loading": True},
        )
    return JSONResponse(
        content={
            "status": "ready",
            "models": list(_loaded_models.keys()),
            "loading": False,
        }
    )


@app.get("/v1/voices")
async def list_voices() -> JSONResponse:
    voices: dict[str, list[str]] = {}
    for model_id, wrapper in _loaded_models.items():
        if hasattr(wrapper, "builtin_voices"):
            voices[model_id] = wrapper.builtin_voices()
        else:
            voices[model_id] = []
    return JSONResponse(content={"voices": voices})


@app.post("/v1/audio/speech")
async def speech(req: SpeechRequest) -> Response:
    if not req.input:
        return JSONResponse(
            status_code=400,
            content={"error": {"type": "invalid_request_error", "message": "input is required"}},
        )

    if _loading:
        return JSONResponse(
            status_code=503,
            content={"error": {"type": "service_unavailable", "message": "Models are still loading"}},
        )

    wrapper = _resolve_wrapper(req.model)
    if wrapper is None:
        return JSONResponse(
            status_code=503,
            content={"error": {"type": "service_unavailable", "message": "No TTS model is loaded"}},
        )

    # Build synthesis params
    params: dict = {
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

    # Validate speaker_wav_path if provided (must exist on shared volume)
    speaker_wav_path: Optional[str] = None
    if req.speaker_wav_path:
        if os.path.isfile(req.speaker_wav_path):
            speaker_wav_path = req.speaker_wav_path
        else:
            logger.warning(
                "speaker_wav_path '%s' not found on filesystem; ignoring",
                req.speaker_wav_path,
            )

    try:
        audio_bytes: bytes = await wrapper.synthesize(
            req.input, params, voice_wav_path=speaker_wav_path
        )
    except Exception as exc:
        logger.exception("Synthesis failed: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": {"type": "internal_error", "message": str(exc)}},
        )

    # Format conversion
    if req.response_format == "mp3":
        audio_bytes = await _wav_to_mp3(audio_bytes)

    media_type = MEDIA_TYPES.get(req.response_format, "audio/wav")

    return Response(
        content=audio_bytes,
        media_type=media_type,
        headers={"X-Characters-Count": str(len(req.input))},
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8020"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, workers=1)
