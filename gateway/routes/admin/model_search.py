"""
Admin API — Model repository search.

GET /admin/models/search?q=llama&category=llm&source=huggingface&max_results=20

Searches HuggingFace Hub (and in future other repos) for models that are
compatible with our gateway.  Returns structured results with estimated VRAM,
download stats, and a `compatible` flag indicating vLLM support.
"""

import logging
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from gateway.middleware.admin_auth import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin-model-search"])

HF_API_BASE = "https://huggingface.co/api"
HF_TOKEN = os.environ.get("HUGGING_FACE_HUB_TOKEN") or os.environ.get("HF_TOKEN")

# Category → HuggingFace pipeline_tag values we accept
CATEGORY_TASKS: dict[str, list[str]] = {
    "llm":       ["text-generation", "text2text-generation"],
    "reasoning": ["text-generation", "text2text-generation"],
    "coding":    ["text-generation", "code-generation"],
    "vision":    ["image-text-to-text", "visual-question-answering"],
    "embedding": ["sentence-similarity", "feature-extraction"],
    "stt":       ["automatic-speech-recognition"],
    "tts":       ["text-to-speech", "text-to-audio"],
}

# Known vLLM-compatible architecture class names (non-exhaustive but covers most popular)
VLLM_ARCHITECTURES: set[str] = {
    "LlamaForCausalLM", "Qwen2ForCausalLM", "Qwen2VLForConditionalGeneration",
    "MistralForCausalLM", "MixtralForCausalLM", "Phi3ForCausalLM",
    "PhiForCausalLM", "Phi3VForCausalLM", "GemmaForCausalLM", "Gemma2ForCausalLM",
    "GPTNeoXForCausalLM", "FalconForCausalLM", "CohereForCausalLM",
    "DeepseekV2ForCausalLM", "DeepseekV3ForCausalLM",
    "InternLMForCausalLM", "InternLM2ForCausalLM",
    "BaichuanForCausalLM", "ChatGLMModel",
    "T5ForConditionalGeneration", "MT5ForConditionalGeneration",
    "BertModel", "RobertaModel", "DebertaV2Model",  # embedding
    "XLMRobertaModel", "XLMRobertaForMaskedLM",
    "WhisperForConditionalGeneration",               # STT
    # vision
    "LlavaNextForConditionalGeneration", "LlavaForConditionalGeneration",
    "PaliGemmaForConditionalGeneration", "InternVLChatModel",
}

# STT / TTS models use dedicated microservices — always mark compatible=True for them
STT_TTS_CATEGORIES = {"stt", "tts"}


_http: httpx.AsyncClient | None = None


def _get_http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        headers = {}
        if HF_TOKEN:
            headers["Authorization"] = f"Bearer {HF_TOKEN}"
        _http = httpx.AsyncClient(timeout=15.0, headers=headers)
    return _http


def _estimate_vram(model_meta: dict) -> Optional[float]:
    """Rough VRAM estimate from parameter count (safetensors metadata if available)."""
    # Try safetensors metadata first
    params = model_meta.get("safetensors", {}).get("total", None)
    if not params:
        # Try card_data
        card = model_meta.get("cardData", {}) or {}
        params = card.get("model-index", [{}])[0].get("metadata", {}).get("parameters", None) if card.get("model-index") else None

    if not params:
        return None

    # Rule of thumb: 2 bytes/param for fp16 → GB; add 20% overhead
    gb = (params * 2) / (1024 ** 3) * 1.2
    return round(gb, 1)


def _is_vllm_compatible(model_meta: dict, category: str) -> bool:
    if category in STT_TTS_CATEGORIES:
        return True
    archs = model_meta.get("config", {}).get("architectures", [])
    if not archs:
        archs = model_meta.get("modelId", "")  # fallback
    if isinstance(archs, list):
        return any(a in VLLM_ARCHITECTURES for a in archs)
    return False


def _build_result(model_meta: dict, category: str) -> dict:
    model_id = model_meta.get("modelId") or model_meta.get("id", "")
    tags = model_meta.get("tags", []) or []
    return {
        "id": model_id.replace("/", "--").lower(),
        "name": model_id.split("/")[-1] if "/" in model_id else model_id,
        "hf_repo": model_id,
        "category": category,
        "estimated_vram_gb": _estimate_vram(model_meta),
        "downloads": model_meta.get("downloads", 0),
        "likes": model_meta.get("likes", 0),
        "tags": tags[:10],
        "pipeline_tag": model_meta.get("pipeline_tag"),
        "compatible": _is_vllm_compatible(model_meta, category),
        "gated": model_meta.get("gated", False),
        "private": model_meta.get("private", False),
        "author": model_meta.get("author"),
        "last_modified": model_meta.get("lastModified"),
    }


@router.get("/models/search")
async def search_models(
    q: str = Query(..., description="Search query"),
    category: Optional[str] = Query(None, description="Filter by category (llm, stt, tts, ...)"),
    source: str = Query("huggingface", description="Repository source (huggingface)"),
    max_results: int = Query(20, ge=1, le=100),
    compatible_only: bool = Query(False, description="Only return vLLM-compatible models"),
    _: dict = Depends(require_admin),
):
    if source != "huggingface":
        raise HTTPException(status_code=422, detail=f"Source '{source}' not supported yet")

    # Determine which pipeline_tags to filter by
    task_filter: list[str] = []
    if category:
        task_filter = CATEGORY_TASKS.get(category, [])

    try:
        results = await _search_huggingface(q, task_filter, max_results * 3)
    except httpx.RequestError as e:
        logger.error("HuggingFace API error: %s", e)
        raise HTTPException(status_code=502, detail="HuggingFace API unreachable")

    # Determine effective category for each result
    output = []
    for meta in results:
        effective_cat = category
        if not effective_cat:
            pt = meta.get("pipeline_tag", "")
            for cat, tasks in CATEGORY_TASKS.items():
                if pt in tasks:
                    effective_cat = cat
                    break
            if not effective_cat:
                effective_cat = "llm"

        item = _build_result(meta, effective_cat)
        if compatible_only and not item["compatible"]:
            continue
        output.append(item)
        if len(output) >= max_results:
            break

    return {
        "source": "huggingface",
        "query": q,
        "category": category,
        "total": len(output),
        "models": output,
    }


async def _search_huggingface(query: str, task_filters: list[str], limit: int) -> list[dict]:
    params: dict = {
        "search": query,
        "limit": min(limit, 100),
        "sort": "downloads",
        "direction": -1,
        "full": "true",
    }
    if task_filters:
        # HF API accepts multiple pipeline_tag via repeated param
        # httpx supports list values for params
        params["pipeline_tag"] = task_filters[0] if len(task_filters) == 1 else task_filters

    r = await _get_http().get(f"{HF_API_BASE}/models", params=params)
    r.raise_for_status()
    return r.json()
