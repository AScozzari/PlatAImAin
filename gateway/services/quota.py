import logging
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Optional

from gateway.db import redis as cache
from gateway.db import postgres as db

logger = logging.getLogger(__name__)


@dataclass
class QuotaResult:
    allowed: bool
    used: int
    limit: int
    remaining: int
    reset_at: str


def _quota_key(tenant_id: str, category: str) -> str:
    period = datetime.now(timezone.utc).strftime("%Y-%m")
    return f"quota:{tenant_id}:{category}:{period}"


def _ratelimit_key(tenant_id: str) -> str:
    hour = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H")
    return f"ratelimit:{tenant_id}:{hour}"


def _next_month_reset() -> str:
    now = datetime.now(timezone.utc)
    if now.month == 12:
        reset = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        reset = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return reset.isoformat()


def _next_hour_reset() -> str:
    now = datetime.now(timezone.utc)
    reset = now.replace(minute=0, second=0, microsecond=0)
    return reset.replace(hour=now.hour + 1).isoformat() if now.hour < 23 else reset.replace(day=now.day + 1, hour=0).isoformat()


async def _get_quota_limit(tenant_id: str, category: str) -> int:
    """Return monthly token/second/char limit. 0 = unlimited."""
    row = await db.fetchrow(
        """
        SELECT monthly_token_limit, monthly_audio_seconds_limit, monthly_char_limit
        FROM tenant_quotas
        WHERE tenant_id = $1 AND model_category = $2 AND model_id IS NULL
        """,
        tenant_id,
        category,
    )
    if not row:
        return 0  # no quota configured = unlimited
    if category in ("stt",):
        return int(row["monthly_audio_seconds_limit"] or 0)
    if category in ("tts",):
        return int(row["monthly_char_limit"] or 0)
    return int(row["monthly_token_limit"] or 0)


async def check_quota(tenant_id: str, category: str, amount: int = 1) -> QuotaResult:
    """Check if tenant has quota available. Does NOT increment."""
    key = _quota_key(tenant_id, category)
    limit = await _get_quota_limit(tenant_id, category)
    used = await cache.get_quota_usage(key)
    remaining = max(0, limit - used) if limit > 0 else -1
    allowed = limit == 0 or used + amount <= limit
    return QuotaResult(
        allowed=allowed,
        used=used,
        limit=limit,
        remaining=remaining,
        reset_at=_next_month_reset(),
    )


async def increment_quota(tenant_id: str, category: str, amount: int) -> QuotaResult:
    """Atomically check and increment quota. Returns QuotaResult with allowed flag."""
    key = _quota_key(tenant_id, category)
    limit = await _get_quota_limit(tenant_id, category)
    new_val, lim, allowed = await cache.quota_check_and_increment(key, amount, limit)
    remaining = max(0, lim - new_val) if lim > 0 else -1
    return QuotaResult(
        allowed=bool(allowed),
        used=new_val,
        limit=lim,
        remaining=remaining,
        reset_at=_next_month_reset(),
    )


async def check_rate_limit(tenant_id: str, limit_per_hour: int) -> tuple[bool, int, int]:
    """
    Check rate limit (requests per hour).
    Returns (allowed, current_count, limit).
    """
    key = _ratelimit_key(tenant_id)
    current = await cache.incr(key, expire_seconds=3600)
    allowed = current <= limit_per_hour
    return allowed, current, limit_per_hour


async def get_tenant_quota_status(tenant_id: str) -> list[dict]:
    """Return quota status for all categories for a tenant."""
    quotas = await db.fetch(
        """
        SELECT model_category, monthly_token_limit, monthly_audio_seconds_limit, monthly_char_limit
        FROM tenant_quotas
        WHERE tenant_id = $1 AND model_id IS NULL
        """,
        tenant_id,
    )

    results = []
    for row in quotas:
        category = row["model_category"]
        key = _quota_key(tenant_id, category)
        used = await cache.get_quota_usage(key)

        if category in ("stt",):
            limit = float(row["monthly_audio_seconds_limit"] or 0)
            results.append({
                "model_category": category,
                "used_seconds": used,
                "limit_seconds": limit,
                "remaining_seconds": max(0, limit - used) if limit > 0 else None,
                "reset_at": _next_month_reset(),
            })
        elif category in ("tts",):
            limit = int(row["monthly_char_limit"] or 0)
            results.append({
                "model_category": category,
                "used_characters": used,
                "limit_characters": limit,
                "remaining_characters": max(0, limit - used) if limit > 0 else None,
                "reset_at": _next_month_reset(),
            })
        else:
            limit = int(row["monthly_token_limit"] or 0)
            results.append({
                "model_category": category,
                "used_tokens": used,
                "limit_tokens": limit,
                "remaining_tokens": max(0, limit - used) if limit > 0 else None,
                "percent_used": round(used / limit * 100, 1) if limit > 0 else None,
                "reset_at": _next_month_reset(),
            })
    return results
