"""
Admin API — Conversations (session affinity viewer).

Endpoints:
  GET    /admin/conversations                lista conversazioni attive
  GET    /admin/conversations/:id            dettaglio conversazione + workers
  DELETE /admin/conversations/:id/workers    rilascia session affinity
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from gateway.middleware.admin_auth import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin-conversations"])


def _serialize(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif k in ("id", "tenant_id", "conversation_id", "pod_definition_id"):
            out[k] = str(v)
        else:
            out[k] = v
    return out


@router.get("/conversations")
async def list_conversations(
    tenant_id: Optional[str] = None,
    warm_state: Optional[str] = None,
    limit: int = 50,
    _: dict = Depends(require_admin),
):
    from gateway.db.postgres import get_pool
    db = get_pool()

    conditions = ["1=1"]
    values: list = []
    i = 1

    if tenant_id:
        conditions.append(f"c.tenant_id=${i}::uuid")
        values.append(tenant_id)
        i += 1
    if warm_state:
        conditions.append(f"c.warm_state=${i}")
        values.append(warm_state)
        i += 1

    values.append(limit)
    sql = f"""
        SELECT
            c.id, c.tenant_id, c.warm_state, c.last_activity, c.created_at,
            t.name AS tenant_name
        FROM conversations c
        LEFT JOIN tenants t ON t.id = c.tenant_id
        WHERE {' AND '.join(conditions)}
        ORDER BY c.last_activity DESC
        LIMIT ${i}
    """
    rows = await db.fetch(sql, *values)
    convs = [_serialize(dict(r)) for r in rows]

    # Fetch workers for each conversation
    for conv in convs:
        worker_rows = await db.fetch(
            """
            SELECT
                cw.model_class, cw.model_id, cw.last_activity,
                pd.name AS pod_name, pd.pod_status
            FROM conversation_workers cw
            JOIN pod_definitions pd ON pd.id = cw.pod_definition_id
            WHERE cw.conversation_id=$1::uuid
            """,
            conv["id"],
        )
        conv["workers"] = [
            {
                "model_class": w["model_class"],
                "model_id": w["model_id"],
                "pod_name": w["pod_name"],
                "pod_status": w["pod_status"],
                "last_activity": w["last_activity"].isoformat() if hasattr(w["last_activity"], "isoformat") else w["last_activity"],
            }
            for w in worker_rows
        ]

    # Count total
    count_sql = f"""
        SELECT COUNT(*) FROM conversations c
        WHERE {' AND '.join(conditions[:-1])}
    """
    total = await db.fetchval(count_sql, *values[:-1]) if len(conditions) > 1 else await db.fetchval("SELECT COUNT(*) FROM conversations")

    return {"conversations": convs, "total": total}


@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str, _: dict = Depends(require_admin)):
    from gateway.db.postgres import get_pool
    db = get_pool()

    row = await db.fetchrow(
        """
        SELECT c.*, t.name AS tenant_name
        FROM conversations c
        LEFT JOIN tenants t ON t.id = c.tenant_id
        WHERE c.id=$1::uuid
        """,
        conv_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv = _serialize(dict(row))
    worker_rows = await db.fetch(
        """
        SELECT cw.*, pd.name AS pod_name, pd.pod_status, pd.backend_url
        FROM conversation_workers cw
        JOIN pod_definitions pd ON pd.id = cw.pod_definition_id
        WHERE cw.conversation_id=$1::uuid
        """,
        conv_id,
    )
    conv["workers"] = [_serialize(dict(w)) for w in worker_rows]
    return conv


@router.delete("/conversations/{conv_id}/workers", status_code=204)
async def release_conversation_affinity(conv_id: str, _: dict = Depends(require_admin)):
    """Release session affinity: removes all pod pinning for this conversation."""
    from gateway.db.postgres import get_pool
    db = get_pool()

    result = await db.execute(
        "DELETE FROM conversation_workers WHERE conversation_id=$1::uuid", conv_id
    )
    await db.execute(
        "UPDATE conversations SET warm_state='closed', last_activity=NOW() WHERE id=$1::uuid",
        conv_id,
    )
    logger.info("Released affinity for conversation %s", conv_id)
