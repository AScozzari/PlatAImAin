import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

from gateway.db import postgres as db

logger = logging.getLogger(__name__)


def _get_settings():
    from gateway.config.settings import get_settings
    return get_settings()


def hash_password(plain: str) -> str:
    settings = _get_settings()
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(settings.bcrypt_rounds)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: str, role: str) -> str:
    settings = _get_settings()
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    settings = _get_settings()
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def _make_refresh_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(64)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


async def login(
    email: str,
    password: str,
    device_info: Optional[str] = None,
    ip: Optional[str] = None,
) -> dict:
    settings = _get_settings()
    user = await db.fetchrow(
        "SELECT * FROM admin_users WHERE email = $1 AND is_active = true", email
    )
    if not user or not verify_password(password, user["password_hash"]):
        raise ValueError("Invalid credentials")

    # Enforce max sessions
    active_count = await db.fetchval(
        "SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()",
        user["id"],
    )
    if active_count >= settings.max_sessions_per_user:
        # Revoke oldest session
        await db.execute(
            """
            UPDATE refresh_tokens SET revoked_at = NOW()
            WHERE id = (
                SELECT id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL
                ORDER BY created_at ASC LIMIT 1
            )
            """,
            user["id"],
        )

    access_token = create_access_token(str(user["id"]), user["role"])
    refresh_raw, refresh_hash = _make_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)

    await db.execute(
        """
        INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        """,
        user["id"],
        refresh_hash,
        device_info,
        ip,
        expires_at,
    )
    await db.execute(
        "UPDATE admin_users SET last_login_at = NOW() WHERE id = $1", user["id"]
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_raw,
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
    }


async def refresh_tokens(refresh_raw: str) -> dict:
    settings = _get_settings()
    token_hash = hashlib.sha256(refresh_raw.encode()).hexdigest()
    record = await db.fetchrow(
        """
        SELECT rt.*, u.role FROM refresh_tokens rt
        JOIN admin_users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1
          AND rt.revoked_at IS NULL
          AND rt.expires_at > NOW()
          AND u.is_active = true
        """,
        token_hash,
    )
    if not record:
        raise ValueError("Invalid or expired refresh token")

    # Rotate: revoke old, issue new
    new_raw, new_hash = _make_refresh_token()
    new_expires = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)

    await db.execute(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1", record["id"]
    )
    await db.execute(
        """
        INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        """,
        record["user_id"],
        new_hash,
        record["device_info"],
        record["ip_address"],
        new_expires,
    )

    return {
        "access_token": create_access_token(str(record["user_id"]), record["role"]),
        "refresh_token": new_raw,
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
    }


async def logout(refresh_raw: str) -> None:
    token_hash = hashlib.sha256(refresh_raw.encode()).hexdigest()
    await db.execute(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1", token_hash
    )


async def get_or_create_oauth_user(
    provider: str, provider_user_id: str, provider_email: str
) -> Optional[dict]:
    """Find admin user linked to OAuth account. Returns None if email not authorized."""
    user = await db.fetchrow(
        """
        SELECT u.* FROM admin_users u
        JOIN oauth2_accounts oa ON oa.user_id = u.id
        WHERE oa.provider = $1 AND oa.provider_user_id = $2 AND u.is_active = true
        """,
        provider,
        provider_user_id,
    )
    if user:
        return dict(user) | {"id": str(user["id"])}

    # Try to link by email
    user = await db.fetchrow(
        "SELECT * FROM admin_users WHERE email = $1 AND is_active = true", provider_email
    )
    if not user:
        return None

    await db.execute(
        """
        INSERT INTO oauth2_accounts (user_id, provider, provider_user_id, provider_email)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
        """,
        user["id"],
        provider,
        provider_user_id,
        provider_email,
    )
    return dict(user) | {"id": str(user["id"])}


async def create_admin_user(email: str, password: str, name: str = "") -> dict:
    password_hash = hash_password(password)
    row = await db.fetchrow(
        """
        INSERT INTO admin_users (email, password_hash, name)
        VALUES ($1, $2, $3)
        RETURNING id, email, name, role, is_active, created_at
        """,
        email,
        password_hash,
        name,
    )
    return dict(row) | {"id": str(row["id"])}
