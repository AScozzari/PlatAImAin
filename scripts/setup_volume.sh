#!/usr/bin/env bash
# ─── setup_volume.sh ──────────────────────────────────────────────────────────
# Scarica pesi di un modello grande (32B/72B) dentro un RunPod Network Volume.
# Usa questo approccio invece di bake-nell'immagine per modelli > 7B.
#
# Prerequisiti:
#   - RunPod Network Volume già creato (tramite dashboard RunPod o API)
#   - Un pod temporaneo RunPod montato su /runpod-volume
#   - Eseguire questo script DENTRO il pod temporaneo
#
# Usage (eseguire dentro un pod RunPod con il volume montato):
#   ./setup_volume.sh \
#     --hf-repo Qwen/Qwen2.5-72B-Instruct \
#     --hf-token hf_xxx \
#     [--volume-path /runpod-volume/models]
#
# Dopo il download, nel PodDefinitionModal:
#   - Docker Image: vllm/vllm-openai:latest
#   - Network Volume ID: <il tuo volume ID>
#   - Extra Config (startup command):
#     {"args": ["--model", "/runpod-volume/models/Qwen/Qwen2.5-72B-Instruct",
#               "--tensor-parallel-size", "1",
#               "--max-model-len", "8192"]}
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HF_REPO=""
HF_TOKEN="${HF_TOKEN:-}"
VOLUME_PATH="/runpod-volume/models"

while [[ $# -gt 0 ]]; do
  case $1 in
    --hf-repo)     HF_REPO="$2";     shift 2 ;;
    --hf-token)    HF_TOKEN="$2";    shift 2 ;;
    --volume-path) VOLUME_PATH="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "$HF_REPO" ]]; then
  echo "Error: --hf-repo is required (e.g. Qwen/Qwen2.5-72B-Instruct)"
  exit 1
fi

if [[ -z "$HF_TOKEN" ]]; then
  echo "Error: --hf-token is required (or set HF_TOKEN env var)"
  exit 1
fi

DEST="${VOLUME_PATH}/${HF_REPO}"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  PlatAImAin — Network Volume Setup                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Model     : $HF_REPO"
echo "  Destination: $DEST"
echo ""

# Install hf client if not present
pip install --quiet huggingface_hub[hf_transfer] 2>/dev/null || true

mkdir -p "$DEST"

python3 - <<PYEOF
from huggingface_hub import snapshot_download
import os

print(f"  Downloading {os.environ.get('HF_REPO', '${HF_REPO}')} ...")
snapshot_download(
    "${HF_REPO}",
    local_dir="${DEST}",
    token="${HF_TOKEN}",
    ignore_patterns=["*.pt"],       # prefer .safetensors
)
print("  Download complete.")
PYEOF

echo ""
echo "  ✓ Model saved to: $DEST"
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  PodDefinitionModal settings:"
echo ""
echo "    Docker Image    : vllm/vllm-openai:latest"
echo "    Network Volume  : <your-volume-id>"
echo "    Startup command : --model ${DEST} --tensor-parallel-size 1"
echo "══════════════════════════════════════════════════════════"
echo ""
