from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from gateway.db import postgres as db
from gateway.middleware.admin_auth import require_admin

router = APIRouter()


@router.get("/usage/overview")
async def usage_overview(_=Depends(require_admin)):
    """Global usage stats for all tenants — current month."""
    summary = await db.fetchrow(
        """
        SELECT
            COUNT(DISTINCT tenant_id) AS active_tenants,
            SUM(prompt_tokens + completion_tokens) AS total_tokens,
            COUNT(*) AS total_requests,
            SUM(audio_seconds) AS total_audio_seconds,
            SUM(characters_count) AS total_characters,
            SUM(cost_micro) AS total_cost_micro
        FROM token_usage
        WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        """
    )

    daily = await db.fetch(
        """
        SELECT
            DATE(created_at) AS date,
            SUM(prompt_tokens + completion_tokens) AS tokens,
            COUNT(*) AS requests,
            SUM(cost_micro) AS cost_micro
        FROM token_usage
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        """
    )

    top_tenants = await db.fetch(
        """
        SELECT
            t.id AS tenant_id,
            t.name AS tenant_name,
            t.plan,
            SUM(u.prompt_tokens + u.completion_tokens) AS tokens,
            COUNT(u.id) AS requests,
            SUM(u.cost_micro) AS cost_micro
        FROM token_usage u
        JOIN tenants t ON t.id = u.tenant_id
        WHERE DATE_TRUNC('month', u.created_at) = DATE_TRUNC('month', NOW())
        GROUP BY t.id, t.name, t.plan
        ORDER BY tokens DESC
        LIMIT 10
        """
    )

    return JSONResponse(content={
        "period": datetime.now(timezone.utc).strftime("%Y-%m"),
        "summary": {
            "active_tenants": int(summary["active_tenants"] or 0),
            "total_tokens": int(summary["total_tokens"] or 0),
            "total_requests": int(summary["total_requests"] or 0),
            "total_audio_seconds": float(summary["total_audio_seconds"] or 0),
            "total_characters": int(summary["total_characters"] or 0),
            "total_cost_usd": round(int(summary["total_cost_micro"] or 0) / 1_000_000, 4),
        },
        "daily": [
            {
                "date": str(r["date"]),
                "tokens": int(r["tokens"] or 0),
                "requests": int(r["requests"] or 0),
                "cost_usd": round(int(r["cost_micro"] or 0) / 1_000_000, 4),
            }
            for r in daily
        ],
        "top_tenants": [
            {
                "tenant_id": str(r["tenant_id"]),
                "tenant_name": r["tenant_name"],
                "plan": r["plan"],
                "tokens": int(r["tokens"] or 0),
                "requests": int(r["requests"] or 0),
                "cost_usd": round(int(r["cost_micro"] or 0) / 1_000_000, 4),
            }
            for r in top_tenants
        ],
    })


@router.get("/usage/billing")
async def billing_report(
    period: str = Query(default=None, description="YYYY-MM format"),
    _=Depends(require_admin),
):
    if not period:
        period = datetime.now(timezone.utc).strftime("%Y-%m")

    year, month = map(int, period.split("-"))

    tenants = await db.fetch(
        """
        SELECT
            t.id AS tenant_id,
            t.name AS tenant_name,
            t.plan,
            u.model_category,
            SUM(u.prompt_tokens) AS tokens_input,
            SUM(u.completion_tokens) AS tokens_output,
            SUM(u.audio_seconds) AS audio_seconds,
            SUM(u.characters_count) AS characters,
            SUM(u.cost_micro) AS cost_micro
        FROM token_usage u
        JOIN tenants t ON t.id = u.tenant_id
        WHERE EXTRACT(YEAR FROM u.created_at) = $1
          AND EXTRACT(MONTH FROM u.created_at) = $2
        GROUP BY t.id, t.name, t.plan, u.model_category
        ORDER BY t.name, u.model_category
        """,
        year,
        month,
    )

    # Aggregate per tenant
    tenant_map: dict = {}
    for row in tenants:
        tid = str(row["tenant_id"])
        if tid not in tenant_map:
            tenant_map[tid] = {
                "tenant_id": tid,
                "tenant_name": row["tenant_name"],
                "plan": row["plan"],
                "usage": {},
                "total_cost_usd": 0.0,
            }
        cat = row["model_category"]
        cost = round(int(row["cost_micro"] or 0) / 1_000_000, 4)
        tenant_map[tid]["usage"][cat] = {
            "tokens_input": int(row["tokens_input"] or 0),
            "tokens_output": int(row["tokens_output"] or 0),
            "audio_seconds": float(row["audio_seconds"] or 0),
            "characters": int(row["characters"] or 0),
            "cost_usd": cost,
        }
        tenant_map[tid]["total_cost_usd"] = round(tenant_map[tid]["total_cost_usd"] + cost, 4)

    return JSONResponse(content={
        "period": period,
        "tenants": list(tenant_map.values()),
    })


@router.get("/models/pricing")
async def get_pricing(_=Depends(require_admin)):
    rows = await db.fetch("SELECT * FROM model_pricing ORDER BY model_id")
    return JSONResponse(content={
        "data": [
            {
                "model_id": r["model_id"],
                "input_cost_per_1k_usd": r["input_cost_per_1k_micro"] / 1_000_000,
                "output_cost_per_1k_usd": r["output_cost_per_1k_micro"] / 1_000_000,
                "currency": r["currency"],
            }
            for r in rows
        ]
    })


@router.patch("/models/{model_id}/pricing")
async def update_pricing(model_id: str, body: dict, _=Depends(require_admin)):
    input_cost = int(body.get("price_input_per_1k", 0) * 1_000_000)
    output_cost = int(body.get("price_output_per_1k", 0) * 1_000_000)
    await db.execute(
        """
        INSERT INTO model_pricing (model_id, input_cost_per_1k_micro, output_cost_per_1k_micro)
        VALUES ($1, $2, $3)
        ON CONFLICT (model_id) DO UPDATE
            SET input_cost_per_1k_micro = EXCLUDED.input_cost_per_1k_micro,
                output_cost_per_1k_micro = EXCLUDED.output_cost_per_1k_micro,
                updated_at = NOW()
        """,
        model_id, input_cost, output_cost,
    )
    return JSONResponse(content={"success": True, "model_id": model_id})
