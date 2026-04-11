import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Optional

logger = logging.getLogger(__name__)

PLAN_HIERARCHY = {"starter": 0, "business": 1, "enterprise": 2}

# Categories backed by vLLM (Type A) — backend_url_env resolves at runtime
VLLM_BACKEND_ENV_MAP = {
    "VLLM_LLM_URL": None,
    "VLLM_VISION_URL": None,
    "VLLM_CODING_URL": None,
    "VLLM_EMBEDDING_URL": None,
}


@dataclass
class ResolvedModel:
    model_id: str
    backend_url: Optional[str]
    endpoint_type: str
    category: str
    capabilities: dict
    tier: str
    min_plan: str
    backend: str


class ModelRouter:
    def __init__(self, config_path: str, settings: Any = None):
        self._settings = settings
        self._config_path = config_path
        self._config: dict = {}
        self._alias_index: dict[str, tuple[str, str]] = {}  # alias → (category, model_id)
        self._all_models: dict[str, dict] = {}  # model_id → model dict with category
        self._loaded_at: float = 0.0
        self._load()

    def _load(self) -> None:
        path = Path(self._config_path)
        if not path.exists():
            raise FileNotFoundError(f"models.config.json not found at {path}")

        with open(path, "r", encoding="utf-8") as f:
            self._config = json.load(f)

        self._alias_index = {}
        self._all_models = {}

        for category, cat_cfg in self._config["categories"].items():
            for model_id, model in cat_cfg["models"].items():
                enriched = {**model, "category": category, "backend": cat_cfg["backend"]}
                self._all_models[model_id] = enriched

                for alias in model.get("openai_aliases", []):
                    if alias in self._alias_index:
                        existing_cat, existing_id = self._alias_index[alias]
                        raise ValueError(
                            f"Duplicate OpenAI alias '{alias}': "
                            f"claimed by '{existing_id}' ({existing_cat}) "
                            f"and '{model_id}' ({category})"
                        )
                    self._alias_index[alias] = (category, model_id)

        self._loaded_at = time.time()
        logger.info(
            "ModelRouter loaded %d models across %d categories, %d aliases",
            len(self._all_models),
            len(self._config["categories"]),
            len(self._alias_index),
        )

    def reload(self) -> None:
        self._load()
        logger.info("ModelRouter reloaded from disk")

    def _get_backend_url(self, category: str) -> Optional[str]:
        cat_cfg = self._config["categories"].get(category, {})
        env_key = cat_cfg.get("backend_url_env")
        if env_key is None:
            return None
        if self._settings:
            url_map = {
                "VLLM_LLM_URL": self._settings.vllm_llm_url,
                "VLLM_VISION_URL": self._settings.vllm_vision_url,
                "VLLM_CODING_URL": self._settings.vllm_coding_url,
                "VLLM_EMBEDDING_URL": self._settings.vllm_embedding_url,
            }
            return url_map.get(env_key)
        import os
        return os.environ.get(env_key)

    def remap_openai_alias(self, model_name: str) -> Optional[str]:
        if model_name in self._alias_index:
            _, model_id = self._alias_index[model_name]
            return model_id
        return None

    def resolve(
        self,
        requested_model: str,
        tenant_plan: str,
        tenant_model_assignments: Optional[dict] = None,
    ) -> ResolvedModel:
        # 1. Check tenant-specific model assignment for the category
        if tenant_model_assignments:
            # Find category of the requested model first
            category = self._get_category_for_model(requested_model)
            if category and category in tenant_model_assignments:
                assigned_id = tenant_model_assignments[category]
                if self._is_available(assigned_id, tenant_plan):
                    return self._build_resolved(assigned_id)

        # 2. Remap OpenAI alias
        remapped = self.remap_openai_alias(requested_model)
        effective_model = remapped or requested_model

        # 3. Direct model ID lookup
        if effective_model in self._all_models:
            if self._is_available(effective_model, tenant_plan):
                return self._build_resolved(effective_model)
            # Model exists but plan too low — find best for plan in same category
            category = self._all_models[effective_model]["category"]
            fallback = self._get_default_for_plan(category, tenant_plan)
            return self._build_resolved(fallback)

        # 4. Check if requested_model looks like a category name
        if requested_model in self._config["categories"]:
            default_id = self._get_default_for_plan(requested_model, tenant_plan)
            return self._build_resolved(default_id)

        # 5. Fall back to LLM default
        logger.warning("Unknown model '%s', falling back to LLM default", requested_model)
        default_id = self._get_default_for_plan("llm", tenant_plan)
        return self._build_resolved(default_id)

    def _get_category_for_model(self, model_id: str) -> Optional[str]:
        # Check alias index first
        if model_id in self._alias_index:
            return self._alias_index[model_id][0]
        if model_id in self._all_models:
            return self._all_models[model_id]["category"]
        return None

    def _is_available(self, model_id: str, plan: str) -> bool:
        model = self._all_models.get(model_id)
        if not model:
            return False
        return PLAN_HIERARCHY.get(plan, 0) >= PLAN_HIERARCHY.get(model["min_plan"], 0)

    def _get_default_for_plan(self, category: str, plan: str) -> str:
        cat_cfg = self._config["categories"].get(category)
        if not cat_cfg:
            raise ValueError(f"Unknown category: {category}")

        plan_level = PLAN_HIERARCHY.get(plan, 0)
        candidates = [
            m for m in cat_cfg["models"].values()
            if PLAN_HIERARCHY.get(m.get("min_plan", "starter"), 0) <= plan_level
        ]
        if not candidates:
            # No model for this plan — return cheapest available
            candidates = list(cat_cfg["models"].values())

        # Prefer is_default=True, then sort by tier power descending within accessible
        candidates.sort(key=lambda m: (m.get("is_default", False), -PLAN_HIERARCHY.get(m.get("min_plan", "starter"), 0)), reverse=True)
        return candidates[0]["id"]

    def _build_resolved(self, model_id: str) -> ResolvedModel:
        model = self._all_models[model_id]
        category = model["category"]
        return ResolvedModel(
            model_id=model_id,
            backend_url=self._get_backend_url(category),
            endpoint_type=self._config["categories"][category]["endpoint_type"],
            category=category,
            capabilities=model.get("capabilities", {}),
            tier=model.get("tier", "balanced"),
            min_plan=model.get("min_plan", "starter"),
            backend=model.get("backend", "vllm"),
        )

    def get_category_backend_url(self, category: str) -> Optional[str]:
        return self._get_backend_url(category)

    def list_all(self, plan: Optional[str] = None) -> list[dict]:
        results = []
        for model_id, model in self._all_models.items():
            if plan and not self._is_available(model_id, plan):
                continue
            results.append({
                "id": model_id,
                "object": "model",
                "created": int(self._loaded_at),
                "owned_by": "custom-ai",
                "category": model["category"],
                "name": model.get("name", model_id),
                "description": model.get("description", ""),
                "capabilities": model.get("capabilities", {}),
                "context_window": model.get("context_window"),
                "speed": model.get("speed"),
                "quality": model.get("quality"),
                "tier": model.get("tier"),
                "min_plan": model.get("min_plan"),
                "is_default": model.get("is_default", False),
                "tags": model.get("tags", []),
                "languages": model.get("languages", []),
                "strengths": model.get("strengths", []),
            })
        return results

    def get_model_info(self, model_id: str) -> Optional[dict]:
        return self._all_models.get(model_id)

    def as_db_rows(self) -> list[dict]:
        rows = []
        for model_id, model in self._all_models.items():
            rows.append({
                "id": model_id,
                "category": model["category"],
                "name": model.get("name", model_id),
                "hf_repo": model.get("hf_repo"),
                "description": model.get("description"),
                "tier": model.get("tier"),
                "min_plan": model.get("min_plan", "starter"),
                "strengths": json.dumps(model.get("strengths", [])),
                "languages": json.dumps(model.get("languages", [])),
                "tags": json.dumps(model.get("tags", [])),
                "capabilities": json.dumps(model.get("capabilities", {})),
                "context_window": model.get("context_window"),
                "parameters_b": model.get("parameters_b"),
                "dimensions": model.get("dimensions"),
                "vram_gb": model.get("vram_gb"),
                "quantization": model.get("quantization"),
                "speed": model.get("speed"),
                "quality": model.get("quality"),
                "is_default": model.get("is_default", False),
                "extra_config": json.dumps({
                    k: v for k, v in model.items()
                    if k not in {"id", "category", "name", "hf_repo", "description",
                                  "tier", "min_plan", "strengths", "languages", "tags",
                                  "capabilities", "context_window", "parameters_b",
                                  "dimensions", "vram_gb", "quantization", "speed",
                                  "quality", "is_default", "backend", "openai_aliases"}
                }),
            })
        return rows


# Module-level singleton
_router: Optional[ModelRouter] = None


def get_router() -> ModelRouter:
    if _router is None:
        raise RuntimeError("ModelRouter not initialized")
    return _router


def init_router(config_path: str, settings: Any = None) -> ModelRouter:
    global _router
    _router = ModelRouter(config_path, settings=settings)
    return _router
