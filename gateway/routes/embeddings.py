import asyncio
import logging
import uuid
from typing import Union

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from gateway.services import tracking

logger = logging.getLogger(__name__)

router = APIRouter()

PROXY_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=5.0)
MAX_BATCH_SIZE = 100


class EmbeddingRequest(BaseModel):
    model: str = "text-embedding-3-large"
    input: Union[str, list[str]]
    encoding_format: str = "float"
    dimensions: int = None
    user: str = None


@router.post("/v1/embeddings")
async def embeddings(req: EmbeddingRequest, request: Request):
    tenant = request.state.tenant
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())

    # Resolve model alias
    from gateway.services.router import get_router
    model_router = get_router()
    resolved = model_router.resolve(req.model, tenant.get("plan", "starter"))

    # Normalize input: always send array to vLLM
    if isinstance(req.input, str):
        inputs = [req.input]
    else:
        inputs = req.input

    if len(inputs) > MAX_BATCH_SIZE:
        return JSONResponse(
            status_code=400,
            content={"error": {
                "type": "invalid_request_error",
                "message": f"Maximum batch size is {MAX_BATCH_SIZE} inputs",
            }},
        )

    body = {
        "model": resolved.model_id,
        "input": inputs,
        "encoding_format": req.encoding_format,
    }
    if req.dimensions:
        body["dimensions"] = req.dimensions

    backend_url = f"{resolved.backend_url}/v1/embeddings"

    async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
        resp = await client.post(
            backend_url,
            json=body,
            headers={"Content-Type": "application/json", "X-Request-ID": request_id},
        )

    data = resp.json()

    # Track usage
    usage = data.get("usage", {})
    asyncio.create_task(
        tracking.record_usage(
            tenant_id=tenant["id"],
            model_id=resolved.model_id,
            category="embedding",
            prompt_tokens=usage.get("total_tokens", len(inputs)),
            request_id=request_id,
        )
    )

    return JSONResponse(content=data, status_code=resp.status_code)
