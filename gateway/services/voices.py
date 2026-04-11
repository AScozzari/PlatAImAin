import io
import logging
import os
from pathlib import Path
from typing import Optional
from uuid import UUID

from gateway.db import postgres as db

logger = logging.getLogger(__name__)


def _get_voices_path() -> Path:
    from gateway.config.settings import get_settings
    return Path(get_settings().voices_storage_path)


async def list_tenant_voices(tenant_id: str) -> list[dict]:
    rows = await db.fetch(
        """
        SELECT id, voice_name, is_default, language, created_at
        FROM tenant_voices
        WHERE tenant_id = $1
        ORDER BY is_default DESC, created_at DESC
        """,
        tenant_id,
    )
    return [dict(r) | {"id": str(r["id"])} for r in rows]


async def get_tenant_voice_path(tenant_id: str, voice_name: str) -> Optional[str]:
    """Return file path for tenant custom voice, or None for built-in voices."""
    if not voice_name or voice_name in _builtin_voices():
        return None

    row = await db.fetchrow(
        """
        SELECT voice_file_path FROM tenant_voices
        WHERE tenant_id = $1 AND voice_name = $2
        """,
        tenant_id,
        voice_name,
    )
    if row and row["voice_file_path"] and os.path.exists(row["voice_file_path"]):
        return row["voice_file_path"]
    return None


async def save_tenant_voice(
    tenant_id: str,
    voice_name: str,
    audio_bytes: bytes,
    language: str = "it",
) -> dict:
    # Save WAV file to disk
    voices_dir = _get_voices_path() / tenant_id
    voices_dir.mkdir(parents=True, exist_ok=True)
    file_path = str(voices_dir / f"{voice_name}.wav")

    with open(file_path, "wb") as f:
        f.write(audio_bytes)

    # Generate speaker embedding via XTTS if available
    speaker_embedding = await _generate_speaker_embedding(file_path)

    row = await db.fetchrow(
        """
        INSERT INTO tenant_voices (tenant_id, voice_name, voice_file_path, speaker_embedding, language)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, voice_name) DO UPDATE
            SET voice_file_path = EXCLUDED.voice_file_path,
                speaker_embedding = EXCLUDED.speaker_embedding,
                language = EXCLUDED.language
        RETURNING id, voice_name, is_default, language, created_at
        """,
        tenant_id,
        voice_name,
        file_path,
        speaker_embedding,
        language,
    )
    return dict(row) | {"id": str(row["id"])}


async def _generate_speaker_embedding(wav_path: str) -> Optional[bytes]:
    """Generate XTTS speaker embedding and serialize to bytes."""
    try:
        from gateway.models.tts.xtts_wrapper import XTTSWrapper
        import numpy as np
        wrapper = XTTSWrapper.get_instance_sync()
        if not wrapper or not wrapper.is_loaded:
            return None
        embedding = wrapper.get_speaker_embedding(wav_path)
        if embedding is None:
            return None
        buf = io.BytesIO()
        np.save(buf, embedding)
        return buf.getvalue()
    except Exception as e:
        logger.warning("Could not generate speaker embedding: %s", e)
        return None


async def delete_tenant_voice(tenant_id: str, voice_name: str) -> bool:
    row = await db.fetchrow(
        "SELECT id, voice_file_path FROM tenant_voices WHERE tenant_id = $1 AND voice_name = $2",
        tenant_id,
        voice_name,
    )
    if not row:
        return False

    # Delete file from disk
    if row["voice_file_path"] and os.path.exists(row["voice_file_path"]):
        os.remove(row["voice_file_path"])

    await db.execute(
        "DELETE FROM tenant_voices WHERE id = $1", row["id"]
    )
    return True


async def set_default_voice(tenant_id: str, voice_name: str) -> bool:
    await db.execute(
        "UPDATE tenant_voices SET is_default = false WHERE tenant_id = $1", tenant_id
    )
    result = await db.execute(
        "UPDATE tenant_voices SET is_default = true WHERE tenant_id = $1 AND voice_name = $2",
        tenant_id,
        voice_name,
    )
    return result == "UPDATE 1"


def _builtin_voices() -> list[str]:
    return [
        # XTTS V2 built-in
        "Claribel Dervla", "Daisy Studious", "Gracie Wise", "Ana Florence",
        "Sofia Hellen", "Andrew Chipper", "Badr Odhiambo", "Dionisio Schuyler",
        "Viktor Eka", "Craig Gutsy", "Damien Black",
        # Kokoro built-in
        "af_heart", "af_bella", "af_nicole", "am_adam", "am_michael",
        "bf_emma", "bf_isabella", "bm_george", "bm_lewis",
        # OpenAI-compat names
        "alloy", "echo", "fable", "onyx", "nova", "shimmer",
    ]


def get_all_voices() -> list[dict]:
    """Return list of built-in voices."""
    voices = []
    for v in _builtin_voices():
        voices.append({"name": v, "type": "builtin", "voice_cloning": False})
    return voices
