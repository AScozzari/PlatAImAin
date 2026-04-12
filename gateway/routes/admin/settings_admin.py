"""
Admin API — Platform Settings (chiavi cifrate AES-256-GCM).

Tutte le chiavi sono salvate in `platform_settings` con valore cifrato.
La chiave AES-256 viene caricata da env var SETTINGS_ENCRYPTION_KEY (base64url, 32 byte).

Endpoints:
  GET    /admin/settings                     lista tutte le chiavi (valori oscurati)
  GET    /admin/settings/:key                valore decifrato di una chiave
  PUT    /admin/settings/:key                salva/aggiorna chiave (cifrata)
  DELETE /admin/settings/:key                rimuove una chiave
  POST   /admin/settings/s3/test             testa connessione S3
  POST   /admin/settings/runpod/test         testa connessione RunPod
  POST   /admin/settings/pii/toggle          abilita/disabilita categoria PII
"""

import base64
import json
import logging
import os
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from gateway.middleware.admin_auth import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin-settings"])

# ─── Encryption helpers ───────────────────────────────────────────────────────

def _get_encryption_key() -> bytes:
    """Load AES-256 key from env var (base64url-encoded 32 bytes)."""
    raw = os.environ.get("SETTINGS_ENCRYPTION_KEY", "")
    if not raw or raw == "CHANGE_ME_generate_32_byte_base64url_key":
        raise RuntimeError(
            "SETTINGS_ENCRYPTION_KEY not configured. "
            "Generate with: python -c \"import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())\""
        )
    try:
        key = base64.urlsafe_b64decode(raw + "==")  # padding-safe
        if len(key) != 32:
            raise ValueError(f"Key must be 32 bytes, got {len(key)}")
        return key
    except Exception as e:
        raise RuntimeError(f"Invalid SETTINGS_ENCRYPTION_KEY: {e}") from e


def _encrypt(plaintext: str) -> str:
    """Encrypt string using AES-256-GCM. Returns base64-encoded nonce+ciphertext."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = _get_encryption_key()
    nonce = os.urandom(12)   # 96-bit nonce (GCM recommended)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + ct).decode("ascii")


def _decrypt(ciphertext: str) -> str:
    """Decrypt AES-256-GCM ciphertext. Raises ValueError on tamper."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = _get_encryption_key()
    data = base64.urlsafe_b64decode(ciphertext + "==")
    nonce, ct = data[:12], data[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode("utf-8")


# ─── DB helpers ───────────────────────────────────────────────────────────────

async def _get_db():
    from gateway.db.postgres import get_pool
    return get_pool()


async def _upsert(key: str, value: str, category: str,
                  description: Optional[str], updated_by: str) -> dict:
    db = await _get_db()
    row = await db.fetchrow(
        """
        INSERT INTO platform_settings (key, value, category, description, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (key) DO UPDATE
            SET value       = EXCLUDED.value,
                category    = EXCLUDED.category,
                description = COALESCE(EXCLUDED.description, platform_settings.description),
                updated_by  = EXCLUDED.updated_by,
                updated_at  = NOW()
        RETURNING key, category, description, updated_by, updated_at
        """,
        key, value, category, description, updated_by,
    )
    return dict(row)


async def _fetch_all() -> list[dict]:
    db = await _get_db()
    rows = await db.fetch(
        "SELECT key, category, description, updated_by, updated_at FROM platform_settings ORDER BY category, key"
    )
    return [dict(r) for r in rows]


async def _fetch_one(key: str) -> Optional[dict]:
    db = await _get_db()
    row = await db.fetchrow("SELECT * FROM platform_settings WHERE key=$1", key)
    return dict(row) if row else None


async def _delete(key: str) -> bool:
    db = await _get_db()
    result = await db.execute("DELETE FROM platform_settings WHERE key=$1", key)
    return result == "DELETE 1"


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class SettingUpsert(BaseModel):
    value: str               # plaintext — will be encrypted before storage
    category: str            # s3 | runpod | registry | pii | general
    description: Optional[str] = None


class BulkSettingsUpsert(BaseModel):
    settings: dict[str, str]   # key → plaintext value
    category: str
    description: Optional[str] = None


class PiiToggle(BaseModel):
    entity_type: str   # CF | PIVA | IBAN | CC | EMAIL | PHONE | ADDRESS | PERSON
    enabled: bool


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/settings")
async def list_settings(_: dict = Depends(require_admin)):
    """List all settings keys (values are hidden)."""
    rows = await _fetch_all()
    for r in rows:
        if hasattr(r.get("updated_at"), "isoformat"):
            r["updated_at"] = r["updated_at"].isoformat()
    return {"settings": rows}


@router.get("/settings/{key:path}")
async def get_setting(key: str, admin: dict = Depends(require_admin)):
    """Retrieve and decrypt a single setting."""
    row = await _fetch_one(key)
    if not row:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    try:
        value = _decrypt(row["value"])
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt setting")
    return {
        "key": row["key"],
        "category": row["category"],
        "value": value,
        "description": row.get("description"),
        "updated_by": row.get("updated_by"),
        "updated_at": row["updated_at"].isoformat() if hasattr(row.get("updated_at"), "isoformat") else None,
    }


@router.put("/settings/{key:path}", status_code=200)
async def upsert_setting(
    key: str,
    body: SettingUpsert,
    admin: dict = Depends(require_admin),
):
    """Create or update a platform setting (value is AES-256-GCM encrypted)."""
    try:
        encrypted = _encrypt(body.value)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    row = await _upsert(key, encrypted, body.category, body.description, admin.get("email", ""))
    if hasattr(row.get("updated_at"), "isoformat"):
        row["updated_at"] = row["updated_at"].isoformat()
    return {"ok": True, "key": key, **row}


@router.put("/settings-bulk", status_code=200)
async def upsert_settings_bulk(
    body: BulkSettingsUpsert,
    admin: dict = Depends(require_admin),
):
    """Save multiple settings at once (e.g., all S3 keys in one call)."""
    saved = []
    try:
        for key, value in body.settings.items():
            encrypted = _encrypt(value)
            row = await _upsert(key, encrypted, body.category, body.description, admin.get("email", ""))
            saved.append(key)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    # Reload external services if category known
    await _reload_service(body.category)
    return {"ok": True, "saved": saved}


@router.delete("/settings/{key:path}", status_code=204)
async def delete_setting(key: str, _: dict = Depends(require_admin)):
    ok = await _delete(key)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")


# ─── S3 test ──────────────────────────────────────────────────────────────────

@router.post("/settings/s3/test")
async def test_s3(_: dict = Depends(require_admin)):
    """Load S3 settings from DB and test connectivity."""
    try:
        ak  = await _get_plain("s3.access_key_id")
        sk  = await _get_plain("s3.secret_access_key")
        reg = await _get_plain("s3.region") or "eu-west-1"
        bkt = await _get_plain("s3.bucket_name")
        ep  = await _get_plain("s3.endpoint_url") or None

        if not ak or not bkt:
            return {"ok": False, "error": "S3 credentials not fully configured"}

        from gateway.services import s3_manager
        s3_manager.configure(ak, sk, reg, bkt, ep)
        return await s3_manager.test_connection()
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ─── RunPod test ──────────────────────────────────────────────────────────────

@router.post("/settings/runpod/test")
async def test_runpod(_: dict = Depends(require_admin)):
    """Load RunPod API key from DB and test connectivity."""
    try:
        api_key = await _get_plain("runpod.api_key")
        if not api_key:
            return {"ok": False, "error": "RunPod API key not configured"}

        from gateway.services import runpod_manager
        runpod_manager.set_api_key(api_key)
        result = await runpod_manager.test_connection()
        if result.get("ok"):
            gpu_types = await runpod_manager.list_gpu_types()
            result["gpu_types"] = gpu_types
        return result
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ─── PII toggle ───────────────────────────────────────────────────────────────

@router.post("/settings/pii/toggle")
async def toggle_pii_entity(body: PiiToggle, admin: dict = Depends(require_admin)):
    """Enable or disable a PII entity type for tokenization."""
    from gateway.services import pii_tokenizer
    pii_tokenizer.set_enabled(body.entity_type, body.enabled)
    # Persist toggle in platform_settings
    key = f"pii.enabled.{body.entity_type.lower()}"
    encrypted = _encrypt(str(body.enabled).lower())
    await _upsert(key, encrypted, "pii", f"PII toggle for {body.entity_type}", admin.get("email", ""))
    return {"ok": True, "entity_type": body.entity_type, "enabled": body.enabled}


@router.get("/settings/pii/toggles")
async def get_pii_toggles(_: dict = Depends(require_admin)):
    """Return current PII entity toggle states."""
    from gateway.services import pii_tokenizer
    # Sync from DB (if stored)
    db = await _get_db()
    rows = await db.fetch("SELECT key, value FROM platform_settings WHERE key LIKE 'pii.enabled.%'")
    for row in rows:
        entity_type = row["key"].split(".")[-1].upper()
        try:
            value = _decrypt(row["value"])
            pii_tokenizer.set_enabled(entity_type, value == "true")
        except Exception:
            pass
    return {"toggles": pii_tokenizer._enabled}


# ─── Internal helpers ─────────────────────────────────────────────────────────

async def _get_plain(key: str) -> Optional[str]:
    """Fetch and decrypt a setting value, returning None if not found."""
    row = await _fetch_one(key)
    if not row:
        return None
    try:
        return _decrypt(row["value"])
    except Exception:
        return None


async def _reload_service(category: str) -> None:
    """After bulk save, reload the relevant service with new credentials."""
    try:
        if category == "s3":
            ak  = await _get_plain("s3.access_key_id")
            sk  = await _get_plain("s3.secret_access_key")
            reg = await _get_plain("s3.region") or "eu-west-1"
            bkt = await _get_plain("s3.bucket_name")
            ep  = await _get_plain("s3.endpoint_url") or None
            if ak and bkt:
                from gateway.services import s3_manager
                s3_manager.configure(ak, sk, reg, bkt, ep)
                logger.info("S3Manager reconfigured from DB settings")
        elif category == "runpod":
            api_key = await _get_plain("runpod.api_key")
            if api_key:
                from gateway.services import runpod_manager
                runpod_manager.set_api_key(api_key)
                logger.info("RunPodManager reconfigured from DB settings")
    except Exception as e:
        logger.warning("_reload_service(%s) error: %s", category, e)


async def load_settings_on_startup() -> None:
    """
    Called from startup.py: load S3 + RunPod credentials from DB into managers.
    Silently skips if not yet configured.
    """
    try:
        ak = await _get_plain("s3.access_key_id")
        sk = await _get_plain("s3.secret_access_key")
        bkt = await _get_plain("s3.bucket_name")
        if ak and sk and bkt:
            reg = await _get_plain("s3.region") or "eu-west-1"
            ep  = await _get_plain("s3.endpoint_url") or None
            from gateway.services import s3_manager
            s3_manager.configure(ak, sk, reg, bkt, ep)
            logger.info("S3Manager loaded from DB settings")
    except Exception as e:
        logger.debug("S3 settings not loaded (not configured yet): %s", e)

    try:
        api_key = await _get_plain("runpod.api_key")
        if api_key:
            from gateway.services import runpod_manager
            runpod_manager.set_api_key(api_key)
            logger.info("RunPodManager loaded from DB settings")
    except Exception as e:
        logger.debug("RunPod settings not loaded (not configured yet): %s", e)

    # Restore PII toggles from DB
    try:
        db = await _get_db()
        rows = await db.fetch("SELECT key, value FROM platform_settings WHERE key LIKE 'pii.enabled.%'")
        from gateway.services import pii_tokenizer
        for row in rows:
            entity_type = row["key"].split(".")[-1].upper()
            try:
                value = _decrypt(row["value"])
                pii_tokenizer.set_enabled(entity_type, value == "true")
            except Exception:
                pass
        if rows:
            logger.info("PII toggles restored from DB settings")
    except Exception as e:
        logger.debug("PII toggles not loaded: %s", e)
