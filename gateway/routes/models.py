"""
GET /v1/models    — list models that have at least one running session.
GET /v1/models/:id — model detail.

The `active_sessions` and `online` fields are populated in real-time from
the SessionManager so that third-party platforms only see models that are
actually serving requests.

Legacy behaviour: if *no* sessions are registered in the DB at all for a
model (cold start / no session manager configured), the model is still
returned as online=True for backward compatibility — the router will fall
back to the env-var URL.
"""

import asyncio
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/v1/models")
async def list_models(request: Request):
    tenant = getattr(request.state, "tenant", None)
    plan = tenant.get("plan", "starter") if tenant else "starter"

    from gateway.services.router import get_router
    model_router = get_router()
    models = model_router.list_all(plan=plan)

    # Enrich with live session counts
    try:
        from gateway.services import session_manager
        tasks = [session_manager.count_running(m["id"]) for m in models]
        counts = await asyncio.gather(*tasks, return_exceptions=True)
        for model, count in zip(models, counts):
            if isinstance(count, Exception):
                count = 0
            model["active_sessions"] = count
            model["online"] = count > 0
    except Exception as e:
        logger.warning("Could not fetch session counts: %s", e)
        # Fallback: mark all as online (no session manager = legacy mode)
        for m in models:
            m["online"] = True

    # Filter to only online models (realtime: only models with running sessions)
    # If no model has any session, return all (cold-start / legacy mode)
    online_models = [m for m in models if m["online"]]
    if not online_models:
        # Legacy/cold-start: return everything so the platform is usable
        online_models = models
        for m in online_models:
            m["online"] = True

    return JSONResponse(content={"object": "list", "data": online_models})


@router.get("/v1/models/{model_id}")
async def get_model(model_id: str, request: Request):
    from gateway.services.router import get_router
    model_router = get_router()
    info = model_router.get_model_info(model_id)
    if not info:
        return JSONResponse(
            status_code=404,
            content={"error": {"type": "invalid_request_error", "message": f"Model '{model_id}' not found"}},
        )

    active_sessions = 0
    try:
        from gateway.services import session_manager
        active_sessions = await session_manager.count_running(model_id)
    except Exception:
        pass

    return JSONResponse(content={
        "id": model_id,
        "object": "model",
        "owned_by": "custom-ai",
        "active_sessions": active_sessions,
        "online": active_sessions > 0,
        **{k: v for k, v in info.items() if k != "openai_aliases"},
    })
