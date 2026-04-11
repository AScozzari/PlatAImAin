from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from gateway.db import postgres as db
from gateway.services.quota import get_tenant_quota_status

router = APIRouter()


def _micro_to_currency(micro: int, currency: str = "EUR") -> float:
    """Convert micro-units to currency units (1_000_000 micro = 1 unit)."""
    return round(micro / 1_000_000, 6)


@router.get("/v1/usage")
async def get_usage(request: Request):
    tenant = request.state.tenant
    tenant_id = tenant["id"]
    period = datetime.now(timezone.utc).strftime("%Y-%m")

    summary = await db.fetchrow(
        """
        SELECT
            SUM(prompt_tokens)                         AS tokens_input,
            SUM(completion_tokens)                     AS tokens_output,
            SUM(prompt_tokens + completion_tokens)     AS total_tokens,
            COUNT(*)                                   AS total_requests,
            SUM(audio_seconds)                         AS total_audio_seconds,
            SUM(characters_count)                      AS total_characters,
            SUM(cost_micro)                            AS total_cost_micro,
            MAX(currency)                              AS currency
        FROM token_usage
        WHERE tenant_id = $1
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        """,
        tenant_id,
    )

    by_model = await db.fetch(
        """
        SELECT
            u.model_id,
            u.model_category,
            SUM(u.prompt_tokens)                                AS tokens_input,
            SUM(u.completion_tokens)                            AS tokens_output,
            SUM(u.prompt_tokens + u.completion_tokens)          AS tokens_total,
            COUNT(*)                                            AS requests,
            SUM(u.audio_seconds)                                AS audio_seconds,
            SUM(u.characters_count)                             AS characters_count,
            SUM(u.cost_micro)                                   AS cost_micro,
            MAX(u.currency)                                     AS currency,
            MAX(p.input_cost_per_1k_micro)                      AS rate_input_micro,
            MAX(p.output_cost_per_1k_micro)                     AS rate_output_micro
        FROM token_usage u
        LEFT JOIN model_pricing p ON p.model_id = u.model_id
        WHERE u.tenant_id = $1
          AND DATE_TRUNC('month', u.created_at) = DATE_TRUNC('month', NOW())
        GROUP BY u.model_id, u.model_category
        ORDER BY tokens_total DESC
        """,
        tenant_id,
    )

    quotas = await get_tenant_quota_status(tenant_id)
    currency = summary["currency"] or "EUR"
    total_cost_micro = int(summary["total_cost_micro"] or 0)

    return JSONResponse(content={
        "object": "usage",
        "tenant_id": tenant_id,
        "period": period,
        "currency": currency,
        "summary": {
            "tokens_input":        int(summary["tokens_input"] or 0),
            "tokens_output":       int(summary["tokens_output"] or 0),
            "total_tokens":        int(summary["total_tokens"] or 0),
            "total_requests":      int(summary["total_requests"] or 0),
            "total_audio_minutes": round(float(summary["total_audio_seconds"] or 0) / 60, 2),
            "total_characters":    int(summary["total_characters"] or 0),
            "total_cost":          _micro_to_currency(total_cost_micro, currency),
            "total_cost_micro":    total_cost_micro,
        },
        "quotas": quotas,
        "by_model": [
            {
                "model_id":        r["model_id"],
                "category":        r["model_category"],
                "tokens_input":    int(r["tokens_input"] or 0),
                "tokens_output":   int(r["tokens_output"] or 0),
                "tokens_total":    int(r["tokens_total"] or 0),
                "requests":        int(r["requests"] or 0),
                "audio_seconds":   float(r["audio_seconds"] or 0),
                "characters":      int(r["characters_count"] or 0),
                "cost":            _micro_to_currency(int(r["cost_micro"] or 0), r["currency"] or "EUR"),
                "cost_micro":      int(r["cost_micro"] or 0),
                "currency":        r["currency"] or "EUR",
                # Rates for third-party platforms to calculate future costs
                "rates": {
                    "input_per_1k":  _micro_to_currency(int(r["rate_input_micro"] or 0)),
                    "output_per_1k": _micro_to_currency(int(r["rate_output_micro"] or 0)),
                    "input_per_token":  round(_micro_to_currency(int(r["rate_input_micro"] or 0)) / 1000, 10),
                    "output_per_token": round(_micro_to_currency(int(r["rate_output_micro"] or 0)) / 1000, 10),
                    "currency": r["currency"] or "EUR",
                },
            }
            for r in by_model
        ],
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
            DATE(created_at)    AS date,
            model_category,
            SUM(prompt_tokens + completion_tokens) AS tokens,
            COUNT(*)            AS requests,
            SUM(cost_micro)     AS cost_micro,
            MAX(currency)       AS currency
        FROM token_usage
        WHERE tenant_id = $1
          AND created_at >= NOW() - INTERVAL '1 day' * $2
        GROUP BY DATE(created_at), model_category
        ORDER BY date DESC
        """,
        tenant_id, days,
    )

    return JSONResponse(content={
        "tenant_id": tenant_id,
        "days": days,
        "data": [
            {
                "date":           str(r["date"]),
                "category":       r["model_category"],
                "tokens":         int(r["tokens"] or 0),
                "requests":       int(r["requests"] or 0),
                "cost":           _micro_to_currency(int(r["cost_micro"] or 0), r["currency"] or "EUR"),
                "cost_micro":     int(r["cost_micro"] or 0),
                "currency":       r["currency"] or "EUR",
            }
            for r in rows
        ],
    })


@router.get("/v1/usage/quota")
async def get_quota(request: Request):
    tenant = request.state.tenant
    quotas = await get_tenant_quota_status(tenant["id"])
    return JSONResponse(content={"tenant_id": tenant["id"], "quotas": quotas})


@router.get("/v1/usage/pricing")
async def get_pricing(request: Request):
    """Return current per-model pricing for this tenant (for third-party cost estimation)."""
    rows = await db.fetch(
        """
        SELECT p.model_id, p.input_cost_per_1k_micro, p.output_cost_per_1k_micro,
               p.currency, p.effective_from, m.category, m.name
        FROM model_pricing p
        JOIN models m ON m.id = p.model_id
        WHERE m.is_active = true
        ORDER BY m.category, p.model_id
        """
    )
    return JSONResponse(content={
        "object": "pricing",
        "data": [
            {
                "model_id":        r["model_id"],
                "model_name":      r["name"],
                "category":        r["category"],
                "currency":        r["currency"] or "EUR",
                "effective_from":  r["effective_from"].isoformat() if r["effective_from"] else None,
                "rates": {
                    "input_per_1k":     _micro_to_currency(r["input_cost_per_1k_micro"] or 0),
                    "output_per_1k":    _micro_to_currency(r["output_cost_per_1k_micro"] or 0),
                    "input_per_token":  round(_micro_to_currency(r["input_cost_per_1k_micro"] or 0) / 1000, 10),
                    "output_per_token": round(_micro_to_currency(r["output_cost_per_1k_micro"] or 0) / 1000, 10),
                },
            }
            for r in rows
        ],
    })


@router.get("/v1/usage/models")
async def get_usage_by_model(request: Request):
    tenant = request.state.tenant
    rows = await db.fetch(
        """
        SELECT
            u.model_id, u.model_category,
            SUM(u.prompt_tokens)     AS tokens_input,
            SUM(u.completion_tokens) AS tokens_output,
            COUNT(*)                 AS requests,
            SUM(u.cost_micro)        AS cost_micro,
            MAX(u.currency)          AS currency,
            MAX(p.input_cost_per_1k_micro)  AS rate_input_micro,
            MAX(p.output_cost_per_1k_micro) AS rate_output_micro
        FROM token_usage u
        LEFT JOIN model_pricing p ON p.model_id = u.model_id
        WHERE u.tenant_id = $1
          AND DATE_TRUNC('month', u.created_at) = DATE_TRUNC('month', NOW())
        GROUP BY u.model_id, u.model_category
        ORDER BY tokens_input + tokens_output DESC
        """,
        tenant["id"],
    )
    currency = "EUR"
    return JSONResponse(content={
        "currency": currency,
        "data": [
            {
                "model_id":      r["model_id"],
                "category":      r["model_category"],
                "tokens_input":  int(r["tokens_input"] or 0),
                "tokens_output": int(r["tokens_output"] or 0),
                "requests":      int(r["requests"] or 0),
                "cost":          _micro_to_currency(int(r["cost_micro"] or 0)),
                "currency":      r["currency"] or "EUR",
                "rates": {
                    "input_per_1k":  _micro_to_currency(int(r["rate_input_micro"] or 0)),
                    "output_per_1k": _micro_to_currency(int(r["rate_output_micro"] or 0)),
                },
            }
            for r in rows
        ],
    })
