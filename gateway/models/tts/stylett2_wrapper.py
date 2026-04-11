import asyncio
import io
import logging
import wave
from typing import Optional

import numpy as np

from gateway.models.base import ModelWrapper

logger = logging.getLogger(__name__)


class StyleTTS2Wrapper(ModelWrapper):

    def _load_sync(self) -> None:
        from gateway.config.settings import get_settings
        import styletts2

        settings = get_settings()
        model_path = settings.stylett2_model_path
        logger.info("Loading StyleTTS2 from %s", model_path)
        self.tts = styletts2.load(model_path=model_path)
        logger.info("StyleTTS2 loaded")

    def _synthesize_sync(self, text: str, params: dict) -> bytes:
        alpha = params.get("alpha", 0.3)
        beta = params.get("beta", 0.7)
        diffusion_steps = params.get("diffusion_steps", 5)

        audio = self.tts.inference(
            text,
            alpha=alpha,
            beta=beta,
            diffusion_steps=diffusion_steps,
        )

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes((np.array(audio) * 32767).astype(np.int16).tobytes())
        return buf.getvalue()

    async def synthesize(self, text: str, params: dict, voice_wav_path: Optional[str] = None) -> bytes:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._synthesize_sync, text, params)
