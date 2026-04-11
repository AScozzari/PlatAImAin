from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from gateway.middleware.admin_auth import require_admin
from gateway.services import tenant as tenant_service

router = APIRouter()


class CreateTenantBody(BaseModel):
    name: str
    plan: str = "starter"
    metadata: dict = {}


class UpdateTenantBody(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None
    is_active: Optional[bool] = None
    metadata: Optional[dict] = None


class SetQuotaBody(BaseModel):
    model_category: str
    monthly_token_limit: int = 0
    monthly_audio_seconds_limit: float = 0
    monthly_char_limit: int = 0


@router.post("/tenants")
async def create_tenant(body: CreateTenantBody, _=Depends(require_admin)):
    tenant = await tenant_service.create_tenant(body.name, body.plan, body.metadata)
    return JSONResponse(content=tenant, status_code=201)


@router.get("/tenants")
async def list_tenants(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _=Depends(require_admin),
):
    tenants = await tenant_service.list_tenants(limit, offset)
    total = await tenant_service.count_tenants()
    return JSONResponse(content={"data": tenants, "total": total, "limit": limit, "offset": offset})


@router.get("/tenants/{tenant_id}")
async def get_tenant(tenant_id: str, _=Depends(require_admin)):
    tenant = await tenant_service.get_tenant_by_id(tenant_id)
    if not tenant:
        return JSONResponse(status_code=404, content={"error": "Tenant not found"})
    return JSONResponse(content=tenant)


@router.patch("/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, body: UpdateTenantBody, _=Depends(require_admin)):
    updates = body.model_dump(exclude_none=True)
    tenant = await tenant_service.update_tenant(tenant_id, **updates)
    if not tenant:
        return JSONResponse(status_code=404, content={"error": "Tenant not found"})
    return JSONResponse(content=tenant)


@router.delete("/tenants/{tenant_id}")
async def deactivate_tenant(tenant_id: str, _=Depends(require_admin)):
    tenant = await tenant_service.update_tenant(tenant_id, is_active=False)
    if not tenant:
        return JSONResponse(status_code=404, content={"error": "Tenant not found"})
    return JSONResponse(content={"success": True, "tenant_id": tenant_id})


@router.post("/tenants/{tenant_id}/api-key")
async def regenerate_api_key(tenant_id: str, _=Depends(require_admin)):
    new_key = await tenant_service.regenerate_api_key(tenant_id)
    return JSONResponse(content={"tenant_id": tenant_id, "api_key": new_key})


@router.patch("/tenants/{tenant_id}/quota")
async def set_quota(tenant_id: str, body: SetQuotaBody, _=Depends(require_admin)):
    from gateway.db import postgres as db
    await db.execute(
        """
        INSERT INTO tenant_quotas (tenant_id, model_category, monthly_token_limit, monthly_audio_seconds_limit, monthly_char_limit)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, model_category, model_id) DO UPDATE
            SET monthly_token_limit = EXCLUDED.monthly_token_limit,
                monthly_audio_seconds_limit = EXCLUDED.monthly_audio_seconds_limit,
                monthly_char_limit = EXCLUDED.monthly_char_limit
        """,
        tenant_id,
        body.model_category,
        body.monthly_token_limit,
        body.monthly_audio_seconds_limit,
        body.monthly_char_limit,
    )
    return JSONResponse(content={"success": True})


@router.get("/tenants/{tenant_id}/models")
async def get_tenant_model_assignments(tenant_id: str, _=Depends(require_admin)):
    assignments = await tenant_service.get_tenant_model_assignments(tenant_id)
    return JSONResponse(content={"tenant_id": tenant_id, "assignments": assignments})


@router.patch("/tenants/{tenant_id}/models")
async def set_tenant_model_assignments(
    tenant_id: str,
    assignments: dict,
    _=Depends(require_admin),
):
    from gateway.db import postgres as db
    for category, model_id in assignments.items():
        await db.execute(
            """
            INSERT INTO tenant_model_assignments (tenant_id, category, model_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (tenant_id, category) DO UPDATE SET model_id = EXCLUDED.model_id
            """,
            tenant_id, category, model_id,
        )
    return JSONResponse(content={"success": True, "assignments": assignments})
