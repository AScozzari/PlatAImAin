import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_client import make_asgi_app

from gateway import startup
from gateway.middleware.auth import TenantAuthMiddleware
from gateway.middleware.ratelimit import RateLimitMiddleware
from gateway.routes import (
    audio,
    auth,
    chat,
    embeddings,
    models,
    oauth2,
    speech,
    usage,
    voices,
)
from gateway.routes.admin import billing, health, models_admin, tenants
from gateway.middleware.admin_auth import require_admin

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await startup.initialize()
    yield
    await startup.shutdown()


app = FastAPI(
    title="Custom AI Gateway",
    description="OpenAI-compatible multi-tenant AI gateway",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── Middleware (registered in REVERSE execution order) ──────────────────────
# Execution order: TenantAuth → RateLimit → route handler
app.add_middleware(RateLimitMiddleware)
app.add_middleware(TenantAuthMiddleware)

# ─── Public health endpoint ───────────────────────────────────────────────────
@app.get("/health")
async def health():
    if startup.is_ready():
        return JSONResponse(content={"status": "ok", "models_ready": True})
    return JSONResponse(content={"status": "starting", "models_ready": False})


# ─── Prometheus metrics endpoint ─────────────────────────────────────────────
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# ─── Public OpenAI-compatible routes (tenant API key auth) ───────────────────
app.include_router(chat.router)
app.include_router(audio.router)
app.include_router(speech.router)
app.include_router(embeddings.router)
app.include_router(models.router)
app.include_router(usage.router)
app.include_router(voices.router)

# ─── Auth routes (no tenant auth) ────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(oauth2.router)

# ─── Admin routes (JWT auth via require_admin dependency on each handler) ────
from fastapi import APIRouter

admin_router = APIRouter(prefix="/admin", tags=["admin"])
admin_router.include_router(tenants.router)
admin_router.include_router(billing.router)
admin_router.include_router(health.router)
admin_router.include_router(models_admin.router)
app.include_router(admin_router)


# ─── Global error handler ─────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "type": "server_error",
                "code": "internal_server_error",
                "message": "An unexpected error occurred",
            }
        },
    )
