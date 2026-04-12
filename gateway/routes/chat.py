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
    conversation_id = request.headers.get("X-Conversation-ID")

    body = await request.json()
    model_name = body.get("model", "gpt-4o")

    # Resolve model
    from gateway.services.router import get_router
    model_router = get_router()
    resolved = model_router.resolve(
        model_name,
        tenant.get("plan", "starter"),
    )

    # Replace model in body with actual model ID
    body["model"] = resolved.model_id
    body["user"] = tenant["id"]

    # PII Tokenization — sanitize messages before sending to the model
    pii_found = False
    if body.get("messages"):
        try:
            from gateway.services import pii_tokenizer
            body["messages"], pii_found = await pii_tokenizer.tokenize_messages(
                body["messages"], request_id
            )
        except Exception as e:
            logger.warning("PII tokenization error (non-fatal): %s", e)

    is_streaming = body.get("stream", False)

    extra_headers = {}
    if pii_found:
        extra_headers["X-PII-Redacted"] = "true"
    if conversation_id:
        extra_headers["X-Conversation-ID"] = conversation_id

    if is_streaming:
        body.setdefault("stream_options", {})["include_usage"] = True
        return StreamingResponse(
            _stream_proxy(resolved.backend_url, body, request, request_id, resolved, tenant,
                          pii_found=pii_found, conversation_id=conversation_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "X-Request-ID": request_id,
                **extra_headers,
            },
        )
    else:
        return await _json_proxy(resolved.backend_url, body, request, request_id, resolved, tenant,
                                 pii_found=pii_found, conversation_id=conversation_id)


async def _json_proxy(
    backend_url: str,
    body: dict,
    request: Request,
    request_id: str,
    resolved,
    tenant: dict,
    pii_found: bool = False,
    conversation_id: str = None,
) -> JSONResponse:
    url = f"{backend_url}/v1/chat/completions"
    headers = _proxy_headers(request, request_id)

    async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
        resp = await client.post(url, json=body, headers=headers)

    data = resp.json()

    # PII Detokenization — restore original values in the response
    if pii_found:
        try:
            from gateway.services import pii_tokenizer
            choices = data.get("choices", [])
            for choice in choices:
                msg = choice.get("message", {})
                if isinstance(msg.get("content"), str):
                    msg["content"] = await pii_tokenizer.detokenize(msg["content"], request_id)
        except Exception as e:
            logger.warning("PII detokenization error (non-fatal): %s", e)

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

    resp_headers = {"X-Request-ID": request_id}
    if pii_found:
        resp_headers["X-PII-Redacted"] = "true"

    return JSONResponse(content=data, status_code=resp.status_code, headers=resp_headers)


async def _stream_proxy(
    backend_url: str,
    body: dict,
    request: Request,
    request_id: str,
    resolved,
    tenant: dict,
    pii_found: bool = False,
    conversation_id: str = None,
) -> AsyncIterator[bytes]:
    url = f"{backend_url}/v1/chat/completions"
    headers = _proxy_headers(request, request_id)
    last_usage: dict = {}
    accumulated_content: list[str] = []

    async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
        async with client.stream("POST", url, json=body, headers=headers) as resp:
            async for line in resp.aiter_lines():
                if not line:
                    yield b"\n"
                    continue

                # If PII was found, we need to intercept and detokenize stream chunks
                if pii_found and line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        from gateway.services import pii_tokenizer
                        chunk = json.loads(line[6:])
                        for choice in chunk.get("choices", []):
                            delta = choice.get("delta", {})
                            if isinstance(delta.get("content"), str) and delta["content"]:
                                # Accumulate delta content for detokenization
                                # Note: tokens may span multiple chunks, detokenize full known tokens
                                detok = await pii_tokenizer.detokenize(delta["content"], request_id)
                                delta["content"] = detok
                                accumulated_content.append(detok)
                        if chunk.get("usage"):
                            last_usage = chunk["usage"]
                        line = "data: " + json.dumps(chunk)
                    except (json.JSONDecodeError, KeyError, Exception) as e:
                        logger.debug("PII stream detokenize error (non-fatal): %s", e)

                elif line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        chunk = json.loads(line[6:])
                        if chunk.get("usage"):
                            last_usage = chunk["usage"]
                    except (json.JSONDecodeError, KeyError):
                        pass

                yield (line + "\n\n").encode()

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
