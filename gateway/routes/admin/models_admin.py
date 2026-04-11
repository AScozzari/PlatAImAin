import json

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from gateway.db import postgres as db
from gateway.middleware.admin_auth import require_admin

router = APIRouter()


@router.get("/models")
async def list_models_admin(_=Depends(require_admin)):
    rows = await db.fetch(
        """
        SELECT m.*, p.input_cost_per_1k_micro, p.output_cost_per_1k_micro
        FROM models m
        LEFT JOIN model_pricing p ON p.model_id = m.id
        ORDER BY m.category, m.id
        """
    )
    return JSONResponse(content={"data": [
        dict(r) | {
            "input_cost_per_1k_usd": (r["input_cost_per_1k_micro"] or 0) / 1_000_000,
            "output_cost_per_1k_usd": (r["output_cost_per_1k_micro"] or 0) / 1_000_000,
        }
        for r in rows
    ]})


@router.patch("/models/{model_id}/enable")
async def toggle_model(model_id: str, body: dict, _=Depends(require_admin)):
    enabled = body.get("enabled", True)
    await db.execute(
        "UPDATE models SET is_enabled = $1, updated_at = NOW() WHERE id = $2",
        enabled, model_id,
    )
    return JSONResponse(content={"model_id": model_id, "is_enabled": enabled})


@router.get("/models/{model_id}/health")
async def model_health(model_id: str, _=Depends(require_admin)):
    from gateway.services.router import get_router
    model_router = get_router()
    info = model_router.get_model_info(model_id)
    if not info:
        return JSONResponse(status_code=404, content={"error": "Model not found"})

    backend = info.get("backend")
    category = info.get("category")

    if backend == "vllm":
        from gateway.routes.admin.health import _check_vllm
        backend_url = model_router.get_category_backend_url(category)
        result = await _check_vllm(model_id, backend_url)
    else:
        result = {"status": "embedded", "note": "Type B model — check /admin/health for status"}

    return JSONResponse(content={"model_id": model_id, **result})


async def sync_models_to_db() -> int:
    """Sync models.config.json → models table. Returns count of upserted models."""
    from gateway.services.router import get_router
    model_router = get_router()
    rows = model_router.as_db_rows()

    for row in rows:
        await db.execute(
            """
            INSERT INTO models (
                id, category, name, hf_repo, description, tier, min_plan,
                strengths, languages, tags, capabilities,
                context_window, parameters_b, dimensions, vram_gb,
                quantization, speed, quality, is_default, extra_config
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                tier = EXCLUDED.tier,
                min_plan = EXCLUDED.min_plan,
                strengths = EXCLUDED.strengths,
                languages = EXCLUDED.languages,
                tags = EXCLUDED.tags,
                capabilities = EXCLUDED.capabilities,
                context_window = EXCLUDED.context_window,
                parameters_b = EXCLUDED.parameters_b,
                dimensions = EXCLUDED.dimensions,
                vram_gb = EXCLUDED.vram_gb,
                quantization = EXCLUDED.quantization,
                speed = EXCLUDED.speed,
                quality = EXCLUDED.quality,
                is_default = EXCLUDED.is_default,
                extra_config = EXCLUDED.extra_config,
                updated_at = NOW()
            """,
            row["id"], row["category"], row["name"], row["hf_repo"],
            row["description"], row["tier"], row["min_plan"],
            row["strengths"], row["languages"], row["tags"], row["capabilities"],
            row["context_window"], row["parameters_b"], row["dimensions"],
            row["vram_gb"], row["quantization"], row["speed"], row["quality"],
            row["is_default"], row["extra_config"],
        )

    return len(rows)
