import logging
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from gateway.services.tenant import get_tenant_by_api_key, get_tenant_model_assignments

logger = logging.getLogger(__name__)

# Paths that don't require tenant API key auth
EXEMPT_PATHS = {
    "/health",
    "/metrics",
    "/auth/login",
    "/auth/refresh",
    "/auth/logout",
    "/auth/me",
    "/auth/oauth2/google",
    "/auth/oauth2/google/callback",
    "/auth/oauth2/github",
    "/auth/oauth2/github/callback",
    "/docs",
    "/openapi.json",
    "/redoc",
}

ADMIN_PREFIX = "/admin"


def _openai_error(message: str, code: str = "invalid_request_error", status: int = 401) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"message": message, "type": "authentication_error", "code": code}},
    )


class TenantAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip exempt paths and admin routes (admin has its own JWT auth)
        if path in EXEMPT_PATHS or path.startswith(ADMIN_PREFIX):
            return await call_next(request)

        # Extract API key from Authorization header or x-api-key
        api_key = _extract_api_key(request)
        if not api_key:
            return _openai_error("Missing API key. Provide it via Authorization: Bearer <key> or x-api-key header.")

        tenant = await get_tenant_by_api_key(api_key)
        if not tenant:
            return _openai_error("Invalid API key.", code="invalid_api_key")

        if not tenant.get("is_active", True):
            return _openai_error("Tenant account is disabled.", code="account_disabled", status=403)

        # Attach tenant and model assignments to request state
        request.state.tenant = tenant
        request.state.tenant_id = tenant["id"]

        # Pass through correlation headers
        request.state.request_id = request.headers.get("x-request-id")
        request.state.agent_id = request.headers.get("x-agent-id")
        request.state.session_id = request.headers.get("x-session-id")

        return await call_next(request)


def _extract_api_key(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        key = auth_header[7:].strip()
        if key:
            return key

    x_api_key = request.headers.get("x-api-key", "").strip()
    if x_api_key:
        return x_api_key

    return None
