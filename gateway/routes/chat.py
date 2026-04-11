import asyncio
import json
import logging
import uuid
from typing import AsyncIterator

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from gateway.services import router as router_service
from gateway.services import tracking

logger = logging.getLogger(__name__)

router = APIRouter()

PROXY_TIMEOUT = httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=5.0)


@router.post("/v1/chat/completions")
async def chat_completions(request: Request):
    tenant = request.state.tenant
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())

    body = await request.json()
    model_name = body.get("model", "gpt-4o")

    # Resolve model (handles OpenAI aliases like gpt-4o → qwen2.5-72b)
    from gateway.services.router import get_router
    model_router = get_router()
    resolved = model_router.resolve(
        model_name,
        tenant.get("plan", "starter"),
    )

    # Replace model in body with actual model ID
    body["model"] = resolved.model_id
    body["user"] = tenant["id"]  # correlate in vLLM logs

    is_streaming = body.get("stream", False)

    if is_streaming:
        # Inject stream_options.include_usage = true (required for EasyFlow billing)
        body.setdefault("stream_options", {})["include_usage"] = True
        return StreamingResponse(
            _stream_proxy(resolved.backend_url, body, request, request_id, resolved, tenant),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",  # Critical for nginx — prevents buffering SSE
                "X-Request-ID": request_id,
            },
        )
    else:
        return await _json_proxy(resolved.backend_url, body, request, request_id, resolved, tenant)


async def _json_proxy(
    backend_url: str,
    body: dict,
    request: Request,
    request_id: str,
    resolved,
    tenant: dict,
) -> JSONResponse:
    url = f"{backend_url}/v1/chat/completions"
    headers = _proxy_headers(request, request_id)

    async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
        resp = await client.post(url, json=body, headers=headers)

    data = resp.json()

    # Track usage in background — never block the response
    usage = data.get("usage", {})
    asyncio.create_task(
        tracking.record_usage(
            tenant_id=tenant["id"],
            model_id=resolved.model_id,
            category=resolved.category,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            request_id=request_id,
            agent_id=getattr(request.state, "agent_id", None),
            session_id=getattr(request.state, "session_id", None),
        )
    )

    return JSONResponse(content=data, status_code=resp.status_code, headers={"X-Request-ID": request_id})


async def _stream_proxy(
    backend_url: str,
    body: dict,
    request: Request,
    request_id: str,
    resolved,
    tenant: dict,
) -> AsyncIterator[bytes]:
    url = f"{backend_url}/v1/chat/completions"
    headers = _proxy_headers(request, request_id)
    last_usage: dict = {}

    async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
        async with client.stream("POST", url, json=body, headers=headers) as resp:
            async for line in resp.aiter_lines():
                if not line:
                    yield b"\n"
                    continue

                yield (line + "\n\n").encode()

                # Extract usage from last data chunk for tracking
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        chunk = json.loads(line[6:])
                        if chunk.get("usage"):
                            last_usage = chunk["usage"]
                    except (json.JSONDecodeError, KeyError):
                        pass

    # After stream completes, track usage in background
    asyncio.create_task(
        tracking.record_usage(
            tenant_id=tenant["id"],
            model_id=resolved.model_id,
            category=resolved.category,
            prompt_tokens=last_usage.get("prompt_tokens", 0),
            completion_tokens=last_usage.get("completion_tokens", 0),
            request_id=request_id,
            agent_id=getattr(request.state, "agent_id", None),
            session_id=getattr(request.state, "session_id", None),
        )
    )


def _proxy_headers(request: Request, request_id: str) -> dict:
    """Build headers to forward to vLLM, stripping auth headers."""
    return {
        "Content-Type": "application/json",
        "X-Request-ID": request_id,
    }
