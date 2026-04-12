"""
Admin API — Model Sessions management.

Endpoints:
  GET    /admin/sessions                       list all sessions
  GET    /admin/sessions/:id                   get single session
  POST   /admin/sessions                       register session (status=running)
  PATCH  /admin/sessions/:id                   update status
  DELETE /admin/sessions/:id                   remove session

  GET    /admin/models/:id/sessions            sessions for a model
  POST   /admin/models/:id/sessions/start      create + mark running
  POST   /admin/sessions/:id/stop              mark stopped
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl

from gateway.middleware.admin_auth import require_admin
from gateway.services import session_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin-sessions"])


# ─── Request / Response schemas ───────────────────────────────────────────────

class SessionCreate(BaseModel):
    model_id: str
    backend_url: str
    gpu_ids: list[str] = []
    tensor_parallel_size: int = 1
    max_model_len: Optional[int] = None
    extra_config: Optional[dict] = None


class SessionStartRequest(BaseModel):
    backend_url: str
    gpu_ids: list[str] = []
    tensor_parallel_size: int = 1
    max_model_len: Optional[int] = None
    extra_config: Optional[dict] = None


class SessionPatch(BaseModel):
    status: str  # running | stopped | loading | error


def _serialize(row: dict) -> dict:
    """Convert asyncpg row dict to JSON-serialisable dict."""
    out = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):          # datetime / timestamptz
            out[k] = v.isoformat()
        elif isinstance(v, (list, dict)):
            out[k] = v
        else:
            out[k] = v
    # Ensure id is a string
    if "id" in out:
        out["id"] = str(out["id"])
    return out


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(_: dict = Depends(require_admin)):
    rows = await session_manager.list_sessions()
    return {"sessions": [_serialize(r) for r in rows]}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, _: dict = Depends(require_admin)):
    row = await session_manager.get_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return _serialize(row)


@router.post("/sessions", status_code=201)
async def create_session(body: SessionCreate, admin: dict = Depends(require_admin)):
    try:
        row = await session_manager.register_session(
            model_id=body.model_id,
            backend_url=body.backend_url,
            gpu_ids=body.gpu_ids,
            tensor_parallel_size=body.tensor_parallel_size,
            max_model_len=body.max_model_len,
            started_by=admin.get("email"),
            extra_config=body.extra_config,
        )
    except Exception as e:
        logger.error("Failed to create session: %s", e)
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(row)


@router.patch("/sessions/{session_id}")
async def patch_session(
    session_id: str,
    body: SessionPatch,
    _: dict = Depends(require_admin),
):
    valid = {"running", "stopped", "loading", "error"}
    if body.status not in valid:
        raise HTTPException(status_code=422, detail=f"status must be one of {valid}")
    row = await session_manager.update_session_status(session_id, body.status)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return _serialize(row)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str, _: dict = Depends(require_admin)):
    ok = await session_manager.delete_session(session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")


# ─── Model-scoped helpers ─────────────────────────────────────────────────────

@router.get("/models/{model_id}/sessions")
async def list_model_sessions(model_id: str, _: dict = Depends(require_admin)):
    rows = await session_manager.list_sessions(model_id=model_id)
    return {"model_id": model_id, "sessions": [_serialize(r) for r in rows]}


@router.post("/models/{model_id}/sessions/start", status_code=201)
async def start_model_session(
    model_id: str,
    body: SessionStartRequest,
    admin: dict = Depends(require_admin),
):
    """Register and immediately mark a session as running."""
    try:
        row = await session_manager.register_session(
            model_id=model_id,
            backend_url=body.backend_url,
            gpu_ids=body.gpu_ids,
            tensor_parallel_size=body.tensor_parallel_size,
            max_model_len=body.max_model_len,
            started_by=admin.get("email"),
            extra_config=body.extra_config,
        )
    except Exception as e:
        logger.error("Failed to start session for %s: %s", model_id, e)
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(row)


@router.post("/sessions/{session_id}/stop")
async def stop_session(session_id: str, _: dict = Depends(require_admin)):
    """Mark a session as stopped."""
    row = await session_manager.stop_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return _serialize(row)
