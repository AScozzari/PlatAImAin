"""
RunPod Manager — lifecycle pods via REST + GraphQL API.

Responsabilità:
  - start / stop / create / terminate pod
  - poll status fino a RUNNING + endpoint ready
  - query hardware specs (GPU types, VRAM)
  - fetch runtime metrics (requests_waiting, GPU utilization)

Credenziali: RUNPOD_API_KEY env var (caricata da platform_settings al primo uso)
"""

import asyncio
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

RUNPOD_REST = "https://rest.runpod.io/v1"
RUNPOD_GQL  = "https://api.runpod.io/graphql"

_http: Optional[httpx.AsyncClient] = None
_api_key: Optional[str] = None


# ─── Init ─────────────────────────────────────────────────────────────────────

def _get_api_key() -> str:
    global _api_key
    if _api_key:
        return _api_key
    key = os.environ.get("RUNPOD_API_KEY", "")
    if not key:
        raise RuntimeError("RUNPOD_API_KEY not configured")
    _api_key = key
    return key


def _get_http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=30.0)
    return _http


def set_api_key(key: str) -> None:
    """Called by settings_admin when the key is saved to DB."""
    global _api_key
    _api_key = key


async def close() -> None:
    global _http
    if _http:
        await _http.aclose()
        _http = None


def _auth_headers() -> dict:
    return {"Authorization": f"Bearer {_get_api_key()}"}


# ─── REST API ─────────────────────────────────────────────────────────────────

async def get_pod(pod_id: str) -> dict:
    """Fetch pod details from RunPod REST API."""
    r = await _get_http().get(
        f"{RUNPOD_REST}/pods/{pod_id}",
        headers=_auth_headers(),
    )
    r.raise_for_status()
    return r.json()


async def list_pods() -> list[dict]:
    """List all pods for this account."""
    r = await _get_http().get(
        f"{RUNPOD_REST}/pods",
        headers=_auth_headers(),
    )
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, list) else data.get("pods", [])


async def create_pod(
    name: str,
    image_name: str,
    gpu_type_id: str,
    gpu_count: int = 1,
    container_disk_gb: int = 20,
    network_volume_id: Optional[str] = None,
    ports: Optional[str] = None,        # es. "8000/http,22/tcp"
    env: Optional[dict] = None,
    template_id: Optional[str] = None,
) -> str:
    """Create a new pod on RunPod. Returns the runpod_pod_id."""
    body: dict = {
        "name": name,
        "imageName": image_name,
        "gpuTypeId": gpu_type_id,
        "gpuCount": gpu_count,
        "containerDiskInGb": container_disk_gb,
    }
    if network_volume_id:
        body["networkVolumeId"] = network_volume_id
    if ports:
        body["ports"] = ports
    if env:
        body["env"] = [{"key": k, "value": v} for k, v in env.items()]
    if template_id:
        body["templateId"] = template_id

    r = await _get_http().post(
        f"{RUNPOD_REST}/pods",
        headers=_auth_headers(),
        json=body,
    )
    r.raise_for_status()
    data = r.json()
    pod_id = data.get("id") or data.get("podId")
    if not pod_id:
        raise RuntimeError(f"RunPod create_pod: unexpected response: {data}")
    logger.info("Created RunPod pod %s (image=%s, gpu=%s)", pod_id, image_name, gpu_type_id)
    return pod_id


async def start_pod(pod_id: str, poll_timeout: int = 300) -> str:
    """
    Resume a stopped pod and wait until RUNNING.
    Returns the backend_url (http endpoint).
    """
    logger.info("Starting RunPod pod %s", pod_id)
    r = await _get_http().post(
        f"{RUNPOD_REST}/pods/{pod_id}/start",
        headers=_auth_headers(),
    )
    r.raise_for_status()
    return await _poll_until_ready(pod_id, timeout=poll_timeout)


async def stop_pod(pod_id: str) -> None:
    """Stop (pause) a running pod. GPU is released; container disk may be retained."""
    logger.info("Stopping RunPod pod %s", pod_id)
    r = await _get_http().post(
        f"{RUNPOD_REST}/pods/{pod_id}/stop",
        headers=_auth_headers(),
    )
    r.raise_for_status()


async def terminate_pod(pod_id: str) -> None:
    """Permanently terminate and delete a pod."""
    logger.info("Terminating RunPod pod %s", pod_id)
    r = await _get_http().delete(
        f"{RUNPOD_REST}/pods/{pod_id}",
        headers=_auth_headers(),
    )
    r.raise_for_status()


async def get_pod_status(pod_id: str) -> str:
    """Return current status string: RUNNING | STOPPED | STARTING | ERROR"""
    try:
        pod = await get_pod(pod_id)
        return pod.get("status", "UNKNOWN").upper()
    except httpx.HTTPStatusError as e:
        logger.warning("get_pod_status %s → %s", pod_id, e)
        return "ERROR"


async def _extract_endpoint(pod: dict) -> Optional[str]:
    """Extract the HTTP endpoint URL from a running pod's port mapping."""
    runtime = pod.get("runtime") or {}
    ports = runtime.get("ports") or []
    for p in ports:
        # Prefer port 8000 (vLLM / our services default)
        if p.get("privatePort") in (8000, 8001, 8010, 8020):
            pub_port = p.get("publicPort")
            host_id = pod.get("machine", {}).get("podHostId") or pod.get("id")
            if pub_port and host_id:
                return f"https://{host_id}-{pub_port}.proxy.runpod.net"
    # Fallback: first available port
    if ports:
        p = ports[0]
        pub_port = p.get("publicPort")
        host_id = pod.get("machine", {}).get("podHostId") or pod.get("id")
        if pub_port and host_id:
            return f"https://{host_id}-{pub_port}.proxy.runpod.net"
    return None


async def _poll_until_ready(pod_id: str, timeout: int = 300) -> str:
    """Poll every 5 s until pod is RUNNING and has an endpoint. Returns endpoint URL."""
    import time
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        await asyncio.sleep(5)
        try:
            pod = await get_pod(pod_id)
        except Exception as e:
            logger.debug("poll %s: %s", pod_id, e)
            continue
        status = (pod.get("status") or "").upper()
        logger.debug("Pod %s status=%s", pod_id, status)
        if status == "RUNNING":
            endpoint = await _extract_endpoint(pod)
            if endpoint:
                logger.info("Pod %s ready at %s", pod_id, endpoint)
                return endpoint
        elif status in ("EXITED", "DEAD", "ERROR"):
            raise RuntimeError(f"Pod {pod_id} entered status {status} during startup")
    raise TimeoutError(f"Pod {pod_id} did not become ready within {timeout}s")


# ─── GraphQL API ──────────────────────────────────────────────────────────────

async def _gql(query: str, variables: Optional[dict] = None) -> dict:
    payload: dict = {"query": query}
    if variables:
        payload["variables"] = variables
    r = await _get_http().post(
        RUNPOD_GQL,
        headers={**_auth_headers(), "Content-Type": "application/json"},
        json=payload,
    )
    r.raise_for_status()
    data = r.json()
    if "errors" in data:
        raise RuntimeError(f"GraphQL errors: {data['errors']}")
    return data.get("data", {})


async def list_gpu_types() -> list[dict]:
    """
    Return available GPU types with id, displayName, memoryInGb, price.
    Useful for hardware-aware pod matching in the dashboard.
    """
    query = """
    query {
      gpuTypes {
        id
        displayName
        memoryInGb
        cudaCores
        manufacturer
        securePrice
        communityPrice
      }
    }
    """
    data = await _gql(query)
    return data.get("gpuTypes", [])


async def get_pod_metrics(pod_id: str) -> dict:
    """
    Fetch runtime metrics for a running pod:
    GPU utilization %, VRAM used, CPU %, memory %.
    Also fetches vLLM queue depth via /metrics if available.
    """
    query = """
    query($podId: String!) {
      pod(input: { podId: $podId }) {
        id
        name
        runtime {
          gpus {
            id
            gpuUtilPercent
            memoryUtilPercent
          }
          container {
            cpuPercent
            memoryPercent
          }
        }
      }
    }
    """
    try:
        data = await _gql(query, {"podId": pod_id})
        pod_data = data.get("pod") or {}
        runtime = pod_data.get("runtime") or {}
        gpus = runtime.get("gpus") or []
        container = runtime.get("container") or {}
        return {
            "gpu_util_percent": gpus[0].get("gpuUtilPercent", 0) if gpus else 0,
            "vram_util_percent": gpus[0].get("memoryUtilPercent", 0) if gpus else 0,
            "cpu_percent": container.get("cpuPercent", 0),
            "memory_percent": container.get("memoryPercent", 0),
        }
    except Exception as e:
        logger.debug("get_pod_metrics %s: %s", pod_id, e)
        return {}


async def get_vllm_queue_depth(backend_url: str) -> int:
    """
    Query vLLM /metrics (Prometheus format) for pending requests.
    Returns 0 if unavailable (non-vLLM workers).
    """
    try:
        r = await _get_http().get(f"{backend_url}/metrics", timeout=3.0)
        for line in r.text.splitlines():
            if line.startswith("vllm:num_requests_waiting"):
                return int(float(line.split()[-1]))
        return 0
    except Exception:
        return 0


# ─── Connectivity test ────────────────────────────────────────────────────────

async def test_connection() -> dict:
    """Used by settings_admin to verify the API key is valid."""
    try:
        gpu_types = await list_gpu_types()
        return {"ok": True, "gpu_types_count": len(gpu_types)}
    except Exception as e:
        return {"ok": False, "error": str(e)}
