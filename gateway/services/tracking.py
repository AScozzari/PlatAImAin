import asyncio
import json
import logging
from typing import Optional

from gateway.db import postgres as db

logger = logging.getLogger(__name__)


async def record_usage(
    tenant_id: str,
    model_id: str,
    category: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    audio_seconds: float = 0.0,
    characters_count: int = 0,
    request_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    session_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """
    Insert usage record. Always call via asyncio.create_task() — never await directly
    in the request critical path.
    """
    try:
        # Calculate cost from model_pricing table
        cost_micro, currency = await _calculate_cost(
            model_id, category, prompt_tokens, completion_tokens,
            audio_seconds, characters_count
        )

        await db.execute(
            """
            INSERT INTO token_usage (
                tenant_id, model_id, model_category,
                prompt_tokens, completion_tokens,
                audio_seconds, characters_count, cost_micro, currency,
                request_id, agent_id, session_id, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            """,
            tenant_id,
            model_id,
            category,
            prompt_tokens,
            completion_tokens,
            audio_seconds,
            characters_count,
            cost_micro,
            currency,
            request_id,
            agent_id,
            session_id,
            json.dumps(metadata or {}),
        )
    except Exception as e:
        # Never raise — usage tracking failure must not affect the client
        logger.error("Failed to record usage for tenant=%s model=%s: %s", tenant_id, model_id, e)


async def _calculate_cost(
    model_id: str,
    category: str,
    prompt_tokens: int,
    completion_tokens: int,
    audio_seconds: float,
    characters_count: int,
) -> tuple[int, str]:
    """Return (cost_micro, currency). Cost is in micro-units of currency."""
    row = await db.fetchrow(
        "SELECT input_cost_per_1k_micro, output_cost_per_1k_micro, currency FROM model_pricing WHERE model_id = $1",
        model_id,
    )
    if not row:
        return 0, "EUR"

    input_cost  = row["input_cost_per_1k_micro"] or 0
    output_cost = row["output_cost_per_1k_micro"] or 0
    currency    = row["currency"] or "EUR"

    if category == "stt":
        micro = int(audio_seconds / 1000 * input_cost)
    elif category == "tts":
        micro = int(characters_count / 1000 * input_cost)
    elif category == "embedding":
        micro = int(prompt_tokens / 1000 * input_cost)
    else:
        micro = int(
            (prompt_tokens / 1000 * input_cost) +
            (completion_tokens / 1000 * output_cost)
        )
    return micro, currency


def track_in_background(
    tenant_id: str,
    model_id: str,
    category: str,
    **kwargs,
) -> asyncio.Task:
    """Fire-and-forget usage tracking. Returns the task."""
    return asyncio.create_task(
        record_usage(tenant_id, model_id, category, **kwargs)
    )
