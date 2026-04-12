"""
S3 Manager — storage centralizzato per asset e Docker registry.

Supporta:
  - AWS S3 nativo
  - S3-compatible (Cloudflare R2, MinIO) tramite endpoint_url custom

Usi principali:
  - Voice files tenant (sostituisce /data/voices)
  - Billing report export (CSV/JSON)
  - Upload temporanei (multipart)
  - Docker registry layers (tramite registry:2 con S3 storage driver)

Credenziali: caricate da platform_settings al primo uso (lazy init).
"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_s3_client = None   # boto3.client — lazy init
_config: dict = {}  # cache configurazione corrente


# ─── Init ─────────────────────────────────────────────────────────────────────

def configure(
    access_key_id: str,
    secret_access_key: str,
    region: str,
    bucket_name: str,
    endpoint_url: Optional[str] = None,
) -> None:
    """
    Configura (o riconfigura) il client S3.
    Chiamato da settings_admin quando le credenziali vengono salvate.
    """
    global _s3_client, _config
    import boto3
    kwargs: dict = {
        "service_name": "s3",
        "region_name": region,
        "aws_access_key_id": access_key_id,
        "aws_secret_access_key": secret_access_key,
    }
    if endpoint_url:
        kwargs["endpoint_url"] = endpoint_url
    _s3_client = boto3.client(**kwargs)
    _config = {
        "bucket_name": bucket_name,
        "region": region,
        "endpoint_url": endpoint_url,
    }
    logger.info("S3Manager configured: bucket=%s region=%s endpoint=%s",
                bucket_name, region, endpoint_url or "AWS")


def _get_client():
    global _s3_client, _config
    if _s3_client is None:
        # Fallback: leggi da env vars (per compatibilità con .env locale)
        ak  = os.environ.get("S3_ACCESS_KEY_ID", "")
        sk  = os.environ.get("S3_SECRET_ACCESS_KEY", "")
        reg = os.environ.get("S3_REGION", "eu-west-1")
        bkt = os.environ.get("S3_BUCKET_NAME", "")
        ep  = os.environ.get("S3_ENDPOINT_URL") or None
        if not ak or not bkt:
            raise RuntimeError("S3 not configured — set credentials in Platform Settings")
        configure(ak, sk, reg, bkt, ep)
    return _s3_client, _config["bucket_name"]


# ─── Operations ───────────────────────────────────────────────────────────────

async def upload_file(
    key: str,
    data: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """
    Upload bytes to S3. Returns the S3 URI (s3://bucket/key).
    Eseguito in executor per non bloccare l'event loop.
    """
    import asyncio
    client, bucket = _get_client()

    def _upload():
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _upload)
    logger.debug("S3 upload: s3://%s/%s (%d bytes)", bucket, key, len(data))
    return f"s3://{bucket}/{key}"


async def download_file(key: str) -> bytes:
    """Download object from S3 and return bytes."""
    import asyncio
    client, bucket = _get_client()

    def _download():
        response = client.get_object(Bucket=bucket, Key=key)
        return response["Body"].read()

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _download)


async def delete_file(key: str) -> None:
    """Delete an object from S3."""
    import asyncio
    client, bucket = _get_client()

    def _delete():
        client.delete_object(Bucket=bucket, Key=key)

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _delete)
    logger.debug("S3 delete: s3://%s/%s", bucket, key)


async def list_files(prefix: str = "") -> list[str]:
    """List object keys under a prefix."""
    import asyncio
    client, bucket = _get_client()

    def _list():
        paginator = client.get_paginator("list_objects_v2")
        keys = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                keys.append(obj["Key"])
        return keys

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _list)


async def get_presigned_url(key: str, expires: int = 3600) -> str:
    """
    Generate a pre-signed GET URL for temporary public access.
    Usato per download voice files, billing reports, ecc.
    """
    import asyncio
    client, bucket = _get_client()

    def _presign():
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires,
        )

    loop = asyncio.get_event_loop()
    url = await loop.run_in_executor(None, _presign)
    return url


async def copy_file(src_key: str, dst_key: str) -> None:
    """Copy an object within the same bucket."""
    import asyncio
    client, bucket = _get_client()

    def _copy():
        client.copy_object(
            Bucket=bucket,
            CopySource={"Bucket": bucket, "Key": src_key},
            Key=dst_key,
        )

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _copy)


# ─── Voice file helpers ───────────────────────────────────────────────────────

def voice_key(tenant_id: str, voice_name: str) -> str:
    """Standard S3 key for a tenant voice file."""
    return f"voices/{tenant_id}/{voice_name}.wav"


async def upload_voice(tenant_id: str, voice_name: str, wav_bytes: bytes) -> str:
    """Upload a WAV voice file for a tenant. Returns the S3 URI."""
    key = voice_key(tenant_id, voice_name)
    return await upload_file(key, wav_bytes, content_type="audio/wav")


async def get_voice_path(tenant_id: str, voice_name: str) -> Optional[str]:
    """
    Return the S3 URI if the voice file exists, else None.
    For tts-service: passes the URI; tts-service downloads from S3 if needed.
    """
    key = voice_key(tenant_id, voice_name)
    try:
        client, bucket = _get_client()
        import asyncio
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: client.head_object(Bucket=bucket, Key=key))
        return f"s3://{bucket}/{key}"
    except Exception:
        return None


# ─── Billing report helpers ───────────────────────────────────────────────────

async def upload_billing_report(period: str, format: str, data: bytes) -> str:
    """
    Upload a billing report. Returns presigned URL (1h expiry).
    period: es. "2026-04"
    format: "csv" | "json"
    """
    key = f"reports/billing/{period}.{format}"
    await upload_file(key, data, content_type=f"text/{format}")
    return await get_presigned_url(key, expires=3600)


# ─── Connectivity test ────────────────────────────────────────────────────────

async def test_connection() -> dict:
    """Used by settings_admin to verify S3 credentials."""
    try:
        client, bucket = _get_client()
        import asyncio
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: client.head_bucket(Bucket=bucket)
        )
        return {"ok": True, "bucket": bucket}
    except Exception as e:
        return {"ok": False, "error": str(e)}
