import logging
import time
from datetime import datetime, timezone

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from gateway.services.quota import check_rate_limit

logger = logging.getLogger(__name__)

EXEMPT_PATHS = {"/health", "/metrics", "/docs", "/openapi.json", "/redoc"}
ADMIN_PREFIX = "/admin"
AUTH_PREFIX = "/auth"


def _next_hour_ts() -> int:
    now = datetime.now(timezone.utc)
    return int(now.replace(minute=0, second=0, microsecond=0).timestamp()) + 3600


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if (
            path in EXEMPT_PATHS
            or path.startswith(ADMIN_PREFIX)
            or path.startswith(AUTH_PREFIX)
        ):
            return await call_next(request)

        tenant = getattr(request.state, "tenant", None)
        if not tenant:
            return await call_next(request)

        tenant_id = tenant["id"]
        plan = tenant.get("plan", "starter")

        from gateway.config.settings import get_settings
        limit = get_settings().get_rate_limit(plan)

        allowed, current, limit_val = await check_rate_limit(tenant_id, limit)

        reset_ts = _next_hour_ts()
        remaining = max(0, limit_val - current)

        if not allowed:
            return JSONResponse(
                status_code=429,
                headers={
                    "X-RateLimit-Limit": str(limit_val),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_ts),
                    "Retry-After": str(reset_ts - int(time.time())),
                },
                content={
                    "error": {
                        "type": "rate_limit_exceeded",
                        "code": "rate_limit_exceeded",
                        "message": f"Rate limit exceeded. Limit: {limit_val} requests/hour for {plan} plan.",
                        "details": {
                            "limit": limit_val,
                            "current": current,
                            "reset_at": datetime.fromtimestamp(reset_ts, tz=timezone.utc).isoformat(),
                        },
                    }
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit_val)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_ts)
        return response
