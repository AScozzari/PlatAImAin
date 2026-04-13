#!/usr/bin/env bash
# ─── build_pod_image.sh ───────────────────────────────────────────────────────
# Builds a Docker image with model weights baked in and pushes to the registry.
#
# Usage:
#   ./scripts/build_pod_image.sh \
#     --type stt \
#     --hf-token hf_xxx \
#     [--registry registry.plataimain.internal:5001] \
#     [--model Qwen/Qwen2.5-7B-Instruct]  # only for vllm
#     [--tts-model xtts]                  # xtts | kokoro (only for tts)
#     [--push]                            # push to registry after build
#     [--no-cache]                        # disable Docker layer cache
#
# Output: prints the full image URI to use in PodDefinitionModal
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ─── Defaults ─────────────────────────────────────────────────────────────────
TYPE=""
HF_TOKEN="${HF_TOKEN:-}"
HF_REPO=""
TTS_MODEL="xtts"
REGISTRY="${REGISTRY:-registry.plataimain.internal:5001}"
PUSH=false
NO_CACHE=""
TAG="latest"

# ─── Parse args ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --type)       TYPE="$2";       shift 2 ;;
    --hf-token)   HF_TOKEN="$2";  shift 2 ;;
    --model)      HF_REPO="$2";   shift 2 ;;
    --tts-model)  TTS_MODEL="$2"; shift 2 ;;
    --registry)   REGISTRY="$2";  shift 2 ;;
    --tag)        TAG="$2";        shift 2 ;;
    --push)       PUSH=true;       shift   ;;
    --no-cache)   NO_CACHE="--no-cache"; shift ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# ─── Validate ─────────────────────────────────────────────────────────────────
if [[ -z "$TYPE" ]]; then
  echo "Error: --type is required (stt | tts | vllm)"
  exit 1
fi

if [[ -z "$HF_TOKEN" ]]; then
  echo "Error: --hf-token is required (or set HF_TOKEN env var)"
  exit 1
fi

# ─── Build ────────────────────────────────────────────────────────────────────
case "$TYPE" in
  stt)
    IMAGE_NAME="plataimain/stt-whisper-large"
    MODEL_LABEL="${HF_REPO:-openai/whisper-large-v3-turbo}"
    DOCKERFILE="$SCRIPT_DIR/Dockerfile.stt"
    BUILD_ARGS="--build-arg HF_TOKEN=$HF_TOKEN --build-arg MODEL_NAME=${HF_REPO:-openai/whisper-large-v3-turbo}"
    ;;
  tts)
    IMAGE_NAME="plataimain/tts-${TTS_MODEL}"
    MODEL_LABEL="tts-${TTS_MODEL}"
    DOCKERFILE="$SCRIPT_DIR/Dockerfile.tts"
    BUILD_ARGS="--build-arg HF_TOKEN=$HF_TOKEN --build-arg MODEL_TYPE=${TTS_MODEL}"
    ;;
  vllm)
    if [[ -z "$HF_REPO" ]]; then
      echo "Error: --model is required for type=vllm (e.g. Qwen/Qwen2.5-7B-Instruct)"
      exit 1
    fi
    # Sanitize repo name for Docker tag: org/name → org-name
    SAFE_NAME=$(echo "$HF_REPO" | tr '/' '-' | tr '[:upper:]' '[:lower:]')
    IMAGE_NAME="plataimain/vllm-${SAFE_NAME}"
    MODEL_LABEL="$HF_REPO"
    DOCKERFILE="$SCRIPT_DIR/Dockerfile.vllm"
    BUILD_ARGS="--build-arg HF_TOKEN=$HF_TOKEN --build-arg HF_REPO=$HF_REPO"
    ;;
  *)
    echo "Error: --type must be one of: stt | tts | vllm"
    exit 1
    ;;
esac

FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  PlatAImAin — Pod Image Builder                       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Type      : $TYPE"
echo "  Model     : $MODEL_LABEL"
echo "  Image     : $FULL_IMAGE"
echo "  Dockerfile: $DOCKERFILE"
echo ""
echo "  Starting build... (this may take 10-30 min for large models)"
echo ""

docker build \
  -f "$DOCKERFILE" \
  $BUILD_ARGS \
  $NO_CACHE \
  -t "$FULL_IMAGE" \
  "$PROJECT_ROOT"

echo ""
echo "  ✓ Build complete: $FULL_IMAGE"

if $PUSH; then
  echo "  Pushing to registry..."
  docker push "$FULL_IMAGE"
  echo "  ✓ Push complete"
fi

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Use this image URI in PodDefinitionModal:"
echo ""
echo "    $FULL_IMAGE"
echo "══════════════════════════════════════════════════════════"
echo ""
