import hashlib
import json
import logging
import secrets
import string
from typing import Optional
from uuid import UUID

from gateway.db import postgres as db
from gateway.db import redis as cache

logger = logging.getLogger(__name__)

TENANT_CACHE_TTL = 60  # seconds
API_KEY_LENGTH = 48


def _hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()


def _cache_key(api_key_hash: str) -> str:
    return f"tenant:key:{api_key_hash}"


def generate_api_key() -> str:
    alphabet = string.ascii_letters + string.digits
    return "cai-" + "".join(secrets.choice(alphabet) for _ in range(API_KEY_LENGTH))


async def get_tenant_by_api_key(api_key: str) -> Optional[dict]:
    key_hash = _hash_api_key(api_key)
    cache_key = _cache_key(key_hash)

    # Try cache first
    cached = await cache.get_str(cache_key)
    if cached:
        return json.loads(cached)

    # DB lookup
    row = await db.fetchrow(
        """
        SELECT id, name, plan, is_active, metadata
        FROM tenants
        WHERE api_key_hash = $1
        """,
        key_hash,
    )
    if not row:
        return None

    tenant = dict(row)
    tenant["id"] = str(tenant["id"])
    if isinstance(tenant.get("metadata"), str):
        tenant["metadata"] = json.loads(tenant["metadata"])

    if not tenant["is_active"]:
        return None

    # Cache for TTL seconds
    await cache.set_str(cache_key, json.dumps(tenant), expire_seconds=TENANT_CACHE_TTL)
    return tenant


async def get_tenant_by_id(tenant_id: str) -> Optional[dict]:
    row = await db.fetchrow(
        "SELECT id, name, plan, is_active, metadata, created_at FROM tenants WHERE id = $1",
        tenant_id,
    )
    if not row:
        return None
    tenant = dict(row)
    tenant["id"] = str(tenant["id"])
    return tenant


async def get_tenant_model_assignments(tenant_id: str) -> dict:
    rows = await db.fetch(
        "SELECT category, model_id FROM tenant_model_assignments WHERE tenant_id = $1",
        tenant_id,
    )
    return {row["category"]: row["model_id"] for row in rows}


async def create_tenant(name: str, plan: str = "starter", metadata: dict = None) -> dict:
    api_key = generate_api_key()
    key_hash = _hash_api_key(api_key)
    row = await db.fetchrow(
        """
        INSERT INTO tenants (name, api_key_hash, plan, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, plan, is_active, metadata, created_at
        """,
        name,
        key_hash,
        plan,
        json.dumps(metadata or {}),
    )
    tenant = dict(row)
    tenant["id"] = str(tenant["id"])
    tenant["api_key"] = api_key  # returned only on creation
    return tenant


async def regenerate_api_key(tenant_id: str) -> str:
    new_key = generate_api_key()
    new_hash = _hash_api_key(new_key)

    old_row = await db.fetchrow(
        "SELECT api_key_hash FROM tenants WHERE id = $1", tenant_id
    )
    if old_row:
        await cache.delete(_cache_key(old_row["api_key_hash"]))

    await db.execute(
        "UPDATE tenants SET api_key_hash = $1, updated_at = NOW() WHERE id = $2",
        new_hash,
        tenant_id,
    )
    return new_key


async def update_tenant(tenant_id: str, **kwargs) -> Optional[dict]:
    allowed = {"name", "plan", "is_active", "metadata"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return await get_tenant_by_id(tenant_id)

    # Invalidate cache
    row = await db.fetchrow("SELECT api_key_hash FROM tenants WHERE id = $1", tenant_id)
    if row:
        await cache.delete(_cache_key(row["api_key_hash"]))

    set_clauses = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    values = list(updates.values())
    if "metadata" in updates and isinstance(updates["metadata"], dict):
        values[list(updates.keys()).index("metadata")] = json.dumps(updates["metadata"])

    await db.execute(
        f"UPDATE tenants SET {set_clauses}, updated_at = NOW() WHERE id = $1",
        tenant_id,
        *values,
    )
    return await get_tenant_by_id(tenant_id)


async def list_tenants(limit: int = 100, offset: int = 0) -> list[dict]:
    rows = await db.fetch(
        """
        SELECT id, name, plan, is_active, metadata, created_at, updated_at
        FROM tenants
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
        """,
        limit,
        offset,
    )
    return [dict(r) | {"id": str(r["id"])} for r in rows]


async def count_tenants() -> int:
    return await db.fetchval("SELECT COUNT(*) FROM tenants")
