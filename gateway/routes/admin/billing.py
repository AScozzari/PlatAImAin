from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from gateway.db import postgres as db
from gateway.middleware.admin_auth import require_admin

router = APIRouter()

_MICRO = 1_000_000


def _micro_to_eur(micro: int) -> float:
    return round(micro / _MICRO, 6)


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
        "currency": "EUR",
        "summary": {
            "active_tenants": int(summary["active_tenants"] or 0),
            "total_tokens": int(summary["total_tokens"] or 0),
            "total_requests": int(summary["total_requests"] or 0),
            "total_audio_seconds": float(summary["total_audio_seconds"] or 0),
            "total_characters": int(summary["total_characters"] or 0),
            "total_cost": _micro_to_eur(int(summary["total_cost_micro"] or 0)),
            "total_cost_micro": int(summary["total_cost_micro"] or 0),
        },
        "daily": [
            {
                "date": str(r["date"]),
                "tokens": int(r["tokens"] or 0),
                "requests": int(r["requests"] or 0),
                "cost": _micro_to_eur(int(r["cost_micro"] or 0)),
                "cost_micro": int(r["cost_micro"] or 0),
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
                "cost": _micro_to_eur(int(r["cost_micro"] or 0)),
                "cost_micro": int(r["cost_micro"] or 0),
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

    # Aggregate per tenant — flat rows for dashboard table
    _CATS = ["llm", "reasoning", "coding", "vision", "stt", "tts", "embedding"]
    tenant_map: dict = {}
    for row in tenants:
        tid = str(row["tenant_id"])
        if tid not in tenant_map:
            tenant_map[tid] = {
                "tenant_id": tid,
                "tenant_name": row["tenant_name"],
                "plan": row["plan"],
                "currency": "EUR",
                **{f"{c}_cost": 0.0 for c in _CATS},
                "total_cost": 0.0,
                "total_cost_micro": 0,
                "total_tokens": 0,
            }
        cat = row["model_category"]
        cost_micro = int(row["cost_micro"] or 0)
        cost = _micro_to_eur(cost_micro)
        tokens = int((row["tokens_input"] or 0)) + int((row["tokens_output"] or 0))
        if f"{cat}_cost" in tenant_map[tid]:
            tenant_map[tid][f"{cat}_cost"] = round(tenant_map[tid][f"{cat}_cost"] + cost, 6)
        tenant_map[tid]["total_cost"] = round(tenant_map[tid]["total_cost"] + cost, 6)
        tenant_map[tid]["total_cost_micro"] += cost_micro
        tenant_map[tid]["total_tokens"] += tokens

    return JSONResponse(content={
        "period": period,
        "currency": "EUR",
        "rows": list(tenant_map.values()),
    })


@router.get("/models/pricing")
async def get_pricing(_=Depends(require_admin)):
    rows = await db.fetch(
        """
        SELECT p.*, m.name AS model_name, m.category
        FROM model_pricing p
        JOIN models m ON m.id = p.model_id
        ORDER BY m.category, p.model_id
        """
    )
    return JSONResponse(content={
        "pricing": [
            {
                "model_id": r["model_id"],
                "model_name": r["model_name"],
                "category": r["category"],
                "input_cost_per_1k_micro": r["input_cost_per_1k_micro"],
                "output_cost_per_1k_micro": r["output_cost_per_1k_micro"],
                "input_cost_per_1k": _micro_to_eur(r["input_cost_per_1k_micro"]),
                "output_cost_per_1k": _micro_to_eur(r["output_cost_per_1k_micro"]),
                "input_cost_per_token": round(_micro_to_eur(r["input_cost_per_1k_micro"]) / 1000, 10),
                "output_cost_per_token": round(_micro_to_eur(r["output_cost_per_1k_micro"]) / 1000, 10),
                "currency": r["currency"] or "EUR",
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            }
            for r in rows
        ]
    })


@router.patch("/models/{model_id}/pricing")
async def update_pricing(model_id: str, body: dict, admin=Depends(require_admin)):
    input_micro = int(body.get("input_cost_per_1k_micro", 0))
    output_micro = int(body.get("output_cost_per_1k_micro", 0))
    currency = body.get("currency", "EUR")

    # Log current price to history before overwriting
    await db.execute(
        """
        INSERT INTO model_pricing_history
            (model_id, input_cost_per_1k_micro, output_cost_per_1k_micro, currency, changed_by)
        SELECT model_id, input_cost_per_1k_micro, output_cost_per_1k_micro, currency, $2
        FROM model_pricing WHERE model_id = $1
        """,
        model_id, admin.get("email", "admin"),
    )

    await db.execute(
        """
        INSERT INTO model_pricing (model_id, input_cost_per_1k_micro, output_cost_per_1k_micro, currency)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (model_id) DO UPDATE
            SET input_cost_per_1k_micro  = EXCLUDED.input_cost_per_1k_micro,
                output_cost_per_1k_micro = EXCLUDED.output_cost_per_1k_micro,
                currency                 = EXCLUDED.currency,
                updated_at               = NOW()
        """,
        model_id, input_micro, output_micro, currency,
    )
    return JSONResponse(content={"success": True, "model_id": model_id})


@router.get("/models/{model_id}/pricing/history")
async def get_pricing_history(model_id: str, _=Depends(require_admin)):
    rows = await db.fetch(
        """
        SELECT input_cost_per_1k_micro, output_cost_per_1k_micro, currency, changed_by, effective_from
        FROM model_pricing_history
        WHERE model_id = $1
        ORDER BY effective_from DESC
        LIMIT 50
        """,
        model_id,
    )
    return JSONResponse(content={
        "model_id": model_id,
        "history": [
            {
                "input_cost_per_1k_micro":  r["input_cost_per_1k_micro"],
                "output_cost_per_1k_micro": r["output_cost_per_1k_micro"],
                "input_cost_per_1k":  _micro_to_eur(r["input_cost_per_1k_micro"]),
                "output_cost_per_1k": _micro_to_eur(r["output_cost_per_1k_micro"]),
                "currency":           r["currency"] or "EUR",
                "changed_by":         r["changed_by"],
                "effective_from":     r["effective_from"].isoformat() if r["effective_from"] else None,
            }
            for r in rows
        ],
    })
