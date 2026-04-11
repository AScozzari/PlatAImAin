# Custom AI Platform — API Reference

Base URL: `http://your-server:8000`

Autenticazione: `Authorization: Bearer <access_token>` oppure `x-api-key: <tenant_api_key>`

---

## OpenAI-Compatible Endpoints (tenant API key)

### Chat Completions
```
POST /v1/chat/completions
```
Parametri identici all'API OpenAI. Supporta streaming SSE (`stream: true`).  
**Auto-inject**: `stream_options: {include_usage: true}` — l'ultimo chunk SSE contiene sempre i token usati.

```json
{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}
```
`gpt-4o` viene remappato automaticamente a `qwen2.5-72b` (vedi `models.config.json`).

---

### Embeddings
```
POST /v1/embeddings
```
```json
{
  "model": "text-embedding-3-large",
  "input": "testo singolo o array di stringhe"
}
```
`input: string` viene normalizzato a `[string]` prima del proxy vLLM.  
Max 100 input per batch.

---

### Speech-to-Text
```
POST /v1/audio/transcriptions
Content-Type: multipart/form-data
```
| Campo | Tipo | Note |
|---|---|---|
| `file` | File (WAV/MP3/M4A) | Audio da trascrivere |
| `model` | string | Es. `whisper-1` → `whisper-large-v3-turbo` |
| `response_format` | string | `json` \| `text` \| `srt` \| `vtt` \| `verbose_json` |
| `language` | string | Opzionale, es. `it` |

---

### Text-to-Speech
```
POST /v1/audio/speech
```
```json
{
  "model": "tts-1",
  "input": "Testo da sintetizzare",
  "voice": "alloy"
}
```
`tts-1` → Kokoro v1, `tts-1-hd` → XTTS v2 (voice cloning se `voice` è un ID tenant).  
Response: `audio/wav` binario.

---

### Lista Modelli
```
GET /v1/models
```
Risposta con campo `capabilities` aggiuntivo rispetto allo standard OpenAI:
```json
{
  "id": "qwen2.5-72b",
  "object": "model",
  "capabilities": {
    "tool_calling": true,
    "streaming": true,
    "vision": false,
    "batch_input": false
  }
}
```

---

### Usage Tenant
```
GET  /v1/usage           → usage corrente mese
GET  /v1/usage/daily     → breakdown giornaliero
GET  /v1/usage/quota     → quota rimanente
```

---

## Auth Endpoints

### Login
```
POST /auth/login
```
```json
{ "email": "admin@example.com", "password": "..." }
```
Risposta: `{ "access_token", "refresh_token", "user": { "id", "email", "role" } }`  
Access token: 15 min. Refresh token: 7 giorni (rotante).

### Refresh Token
```
POST /auth/refresh
```
```json
{ "refresh_token": "..." }
```

### Logout
```
POST /auth/logout
```
```json
{ "refresh_token": "..." }
```

### Profilo corrente
```
GET /auth/me
```

### OAuth2
```
GET /auth/oauth2/google   → redirect Google PKCE
GET /auth/oauth2/github   → redirect GitHub PKCE
```

---

## Admin Endpoints (`Authorization: Bearer <admin_jwt>`)

### Tenants

| Method | Path | Descrizione |
|---|---|---|
| `GET` | `/admin/tenants` | Lista tenant. Params: `limit`, `offset` |
| `POST` | `/admin/tenants` | Crea tenant. Body: `{ name, plan, metadata? }` |
| `GET` | `/admin/tenants/:id` | Dettaglio + usage + quota + modelli |
| `PATCH` | `/admin/tenants/:id` | Aggiorna nome/piano/status |
| `DELETE` | `/admin/tenants/:id` | Elimina tenant |
| `POST` | `/admin/tenants/:id/api-key` | Rigenera API key (ritorna key raw una sola volta) |
| `PATCH` | `/admin/tenants/:id/quota` | Imposta quota mensile per categoria |

**Crea tenant:**
```json
{ "name": "Acme Corp", "plan": "business", "metadata": {} }
```
Risposta include `api_key` (mostrata una sola volta).

---

### Usage & Billing

| Method | Path | Descrizione |
|---|---|---|
| `GET` | `/admin/usage/overview` | KPI globali + daily_tokens + category_breakdown + top_tenants |
| `GET` | `/admin/usage/billing` | Report costi. Param: `period=YYYY-MM` |

**Overview response:**
```json
{
  "active_tenants": 4,
  "total_tokens_month": 12400000,
  "total_cost_month": 38.42,
  "requests_per_hour": 142,
  "daily_tokens": [{ "date": "2026-04-01", "total_tokens": 420000 }],
  "category_breakdown": [{ "category": "llm", "total_tokens": 8200000, "total_cost": 24.6 }],
  "top_tenants": [{ "tenant_id": "...", "tenant_name": "...", "total_tokens": 0, "total_cost": 0, "total_requests": 0 }]
}
```

---

### Models

| Method | Path | Descrizione |
|---|---|---|
| `GET` | `/admin/models` | Lista modelli con status e capabilities |
| `POST` | `/admin/models/reload` | Ricarica `models.config.json` e sincronizza DB |
| `GET` | `/admin/models/pricing` | Lista prezzi tutti i modelli |
| `PATCH` | `/admin/models/:id/pricing` | Aggiorna pricing. Body: `{ input_cost_per_1k_micro, output_cost_per_1k_micro }` |

Prezzi in **micro-USD per 1K token** (interi). Es: `3000` = $0.003/1K.

---

### Health

```
GET /admin/health
```
```json
{
  "status": "healthy",
  "models_ready": true,
  "gateway_version": "1.0.0",
  "uptime_seconds": 86400,
  "services": [
    { "name": "PostgreSQL", "status": "healthy", "latency_ms": 2 },
    { "name": "vLLM LLM", "status": "healthy", "latency_ms": 45 },
    { "name": "XTTS TTS", "status": "loading", "message": "Warming up..." }
  ]
}
```
`status` valori: `healthy` | `degraded` | `unhealthy` | `loading` | `not_started`  
HTTP 200 anche durante startup (`models_ready: false`) — non usare lo status code per healthcheck.

---

## Voices (tenant API key)

| Method | Path | Descrizione |
|---|---|---|
| `POST` | `/v1/voices` | Upload WAV campione (multipart), crea voice profile |
| `GET` | `/v1/voices` | Lista voci del tenant |
| `DELETE` | `/v1/voices/:id` | Elimina voice profile |

---

## Codici di errore

Tutti gli errori seguono il formato OpenAI:
```json
{
  "error": {
    "message": "descrizione errore",
    "type": "invalid_request_error",
    "code": "quota_exceeded"
  }
}
```

| HTTP | type | Causa |
|---|---|---|
| 401 | `authentication_error` | API key mancante/invalida |
| 403 | `permission_error` | Piano non autorizzato per questo modello |
| 429 | `rate_limit_error` | Rate limit orario superato |
| 429 | `quota_exceeded` | Quota mensile token esaurita |
| 500 | `server_error` | Errore interno gateway |

Headers 429: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
