from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from gateway.db import postgres as db
from gateway.services.quota import get_tenant_quota_status

router = APIRouter()


@router.get("/v1/usage")
async def get_usage(request: Request):
    tenant = request.state.tenant
    tenant_id = tenant["id"]
    period = datetime.now(timezone.utc).strftime("%Y-%m")
    year, month = map(int, period.split("-"))

    summary = await db.fetchrow(
        """
        SELECT
            SUM(prompt_tokens + completion_tokens) AS total_tokens,
            COUNT(*) AS total_requests,
            SUM(audio_seconds) AS total_duration_seconds,
            SUM(characters_count) AS total_characters,
            SUM(cost_micro) AS total_cost_micro
        FROM token_usage
        WHERE tenant_id = $1
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        """,
        tenant_id,
    )

    by_model = await db.fetch(
        """
        SELECT
            model_id,
            model_category,
            SUM(prompt_tokens) AS tokens_input,
            SUM(completion_tokens) AS tokens_output,
            SUM(prompt_tokens + completion_tokens) AS tokens_total,
            COUNT(*) AS request_count,
            SUM(audio_seconds) AS audio_seconds,
            SUM(characters_count) AS characters_count,
            SUM(cost_micro) AS cost_micro
        FROM token_usage
        WHERE tenant_id = $1
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        GROUP BY model_id, model_category
        ORDER BY tokens_total DESC
        """,
        tenant_id,
    )

    quotas = await get_tenant_quota_status(tenant_id)

    return JSONResponse(content={
        "tenant_id": tenant_id,
        "period": period,
        "summary": {
            "total_tokens": int(summary["total_tokens"] or 0),
            "total_requests": int(summary["total_requests"] or 0),
            "total_duration_minutes": round(float(summary["total_duration_seconds"] or 0) / 60, 2),
            "total_characters": int(summary["total_characters"] or 0),
            "total_cost_usd": round(int(summary["total_cost_micro"] or 0) / 1_000_000, 4),
        },
        "quotas": quotas,
        "by_model": [dict(r) for r in by_model],
    })


@router.get("/v1/usage/daily")
async def get_usage_daily(
    request: Request,
    days: int = Query(default=30, ge=1, le=90),
):
    tenant = request.state.tenant
    tenant_id = tenant["id"]

    rows = await db.fetch(
        """
        SELECT
            DATE(created_at) AS date,
            model_category,
            SUM(prompt_tokens + completion_tokens) AS tokens,
            COUNT(*) AS requests,
            SUM(cost_micro) AS cost_micro
        FROM token_usage
        WHERE tenant_id = $1
          AND created_at >= NOW() - INTERVAL '1 day' * $2
        GROUP BY DATE(created_at), model_category
        ORDER BY date DESC
        """,
        tenant_id,
        days,
    )

    return JSONResponse(content={
        "tenant_id": tenant_id,
        "days": days,
        "data": [
            {
                "date": str(r["date"]),
                "model_category": r["model_category"],
                "tokens": int(r["tokens"] or 0),
                "requests": int(r["requests"] or 0),
                "cost_usd": round(int(r["cost_micro"] or 0) / 1_000_000, 4),
            }
            for r in rows
        ],
    })


@router.get("/v1/usage/quota")
async def get_quota(request: Request):
    tenant = request.state.tenant
    quotas = await get_tenant_quota_status(tenant["id"])
    return JSONResponse(content={"tenant_id": tenant["id"], "quotas": quotas})


@router.get("/v1/usage/models")
async def get_usage_by_model(request: Request):
    tenant = request.state.tenant
    rows = await db.fetch(
        """
        SELECT
            model_id, model_category,
            SUM(prompt_tokens) AS tokens_input,
            SUM(completion_tokens) AS tokens_output,
            COUNT(*) AS requests,
            SUM(cost_micro) AS cost_micro
        FROM token_usage
        WHERE tenant_id = $1
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        GROUP BY model_id, model_category
        ORDER BY tokens_input + tokens_output DESC
        """,
        tenant["id"],
    )
    return JSONResponse(content={"data": [dict(r) for r in rows]})
