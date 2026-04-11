import asyncio
import io
import logging
import os
import tempfile
from typing import Optional

from gateway.models.base import ModelWrapper

logger = logging.getLogger(__name__)


class FasterWhisperWrapper(ModelWrapper):

    def _load_sync(self) -> None:
        from faster_whisper import WhisperModel
        from gateway.config.settings import get_settings

        settings = get_settings()
        model_path = settings.whisper_model_path
        device = settings.whisper_device
        compute_type = settings.whisper_compute_type

        logger.info("Loading Faster-Whisper from %s (device=%s, compute=%s)", model_path, device, compute_type)
        self.model = WhisperModel(model_path, device=device, compute_type=compute_type)
        logger.info("Faster-Whisper loaded")

    def _transcribe_sync(self, audio_bytes: bytes, params: dict) -> dict:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            segments, info = self.model.transcribe(
                tmp_path,
                language=params.get("language"),
                temperature=params.get("temperature", 0.0),
                beam_size=params.get("beam_size", 5),
                vad_filter=params.get("vad_filter", True),
                word_timestamps=params.get("word_timestamps", False),
            )

            segment_list = []
            full_text_parts = []
            for seg in segments:
                full_text_parts.append(seg.text.strip())
                segment_list.append({
                    "id": seg.id,
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3),
                    "text": seg.text.strip(),
                    "avg_logprob": round(seg.avg_logprob, 4),
                })

            text = " ".join(full_text_parts)
        finally:
            os.unlink(tmp_path)

        return {
            "text": text,
            "language": info.language,
            "duration": round(info.duration, 3),
            "task": "transcribe",
            "segments": segment_list,
        }

    async def transcribe(self, audio_bytes: bytes, params: dict) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._transcribe_sync, audio_bytes, params)

    def format_response(self, result: dict, response_format: str) -> any:
        if response_format == "text":
            return result["text"]
        if response_format == "srt":
            return self._to_srt(result["segments"])
        if response_format == "vtt":
            return self._to_vtt(result["segments"])
        if response_format == "verbose_json":
            return result
        # Default: json
        return {"text": result["text"], "language": result.get("language"), "duration": result.get("duration")}

    def _to_srt(self, segments: list) -> str:
        lines = []
        for i, seg in enumerate(segments, 1):
            start = _format_timestamp(seg["start"])
            end = _format_timestamp(seg["end"])
            lines.append(f"{i}\n{start} --> {end}\n{seg['text']}\n")
        return "\n".join(lines)

    def _to_vtt(self, segments: list) -> str:
        lines = ["WEBVTT\n"]
        for seg in segments:
            start = _format_timestamp(seg["start"]).replace(",", ".")
            end = _format_timestamp(seg["end"]).replace(",", ".")
            lines.append(f"{start} --> {end}\n{seg['text']}\n")
        return "\n".join(lines)


def _format_timestamp(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")
