import asyncio
import logging
import os
import tempfile
from typing import Optional

from base import ModelWrapper

logger = logging.getLogger(__name__)


class XTTSWrapper(ModelWrapper):
    # Semaphore to serialize inference (XTTS V2 is not thread-safe)
    _inference_lock: asyncio.Semaphore

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)

    def _load_sync(self) -> None:
        from TTS.api import TTS

        model_path = os.environ.get("XTTS_MODEL_PATH", "/models/tts/xtts-v2")

        logger.info("Loading XTTS V2 from %s", model_path)
        self.tts = TTS(model_path=model_path, progress_bar=False).to("cuda")
        self._inference_lock = asyncio.Semaphore(1)
        logger.info("XTTS V2 loaded")

    def _synthesize_sync(self, text: str, params: dict, voice_wav_path: Optional[str] = None) -> bytes:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            self.tts.tts_to_file(
                text=text,
                file_path=tmp_path,
                speaker_wav=voice_wav_path,
                language=params.get("language", "it"),
                speed=params.get("speed", 1.0),
            )
            with open(tmp_path, "rb") as f:
                return f.read()
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    async def synthesize(self, text: str, params: dict, voice_wav_path: Optional[str] = None) -> bytes:
        async with self._inference_lock:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None, self._synthesize_sync, text, params, voice_wav_path
            )

    def get_speaker_embedding(self, wav_path: str) -> Optional[any]:
        try:
            import numpy as np
            gpt_cond_latent, speaker_embedding = self.tts.synthesizer.tts_model.get_conditioning_latents(
                audio_path=wav_path
            )
            return speaker_embedding.cpu().numpy()
        except Exception as e:
            logger.warning("Failed to get speaker embedding: %s", e)
            return None

    def builtin_voices(self) -> list[str]:
        return [
            "Claribel Dervla", "Daisy Studious", "Gracie Wise", "Ana Florence",
            "Sofia Hellen", "Andrew Chipper", "Badr Odhiambo", "Dionisio Schuyler",
            "Viktor Eka", "Craig Gutsy", "Damien Black",
        ]
