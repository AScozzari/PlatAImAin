"""stt-service — OpenAI-compatible Speech-to-Text microservice.

Exposes:
  POST /v1/audio/transcriptions   — OpenAI-compatible transcription endpoint
  GET  /health                    — readiness probe
  GET  /metrics                   — lightweight operational metrics
"""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse, Response

import wrapper as w

# ── logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("stt-service")

# ── constants ─────────────────────────────────────────────────────────────────
MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB

# ── operational metrics (in-process; no Prometheus dependency) ───────────────
_stats: dict = {
    "requests_total": 0,
    "requests_ok": 0,
    "requests_error": 0,
    "audio_seconds_total": 0.0,
    "started_at": time.time(),
}

# ── application lifecycle ─────────────────────────────────────────────────────

_model_loading: bool = False
_model_load_error: Optional[str] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model_loading, _model_load_error
    _model_loading = True
    _model_load_error = None
    try:
        logger.info("Starting model load…")
        await w.load_model()
        logger.info("Model ready — service is accepting requests")
    except Exception as exc:
        _model_load_error = str(exc)
        logger.exception("Failed to load model: %s", exc)
        # We intentionally do NOT re-raise: the service starts up so the
        # orchestrator does not restart-loop, and /health will surface the error.
    finally:
        _model_loading = False
    yield
    # shutdown: nothing to do (OS reclaims VRAM)


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="STT Service",
    version="1.0.0",
    description="OpenAI-compatible Speech-to-Text microservice (faster-whisper)",
    lifespan=lifespan,
)


# ── routes ────────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    """Readiness probe.

    Returns HTTP 200 in all cases so the gateway health-check does not
    circuit-break while the model is still loading.
    """
    if _model_loading:
        return {"status": "loading"}

    if _model_load_error:
        return {"status": "error", "detail": _model_load_error}

    try:
        instance = await w.get_instance()
        if not instance.is_loaded:
            return {"status": "loading"}
    except RuntimeError:
        return {"status": "loading"}

    return {
        "status": "ready",
        "model": w.WHISPER_MODEL_NAME,
        "device": w.WHISPER_DEVICE,
    }


@app.get("/metrics")
async def metrics():
    """Minimal plain-text stats (no external dependency required)."""
    uptime = time.time() - _stats["started_at"]
    lines = [
        f"# stt-service metrics",
        f"uptime_seconds {uptime:.1f}",
        f"requests_total {_stats['requests_total']}",
        f"requests_ok {_stats['requests_ok']}",
        f"requests_error {_stats['requests_error']}",
        f"audio_seconds_total {_stats['audio_seconds_total']:.3f}",
        f"model_name {w.WHISPER_MODEL_NAME}",
        f"device {w.WHISPER_DEVICE}",
        f"compute_type {w.WHISPER_COMPUTE_TYPE}",
    ]
    return PlainTextResponse("\n".join(lines) + "\n")


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(..., description="Audio file to transcribe"),
    model: str = Form(default="whisper-1", description="Model identifier (alias)"),
    language: Optional[str] = Form(default=None, description="BCP-47 language code"),
    temperature: float = Form(default=0.0, description="Sampling temperature 0-1"),
    response_format: str = Form(
        default="json",
        description="Output format: json | text | srt | vtt | verbose_json",
    ),
    timestamp_granularities: Optional[list] = Form(
        default=None,
        description="Timestamp granularities: ['word'] and/or ['segment']",
    ),
    vad_filter: bool = Form(default=True, description="Enable VAD silence filtering"),
    diarize: bool = Form(default=False, description="Enable speaker diarization (reserved)"),
):
    """OpenAI-compatible transcription endpoint.

    Accepts multipart/form-data.  Returns the transcription in the requested
    format with the following extra response headers:

    * ``X-Audio-Seconds``  — duration of the processed audio (for billing)
    * ``X-Model-Id``       — resolved model name used for inference
    """
    _stats["requests_total"] += 1

    # ── model readiness guard ─────────────────────────────────────────────────
    try:
        instance = await w.get_instance()
    except RuntimeError:
        _stats["requests_error"] += 1
        raise HTTPException(
            status_code=503,
            detail="Model is still loading — please retry shortly",
        )

    # ── read & validate audio ─────────────────────────────────────────────────
    audio_bytes = await file.read()
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        _stats["requests_error"] += 1
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "type": "invalid_request_error",
                    "message": f"File exceeds {MAX_AUDIO_BYTES // (1024*1024)} MB limit",
                }
            },
        )

    if not audio_bytes:
        _stats["requests_error"] += 1
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "type": "invalid_request_error",
                    "message": "Empty audio file",
                }
            },
        )

    # ── build transcription params ────────────────────────────────────────────
    word_timestamps = bool(
        timestamp_granularities and "word" in timestamp_granularities
    )

    params = {
        "language": language,
        "temperature": temperature,
        "vad_filter": vad_filter,
        "word_timestamps": word_timestamps,
        # beam_size kept at default (5); can be exposed as Form param later
    }

    # ── transcribe ────────────────────────────────────────────────────────────
    try:
        result = await instance.transcribe(audio_bytes, params)
    except Exception as exc:
        _stats["requests_error"] += 1
        logger.exception("Transcription failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "type": "server_error",
                    "message": "Transcription failed",
                }
            },
        )

    duration: float = result.get("duration", 0.0)
    _stats["requests_ok"] += 1
    _stats["audio_seconds_total"] += duration

    # ── format & return ───────────────────────────────────────────────────────
    formatted = instance.format_response(result, response_format)

    extra_headers = {
        "X-Audio-Seconds": str(round(duration, 3)),
        "X-Model-Id": w.WHISPER_MODEL_NAME,
    }

    if response_format == "text":
        return PlainTextResponse(formatted, headers=extra_headers)

    if response_format in ("srt", "vtt"):
        return Response(
            content=formatted,
            media_type="text/plain",
            headers=extra_headers,
        )

    # json / verbose_json
    return JSONResponse(content=formatted, headers=extra_headers)


# ── entrypoint (direct execution) ─────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8010"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, workers=1)
