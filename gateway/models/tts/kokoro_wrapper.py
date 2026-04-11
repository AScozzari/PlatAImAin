import asyncio
import io
import logging
import wave
from typing import Optional

import numpy as np

from gateway.models.base import ModelWrapper

logger = logging.getLogger(__name__)


class KokoroWrapper(ModelWrapper):

    def _load_sync(self) -> None:
        import kokoro
        from gateway.config.settings import get_settings

        settings = get_settings()
        logger.info("Loading Kokoro TTS from %s", settings.kokoro_model_path)
        self.pipeline = kokoro.KPipeline(lang_code="a")  # 'a' = American English
        logger.info("Kokoro TTS loaded")

    def _synthesize_sync(self, text: str, params: dict) -> bytes:
        voice = params.get("voice", "af_heart")
        speed = params.get("speed", 1.0)

        audio_chunks = []
        for _, _, audio in self.pipeline(text, voice=voice, speed=speed):
            audio_chunks.append(audio)

        if not audio_chunks:
            return b""

        audio = np.concatenate(audio_chunks)
        return _to_wav_bytes(audio, sample_rate=24000)

    async def synthesize(self, text: str, params: dict, voice_wav_path: Optional[str] = None) -> bytes:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._synthesize_sync, text, params)

    def builtin_voices(self) -> list[str]:
        return [
            "af_heart", "af_bella", "af_nicole",
            "am_adam", "am_michael",
            "bf_emma", "bf_isabella",
            "bm_george", "bm_lewis",
        ]


def _to_wav_bytes(audio: np.ndarray, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes((audio * 32767).astype(np.int16).tobytes())
    return buf.getvalue()
