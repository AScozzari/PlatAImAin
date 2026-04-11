#!/usr/bin/env python3
"""
Download models from HuggingFace based on models.config.json.

Usage:
    python scripts/download_models.py [--categories llm,stt,tts] [--models qwen2.5-72b,bge-m3]
    python scripts/download_models.py --list    # show all models
    python scripts/download_models.py --all     # download everything
"""
import argparse
import json
import os
import sys
from pathlib import Path

try:
    from huggingface_hub import snapshot_download
except ImportError:
    print("ERROR: huggingface_hub not installed. Run: pip install huggingface-hub")
    sys.exit(1)

REPO_ROOT = Path(__file__).parent.parent
CONFIG_PATH = REPO_ROOT / "models.config.json"
DEFAULT_MODEL_DIR = Path(os.environ.get("MODEL_BASE_DIR", "/models"))
HF_TOKEN = os.environ.get("HUGGING_FACE_HUB_TOKEN") or os.environ.get("HF_TOKEN")

CATEGORY_DIRS = {
    "llm": "llm",
    "reasoning": "llm",
    "coding": "coding",
    "vision": "vision",
    "embedding": "embedding",
    "stt": "stt",
    "tts": "tts",
}


def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return json.load(f)


def get_all_models(config: dict) -> list[dict]:
    models = []
    for category, cat_cfg in config["categories"].items():
        for model_id, model in cat_cfg["models"].items():
            models.append({
                "id": model_id,
                "category": category,
                "name": model.get("name", model_id),
                "hf_repo": model.get("hf_repo"),
                "vram_gb": model.get("vram_gb", 0),
            })
    return models


def download_model(model: dict, model_base_dir: Path, force: bool = False) -> bool:
    model_id = model["id"]
    hf_repo = model.get("hf_repo")
    if not hf_repo:
        print(f"  SKIP {model_id}: no hf_repo configured")
        return False

    category_dir = CATEGORY_DIRS.get(model["category"], model["category"])
    target_dir = model_base_dir / category_dir / model_id

    if target_dir.exists() and any(target_dir.iterdir()) and not force:
        print(f"  SKIP {model_id}: already exists at {target_dir}")
        return False

    target_dir.mkdir(parents=True, exist_ok=True)
    print(f"  Downloading {model_id} ({hf_repo}) → {target_dir}")
    print(f"    VRAM required: {model.get('vram_gb', '?')} GB")

    try:
        snapshot_download(
            repo_id=hf_repo,
            local_dir=str(target_dir),
            token=HF_TOKEN,
            ignore_patterns=["*.pt", "*.bin", "original/*"],  # prefer safetensors
        )
        print(f"  ✓ {model_id} downloaded successfully")
        return True
    except Exception as e:
        print(f"  ✗ {model_id} FAILED: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Download Custom AI models from HuggingFace")
    parser.add_argument("--all", action="store_true", help="Download all models")
    parser.add_argument("--categories", help="Comma-separated categories (e.g. llm,stt,tts)")
    parser.add_argument("--models", help="Comma-separated model IDs (e.g. qwen2.5-72b,bge-m3)")
    parser.add_argument("--list", action="store_true", help="List all models without downloading")
    parser.add_argument("--model-dir", default=str(DEFAULT_MODEL_DIR), help="Base directory for models")
    parser.add_argument("--force", action="store_true", help="Re-download even if exists")
    args = parser.parse_args()

    config = load_config()
    all_models = get_all_models(config)
    model_base_dir = Path(args.model_dir)

    if args.list:
        print(f"\nAll models in {CONFIG_PATH}:\n")
        for m in all_models:
            status = "✓" if (model_base_dir / CATEGORY_DIRS.get(m["category"], m["category"]) / m["id"]).exists() else "○"
            print(f"  {status} [{m['category']:12}] {m['id']:30} ({m.get('vram_gb', '?')} GB VRAM)  {m['hf_repo']}")
        return

    # Filter models to download
    to_download = []
    if args.all:
        to_download = all_models
    elif args.categories:
        cats = [c.strip() for c in args.categories.split(",")]
        to_download = [m for m in all_models if m["category"] in cats]
    elif args.models:
        ids = [m.strip() for m in args.models.split(",")]
        to_download = [m for m in all_models if m["id"] in ids]
    else:
        parser.print_help()
        return

    if not to_download:
        print("No models selected.")
        return

    print(f"\nDownloading {len(to_download)} model(s) to {model_base_dir}\n")
    if HF_TOKEN:
        print("Using HuggingFace token from environment\n")
    else:
        print("WARNING: No HF_TOKEN set — gated models will fail\n")

    success, failed = 0, 0
    for model in to_download:
        result = download_model(model, model_base_dir, force=args.force)
        if result:
            success += 1
        else:
            failed += 1

    print(f"\nDone: {success} downloaded, {failed} skipped/failed")


if __name__ == "__main__":
    main()
