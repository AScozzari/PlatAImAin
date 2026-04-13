# Docker Images — Guida per Worker Pod

## Strategia: ibrida baked + Network Volume

| Tipo modello | Peso approx | Approccio | Script |
|---|---|---|---|
| STT (Whisper) | 1–6 GB | **Baked** nell'immagine | `Dockerfile.stt` |
| TTS (XTTS v2) | ~1.8 GB | **Baked** nell'immagine | `Dockerfile.tts` |
| TTS (Kokoro) | ~300 MB | **Baked** nell'immagine | `Dockerfile.tts` |
| LLM ≤ 7B | ≤ 5 GB | **Baked** nell'immagine | `Dockerfile.vllm` |
| LLM 32B – 72B | 20–45 GB | **Network Volume** | `setup_volume.sh` |
| LLM 72B+ | > 45 GB | **Network Volume** | `setup_volume.sh` |

---

## 1. Prerequisiti

```bash
# HuggingFace token con accesso ai modelli richiesti
export HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxx"

# Registry Docker privato configurato in Platform Settings
export REGISTRY="registry.plataimain.internal:5001"

# Login al registry
docker login $REGISTRY -u admin -p <password>
```

---

## 2. Modelli small/medium — immagine baked

### STT (Whisper Large v3 Turbo)
```bash
./scripts/build_pod_image.sh \
  --type stt \
  --hf-token $HF_TOKEN \
  --registry $REGISTRY \
  --push

# Output: registry.plataimain.internal:5001/plataimain/stt-whisper-large:latest
```

Altri modelli Whisper disponibili (cambia `--model`):
- `openai/whisper-large-v3` (6 GB VRAM)
- `openai/whisper-medium` (3 GB VRAM)

### TTS — XTTS v2
```bash
./scripts/build_pod_image.sh \
  --type tts \
  --tts-model xtts \
  --hf-token $HF_TOKEN \
  --registry $REGISTRY \
  --push

# Output: registry.plataimain.internal:5001/plataimain/tts-xtts:latest
```

### TTS — Kokoro v1
```bash
./scripts/build_pod_image.sh \
  --type tts \
  --tts-model kokoro \
  --hf-token $HF_TOKEN \
  --registry $REGISTRY \
  --push
```

### LLM ≤ 7B (Qwen 7B, Phi-4, ecc.)
```bash
./scripts/build_pod_image.sh \
  --type vllm \
  --model Qwen/Qwen2.5-7B-Instruct \
  --hf-token $HF_TOKEN \
  --registry $REGISTRY \
  --push

# Output: registry.plataimain.internal:5001/plataimain/vllm-qwen-qwen2.5-7b-instruct:latest
```

---

## 3. Modelli large — RunPod Network Volume

Per modelli ≥ 32B, i pesi non vanno baked nell'immagine (troppo grandi).
Si usa un **RunPod Network Volume** condiviso tra pod dello stesso modello.

### Step 1 — Crea il volume su RunPod
Dal dashboard RunPod: Storage → Network Volumes → Create → EU region → 200 GB.
Prendi nota del **Volume ID** (es: `vol-abc123`).

### Step 2 — Scarica i pesi nel volume
Crea un pod temporaneo RunPod con il volume montato, poi esegui:

```bash
# Dentro il pod RunPod (il volume è montato su /runpod-volume)
./scripts/setup_volume.sh \
  --hf-repo Qwen/Qwen2.5-72B-Instruct \
  --hf-token $HF_TOKEN

# Per altri modelli:
# --hf-repo Qwen/Qwen2.5-32B-Instruct   (32B, ~20 GB)
# --hf-repo Qwen/QwQ-32B                (reasoning, ~20 GB)
# --hf-repo deepseek-ai/DeepSeek-R1-70B (70B, ~42 GB)
```

### Step 3 — Crea Pod Definition nel dashboard
Nel form **Nuovo Pod**:
- **Docker Image**: `vllm/vllm-openai:latest`
- **Network Volume ID**: `vol-abc123`
- **GPU Type**: A100 SXM4 80GB (per 72B) o A100 40GB (per 32B)
- **Extra Config** (JSON):
  ```json
  {
    "args": [
      "--model", "/runpod-volume/models/Qwen/Qwen2.5-72B-Instruct",
      "--tensor-parallel-size", "1",
      "--max-model-len", "8192",
      "--gpu-memory-utilization", "0.95"
    ]
  }
  ```

---

## 4. Versioning immagini

Per un aggiornamento del modello (nuova revisione HF), usa un tag esplicito:

```bash
./scripts/build_pod_image.sh \
  --type stt \
  --hf-token $HF_TOKEN \
  --tag 2026-04 \
  --push
# → plataimain/stt-whisper-large:2026-04
```

---

## 5. Struttura immagini

```
plataimain/
├── stt-whisper-large:latest      # Whisper Large v3 Turbo
├── tts-xtts:latest               # XTTS v2
├── tts-kokoro:latest             # Kokoro v1
└── vllm-{model-name}:latest      # LLM/coding/vision ≤7B
```

Immagini base per modelli large (Network Volume):
```
vllm/vllm-openai:latest           # LLM 32B/72B via volume
```
