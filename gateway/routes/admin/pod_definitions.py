"""
Admin API — Pod Definitions (lifecycle RunPod).

Un pod definition = configurazione di un pod RunPod con modello precaricato.

Endpoints:
  GET    /admin/pods                          lista tutti i pod definitions
  GET    /admin/pods/:id                      dettaglio pod
  POST   /admin/pods                          crea pod definition (non avvia su RunPod)
  PATCH  /admin/pods/:id                      aggiorna configurazione
  DELETE /admin/pods/:id                      elimina definition (termina pod se running)

  POST   /admin/pods/:id/start               avvia pod su RunPod → status=starting→running
  POST   /admin/pods/:id/stop                ferma pod (stop, non terminate)
  POST   /admin/pods/:id/terminate           termina e distruggi pod RunPod
  POST   /admin/pods/create-on-runpod        crea nuovo pod su RunPod da definition

  GET    /admin/pods/:id/metrics             metriche real-time (GPU util, VRAM, queue)
  GET    /admin/gpu-types                    lista GPU disponibili su RunPod
"""

import json
import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from gateway.middleware.admin_auth import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin-pods"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PodDefinitionCreate(BaseModel):
    name: str
    model_id: str
    worker_type: str = "vllm"           # vllm | stt_worker | tts_worker | custom
    docker_image: str
    gpu_type: Optional[str] = None
    gpu_count: int = 1
    vram_gb: float
    container_disk_gb: int = 20
    region: str = "EU"
    session_type: str = "idle"          # idle | persistent | fallback | scheduled
    idle_timeout_minutes: int = 30
    schedule_cron: Optional[str] = None
    schedule_stop_cron: Optional[str] = None
    prewarm_minutes: int = 15
    priority: int = 100
    network_volume_id: Optional[str] = None
    runpod_template_id: Optional[str] = None
    extra_config: Optional[dict] = None


class PodDefinitionPatch(BaseModel):
    name: Optional[str] = None
    docker_image: Optional[str] = None
    gpu_type: Optional[str] = None
    gpu_count: Optional[int] = None
    vram_gb: Optional[float] = None
    container_disk_gb: Optional[int] = None
    region: Optional[str] = None
    session_type: Optional[str] = None
    idle_timeout_minutes: Optional[int] = None
    schedule_cron: Optional[str] = None
    schedule_stop_cron: Optional[str] = None
    prewarm_minutes: Optional[int] = None
    priority: Optional[int] = None
    network_volume_id: Optional[str] = None
    extra_config: Optional[dict] = None


# ─── DB helpers ───────────────────────────────────────────────────────────────

def _serialize(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif k == "id":
            out[k] = str(v)
        else:
            out[k] = v
    return out


async def _get_pod(pod_id: str) -> Optional[dict]:
    from gateway.db.postgres import get_pool
    row = await get_pool().fetchrow("SELECT * FROM pod_definitions WHERE id=$1::uuid", pod_id)
    return dict(row) if row else None


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/pods")
async def list_pods(
    model_id: Optional[str] = None,
    worker_type: Optional[str] = None,
    _: dict = Depends(require_admin),
):
    from gateway.db.postgres import get_pool
    db = get_pool()
    if model_id and worker_type:
        rows = await db.fetch(
            "SELECT * FROM pod_definitions WHERE model_id=$1 AND worker_type=$2 ORDER BY priority, created_at",
            model_id, worker_type,
        )
    elif model_id:
        rows = await db.fetch(
            "SELECT * FROM pod_definitions WHERE model_id=$1 ORDER BY priority, created_at", model_id
        )
    elif worker_type:
        rows = await db.fetch(
            "SELECT * FROM pod_definitions WHERE worker_type=$1 ORDER BY priority, created_at", worker_type
        )
    else:
        rows = await db.fetch(
            "SELECT * FROM pod_definitions ORDER BY model_id, priority, created_at"
        )
    return {"pods": [_serialize(dict(r)) for r in rows]}


@router.get("/pods/{pod_id}")
async def get_pod(pod_id: str, _: dict = Depends(require_admin)):
    pod = await _get_pod(pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")
    return _serialize(pod)


@router.post("/pods", status_code=201)
async def create_pod(body: PodDefinitionCreate, admin: dict = Depends(require_admin)):
    from gateway.db.postgres import get_pool
    db = get_pool()
    row = await db.fetchrow(
        """
        INSERT INTO pod_definitions
            (name, model_id, worker_type, docker_image,
             gpu_type, gpu_count, vram_gb, container_disk_gb, region,
             session_type, idle_timeout_minutes, schedule_cron, schedule_stop_cron,
             prewarm_minutes, priority,
             network_volume_id, runpod_template_id,
             pod_status, extra_config)
        VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'stopped',$18)
        RETURNING *
        """,
        body.name, body.model_id, body.worker_type, body.docker_image,
        body.gpu_type, body.gpu_count, body.vram_gb, body.container_disk_gb, body.region,
        body.session_type, body.idle_timeout_minutes, body.schedule_cron, body.schedule_stop_cron,
        body.prewarm_minutes, body.priority,
        body.network_volume_id, body.runpod_template_id,
        json.dumps(body.extra_config or {}),
    )
    logger.info("Created pod definition %s (%s / %s)", row["id"], body.model_id, body.name)
    return _serialize(dict(row))


@router.patch("/pods/{pod_id}")
async def patch_pod(
    pod_id: str,
    body: PodDefinitionPatch,
    admin: dict = Depends(require_admin),
):
    pod = await _get_pod(pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return _serialize(pod)

    fields = []
    values = []
    i = 1
    for col, val in updates.items():
        if col == "extra_config":
            val = json.dumps(val)
        fields.append(f"{col}=${i}")
        values.append(val)
        i += 1
    fields.append(f"updated_at=NOW()")
    values.append(pod_id)
    sql = f"UPDATE pod_definitions SET {', '.join(fields)} WHERE id=${i}::uuid RETURNING *"

    from gateway.db.postgres import get_pool
    row = await get_pool().fetchrow(sql, *values)
    return _serialize(dict(row))


@router.delete("/pods/{pod_id}", status_code=204)
async def delete_pod(pod_id: str, admin: dict = Depends(require_admin)):
    pod = await _get_pod(pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    # Terminate RunPod pod if it exists and is not stopped
    if pod.get("runpod_pod_id") and pod.get("pod_status") not in ("stopped", "error"):
        try:
            from gateway.services import runpod_manager
            await runpod_manager.terminate_pod(pod["runpod_pod_id"])
        except Exception as e:
            logger.warning("Could not terminate RunPod pod %s before delete: %s", pod["runpod_pod_id"], e)

    from gateway.db.postgres import get_pool
    await get_pool().execute("DELETE FROM pod_definitions WHERE id=$1::uuid", pod_id)


# ─── Lifecycle actions ────────────────────────────────────────────────────────

@router.post("/pods/{pod_id}/start")
async def start_pod(pod_id: str, admin: dict = Depends(require_admin)):
    """Start (or resume) the pod on RunPod. Waits until endpoint is ready."""
    pod = await _get_pod(pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    if pod["pod_status"] == "running":
        return {"ok": True, "message": "Pod already running", "backend_url": pod.get("backend_url")}

    runpod_pod_id = pod.get("runpod_pod_id")
    if not runpod_pod_id:
        raise HTTPException(
            status_code=422,
            detail="Pod has no runpod_pod_id. Use /admin/pods/:id/create-on-runpod first.",
        )

    from gateway.db.postgres import get_pool
    db = get_pool()

    # Mark as starting
    await db.execute(
        "UPDATE pod_definitions SET pod_status='starting', started_by=$1, started_at=NOW(), updated_at=NOW() WHERE id=$2::uuid",
        admin.get("email"), pod_id,
    )

    try:
        from gateway.services import runpod_manager
        backend_url = await runpod_manager.start_pod(runpod_pod_id)
        await db.execute(
            "UPDATE pod_definitions SET pod_status='running', backend_url=$1, updated_at=NOW() WHERE id=$2::uuid",
            backend_url, pod_id,
        )
        # Invalidate session manager cache
        from gateway.services import session_manager
        await session_manager.invalidate_pod_cache(pod["model_id"])
        return {"ok": True, "pod_id": pod_id, "backend_url": backend_url}
    except Exception as e:
        await db.execute(
            "UPDATE pod_definitions SET pod_status='error', updated_at=NOW() WHERE id=$1::uuid", pod_id
        )
        logger.error("Failed to start pod %s: %s", pod_id, e)
        raise HTTPException(status_code=502, detail=f"RunPod start failed: {e}")


@router.post("/pods/{pod_id}/stop")
async def stop_pod(pod_id: str, _: dict = Depends(require_admin)):
    """Stop (pause) the RunPod pod. GPU is released."""
    pod = await _get_pod(pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    runpod_pod_id = pod.get("runpod_pod_id")
    if not runpod_pod_id:
        raise HTTPException(status_code=422, detail="Pod has no runpod_pod_id")

    from gateway.db.postgres import get_pool
    db = get_pool()

    try:
        from gateway.services import runpod_manager
        await runpod_manager.stop_pod(runpod_pod_id)
        await db.execute(
            "UPDATE pod_definitions SET pod_status='stopped', backend_url=NULL, updated_at=NOW() WHERE id=$1::uuid",
            pod_id,
        )
        from gateway.services import session_manager
        await session_manager.invalidate_pod_cache(pod["model_id"])
        return {"ok": True, "pod_id": pod_id, "status": "stopped"}
    except Exception as e:
        logger.error("Failed to stop pod %s: %s", pod_id, e)
        raise HTTPException(status_code=502, detail=f"RunPod stop failed: {e}")


@router.post("/pods/{pod_id}/terminate")
async def terminate_pod(pod_id: str, _: dict = Depends(require_admin)):
    """Permanently terminate (destroy) the RunPod pod. Irreversible."""
    pod = await _get_pod(pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    runpod_pod_id = pod.get("runpod_pod_id")
    if not runpod_pod_id:
        raise HTTPException(status_code=422, detail="Pod has no runpod_pod_id")

    try:
        from gateway.services import runpod_manager
        await runpod_manager.terminate_pod(runpod_pod_id)
    except Exception as e:
        logger.error("Failed to terminate RunPod pod %s: %s", runpod_pod_id, e)
        raise HTTPException(status_code=502, detail=f"RunPod terminate failed: {e}")

    from gateway.db.postgres import get_pool
    await get_pool().execute(
        "UPDATE pod_definitions SET pod_status='stopped', runpod_pod_id=NULL, backend_url=NULL, updated_at=NOW() WHERE id=$1::uuid",
        pod_id,
    )
    from gateway.services import session_manager
    await session_manager.invalidate_pod_cache(pod["model_id"])
    return {"ok": True, "pod_id": pod_id, "message": "Pod terminated on RunPod"}


@router.post("/pods/{pod_id}/create-on-runpod", status_code=201)
async def create_pod_on_runpod(pod_id: str, admin: dict = Depends(require_admin)):
    """
    Create the actual pod on RunPod (provisions compute).
    Stores the runpod_pod_id in the definition.
    """
    pod = await _get_pod(pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    if pod.get("runpod_pod_id"):
        return {"ok": True, "message": "Pod already exists on RunPod", "runpod_pod_id": pod["runpod_pod_id"]}

    extra = pod.get("extra_config") or {}
    if isinstance(extra, str):
        extra = json.loads(extra)

    ports = extra.get("ports", "8000/http,22/tcp")
    env_vars = extra.get("env", {})

    try:
        from gateway.services import runpod_manager
        runpod_pod_id = await runpod_manager.create_pod(
            name=pod["name"],
            image_name=pod["docker_image"],
            gpu_type_id=pod.get("gpu_type") or "",
            gpu_count=pod.get("gpu_count", 1),
            container_disk_gb=pod.get("container_disk_gb", 20),
            network_volume_id=pod.get("network_volume_id"),
            ports=ports,
            env=env_vars,
            template_id=pod.get("runpod_template_id"),
        )
    except Exception as e:
        logger.error("Failed to create pod %s on RunPod: %s", pod_id, e)
        raise HTTPException(status_code=502, detail=f"RunPod create failed: {e}")

    from gateway.db.postgres import get_pool
    await get_pool().execute(
        "UPDATE pod_definitions SET runpod_pod_id=$1, pod_status='stopped', updated_at=NOW() WHERE id=$2::uuid",
        runpod_pod_id, pod_id,
    )
    return {"ok": True, "pod_id": pod_id, "runpod_pod_id": runpod_pod_id}


# ─── Metrics ──────────────────────────────────────────────────────────────────

@router.get("/pods/{pod_id}/metrics")
async def get_pod_metrics(pod_id: str, _: dict = Depends(require_admin)):
    """Real-time RunPod metrics: GPU util, VRAM, CPU, queue depth."""
    pod = await _get_pod(pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")

    runpod_pod_id = pod.get("runpod_pod_id")
    backend_url = pod.get("backend_url")

    metrics: dict = {"pod_id": pod_id, "pod_status": pod["pod_status"]}

    if runpod_pod_id:
        try:
            from gateway.services import runpod_manager
            hw = await runpod_manager.get_pod_metrics(runpod_pod_id)
            metrics.update(hw)
        except Exception as e:
            metrics["metrics_error"] = str(e)

    if backend_url:
        try:
            from gateway.services import runpod_manager
            queue = await runpod_manager.get_vllm_queue_depth(backend_url)
            metrics["vllm_queue_depth"] = queue
        except Exception:
            metrics["vllm_queue_depth"] = 0

    return metrics


# ─── GPU types ────────────────────────────────────────────────────────────────

@router.get("/gpu-types")
async def list_gpu_types(_: dict = Depends(require_admin)):
    """List available RunPod GPU types with pricing."""
    try:
        from gateway.services import runpod_manager
        gpu_types = await runpod_manager.list_gpu_types()
        return {"gpu_types": gpu_types}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"RunPod API error: {e}")
