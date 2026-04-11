import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse

from gateway.config.auth import (
    GITHUB_AUTH_URL, GITHUB_EMAIL_URL, GITHUB_TOKEN_URL, GITHUB_USERINFO_URL,
    GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL,
)
from gateway.db import postgres as db
from gateway.services.auth_service import (
    create_access_token, get_or_create_oauth_user, _make_refresh_token,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/oauth2", tags=["oauth2"])

# In-memory state store (use Redis in multi-instance setups)
_oauth_states: dict[str, str] = {}


def _get_settings():
    from gateway.config.settings import get_settings
    return get_settings()


# ─── Google ──────────────────────────────────────────────────────────────────

@router.get("/google")
async def google_redirect():
    settings = _get_settings()
    if not settings.oauth2_google_client_id:
        return JSONResponse(status_code=501, content={"error": "Google OAuth2 not configured"})

    state = secrets.token_urlsafe(32)
    _oauth_states[state] = "google"

    params = (
        f"?client_id={settings.oauth2_google_client_id}"
        f"&redirect_uri={settings.oauth2_google_redirect_uri}"
        f"&response_type=code"
        f"&scope=openid+email+profile"
        f"&state={state}"
        f"&access_type=offline"
        f"&prompt=consent"
    )
    return RedirectResponse(GOOGLE_AUTH_URL + params)


@router.get("/google/callback")
async def google_callback(code: str, state: str):
    settings = _get_settings()
    if _oauth_states.pop(state, None) != "google":
        return JSONResponse(status_code=400, content={"error": "Invalid OAuth2 state"})

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.oauth2_google_client_id,
            "client_secret": settings.oauth2_google_client_secret,
            "redirect_uri": settings.oauth2_google_redirect_uri,
            "grant_type": "authorization_code",
        })
        access = token_resp.json().get("access_token")
        if not access:
            return JSONResponse(status_code=400, content={"error": "Failed to get Google access token"})

        profile_resp = await client.get(
            GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access}"}
        )
        profile = profile_resp.json()

    user = await get_or_create_oauth_user(
        provider="google",
        provider_user_id=profile["sub"],
        provider_email=profile.get("email", ""),
    )
    if not user:
        return JSONResponse(status_code=403, content={"error": "Email not authorized as admin"})

    return await _issue_tokens_and_redirect(user, settings)


# ─── GitHub ──────────────────────────────────────────────────────────────────

@router.get("/github")
async def github_redirect():
    settings = _get_settings()
    if not settings.oauth2_github_client_id:
        return JSONResponse(status_code=501, content={"error": "GitHub OAuth2 not configured"})

    state = secrets.token_urlsafe(32)
    _oauth_states[state] = "github"

    params = (
        f"?client_id={settings.oauth2_github_client_id}"
        f"&redirect_uri={settings.oauth2_github_redirect_uri}"
        f"&scope=user:email"
        f"&state={state}"
    )
    return RedirectResponse(GITHUB_AUTH_URL + params)


@router.get("/github/callback")
async def github_callback(code: str, state: str):
    settings = _get_settings()
    if _oauth_states.pop(state, None) != "github":
        return JSONResponse(status_code=400, content={"error": "Invalid OAuth2 state"})

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GITHUB_TOKEN_URL,
            data={
                "client_id": settings.oauth2_github_client_id,
                "client_secret": settings.oauth2_github_client_secret,
                "code": code,
                "redirect_uri": settings.oauth2_github_redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        access = token_resp.json().get("access_token")
        if not access:
            return JSONResponse(status_code=400, content={"error": "Failed to get GitHub access token"})

        user_resp = await client.get(GITHUB_USERINFO_URL, headers={"Authorization": f"token {access}"})
        email_resp = await client.get(GITHUB_EMAIL_URL, headers={"Authorization": f"token {access}"})

        github_user = user_resp.json()
        emails = email_resp.json()

    primary_email = next(
        (e["email"] for e in emails if e.get("primary") and e.get("verified")),
        github_user.get("email", ""),
    )

    user = await get_or_create_oauth_user(
        provider="github",
        provider_user_id=str(github_user["id"]),
        provider_email=primary_email,
    )
    if not user:
        return JSONResponse(status_code=403, content={"error": "Email not authorized as admin"})

    return await _issue_tokens_and_redirect(user, settings)


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _issue_tokens_and_redirect(user: dict, settings) -> RedirectResponse:
    access_token = create_access_token(str(user["id"]), user["role"])
    refresh_raw, refresh_hash = _make_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)

    await db.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        user["id"], refresh_hash, expires_at,
    )
    await db.execute("UPDATE admin_users SET last_login_at = NOW() WHERE id = $1", user["id"])

    return RedirectResponse(
        f"{settings.dashboard_url}/auth/callback"
        f"?access_token={access_token}&refresh_token={refresh_raw}"
    )
