import asyncio
import logging
import os
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

# ── env-driven configuration ──────────────────────────────────────────────────
WHISPER_MODEL_PATH = os.environ.get(
    "WHISPER_MODEL_PATH", "/models/stt/whisper-large-v3-turbo"
)
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "float16")
WHISPER_MODEL_NAME = os.path.basename(WHISPER_MODEL_PATH)

# ── module-level singleton state ──────────────────────────────────────────────
_instance: Optional["FasterWhisperWrapper"] = None
_instance_lock: asyncio.Lock  # initialised in get_instance() on first call


def _format_timestamp(seconds: float) -> str:
    """Format seconds into SRT timestamp: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")


class FasterWhisperWrapper:
    """Singleton wrapper around WhisperModel.

    The model is loaded once at startup in a thread-pool executor because
    faster-whisper's constructor is blocking (it maps weights into VRAM).
    A single asyncio.Lock serialises transcription calls since faster-whisper
    processes one audio stream at a time.
    """

    def __init__(self) -> None:
        self.model = None
        self._loaded: bool = False
        self._transcription_lock: asyncio.Lock = asyncio.Lock()

    # ── loading ───────────────────────────────────────────────────────────────

    def _load_sync(self) -> None:
        """Blocking model load — runs in a thread executor."""
        from faster_whisper import WhisperModel

        logger.info(
            "Loading Faster-Whisper from %s (device=%s, compute_type=%s)",
            WHISPER_MODEL_PATH,
            WHISPER_DEVICE,
            WHISPER_COMPUTE_TYPE,
        )
        self.model = WhisperModel(
            WHISPER_MODEL_PATH,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
        )
        self._loaded = True
        logger.info("Faster-Whisper loaded successfully")

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    # ── transcription ─────────────────────────────────────────────────────────

    def _transcribe_sync(self, audio_bytes: bytes, params: dict) -> dict:
        """Blocking transcription — runs in a thread executor."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            segments_iter, info = self.model.transcribe(
                tmp_path,
                language=params.get("language"),
                temperature=params.get("temperature", 0.0),
                beam_size=params.get("beam_size", 5),
                vad_filter=params.get("vad_filter", True),
                word_timestamps=params.get("word_timestamps", False),
            )

            segment_list: list[dict] = []
            full_text_parts: list[str] = []

            for seg in segments_iter:
                text = seg.text.strip()
                full_text_parts.append(text)

                seg_dict: dict = {
                    "id": seg.id,
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3),
                    "text": text,
                    "avg_logprob": round(seg.avg_logprob, 4),
                }

                # Include word-level timestamps when requested
                if params.get("word_timestamps") and seg.words:
                    seg_dict["words"] = [
                        {
                            "word": w.word,
                            "start": round(w.start, 3),
                            "end": round(w.end, 3),
                            "probability": round(w.probability, 4),
                        }
                        for w in seg.words
                    ]

                segment_list.append(seg_dict)

        finally:
            import os as _os

            _os.unlink(tmp_path)

        return {
            "text": " ".join(full_text_parts),
            "language": info.language,
            "duration": round(info.duration, 3),
            "task": "transcribe",
            "segments": segment_list,
        }

    async def transcribe(self, audio_bytes: bytes, params: dict) -> dict:
        """Async transcription with serialisation lock."""
        loop = asyncio.get_event_loop()
        async with self._transcription_lock:
            return await loop.run_in_executor(
                None, self._transcribe_sync, audio_bytes, params
            )

    # ── response formatting ───────────────────────────────────────────────────

    def format_response(self, result: dict, response_format: str):
        """Return the transcription result in the requested OpenAI format."""
        if response_format == "text":
            return result["text"]
        if response_format == "srt":
            return self._to_srt(result["segments"])
        if response_format == "vtt":
            return self._to_vtt(result["segments"])
        if response_format == "verbose_json":
            return result
        # Default: "json"
        return {
            "text": result["text"],
            "language": result.get("language"),
            "duration": result.get("duration"),
        }

    def _to_srt(self, segments: list) -> str:
        lines: list[str] = []
        for i, seg in enumerate(segments, 1):
            start = _format_timestamp(seg["start"])
            end = _format_timestamp(seg["end"])
            lines.append(f"{i}\n{start} --> {end}\n{seg['text']}\n")
        return "\n".join(lines)

    def _to_vtt(self, segments: list) -> str:
        lines: list[str] = ["WEBVTT\n"]
        for seg in segments:
            start = _format_timestamp(seg["start"]).replace(",", ".")
            end = _format_timestamp(seg["end"]).replace(",", ".")
            lines.append(f"{start} --> {end}\n{seg['text']}\n")
        return "\n".join(lines)


# ── singleton helpers ─────────────────────────────────────────────────────────

async def get_instance() -> FasterWhisperWrapper:
    """Return the loaded singleton, raising if not yet initialised."""
    global _instance
    if _instance is None or not _instance.is_loaded:
        raise RuntimeError("FasterWhisperWrapper not initialised")
    return _instance


async def load_model() -> FasterWhisperWrapper:
    """Create and load the singleton.  Called once at application startup."""
    global _instance
    wrapper = FasterWhisperWrapper()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, wrapper._load_sync)
    _instance = wrapper
    return wrapper
