// Mock data returned in DEV mode when the backend is not running

const today = new Date();
const days = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(today);
  d.setDate(d.getDate() - (29 - i));
  return d.toISOString().slice(0, 10);
});

export const MOCK: Record<string, unknown> = {
  "/admin/usage/overview": {
    period: days[days.length - 1].slice(0, 7),
    currency: "EUR",
    summary: {
      active_tenants: 4,
      total_tokens: 12_400_000,
      total_requests: 6820,
      total_audio_seconds: 3600,
      total_characters: 0,
      total_cost: 38.42,
      total_cost_micro: 38_420_000,
    },
    daily: days.map((date, i) => ({
      date,
      tokens: 200_000 + Math.floor(Math.sin(i) * 80_000 + Math.random() * 120_000),
      requests: 100 + Math.floor(Math.random() * 200),
      cost: parseFloat((0.8 + Math.random() * 1.2).toFixed(4)),
      cost_micro: Math.floor((0.8 + Math.random() * 1.2) * 1_000_000),
    })),
    top_tenants: [
      { tenant_id: "t1", tenant_name: "Acme Corp", plan: "enterprise", tokens: 5_200_000, requests: 3200, cost: 16.4, cost_micro: 16_400_000 },
      { tenant_id: "t2", tenant_name: "Beta SRL", plan: "business", tokens: 3_800_000, requests: 2100, cost: 11.2, cost_micro: 11_200_000 },
      { tenant_id: "t3", tenant_name: "Gamma SpA", plan: "business", tokens: 2_100_000, requests: 980, cost: 7.1, cost_micro: 7_100_000 },
      { tenant_id: "t4", tenant_name: "Delta Inc", plan: "starter", tokens: 1_300_000, requests: 540, cost: 3.72, cost_micro: 3_720_000 },
    ],
  },

  "/admin/tenants": {
    tenants: [
      { id: "t1", name: "Acme Corp", plan: "enterprise", is_active: true, created_at: "2025-01-10T10:00:00Z", monthly_tokens: 5_200_000, monthly_cost: 16.4 },
      { id: "t2", name: "Beta SRL", plan: "business", is_active: true, created_at: "2025-02-14T09:00:00Z", monthly_tokens: 3_800_000, monthly_cost: 11.2 },
      { id: "t3", name: "Gamma SpA", plan: "business", is_active: true, created_at: "2025-03-01T08:00:00Z", monthly_tokens: 2_100_000, monthly_cost: 7.1 },
      { id: "t4", name: "Delta Inc", plan: "starter", is_active: false, created_at: "2025-03-20T11:00:00Z", monthly_tokens: 1_300_000, monthly_cost: 3.72 },
    ],
    total: 4,
  },

  "/admin/tenants/t1": {
    tenant: { id: "t1", name: "Acme Corp", plan: "enterprise", is_active: true, created_at: "2025-01-10T10:00:00Z" },
    monthly_tokens: 5_200_000,
    monthly_cost: 16.4,
    monthly_requests: 3200,
    quota: { llm_tokens: 0, stt_seconds: 0, tts_chars: 0 },
    daily_tokens: days.map((date, i) => ({ date, total_tokens: 100_000 + Math.floor(Math.random() * 80_000) })),
    model_breakdown: [
      { model_id: "qwen2.5-72b", total_tokens: 3_200_000 },
      { model_id: "qwen2.5-32b", total_tokens: 1_400_000 },
      { model_id: "whisper-large-v3-turbo", total_tokens: 600_000 },
    ],
    models: [{ model_id: "qwen2.5-72b" }, { model_id: "qwen2.5-32b" }, { model_id: "whisper-large-v3-turbo" }],
  },

  "/admin/usage/billing": {
    period: days[days.length - 1].slice(0, 7),
    currency: "EUR",
    rows: [
      { tenant_id: "t1", tenant_name: "Acme Corp", plan: "enterprise", currency: "EUR", llm_cost: 12.4, reasoning_cost: 2.1, coding_cost: 1.8, vision_cost: 0, stt_cost: 1.6, tts_cost: 0.8, embedding_cost: 0.03, total_cost: 18.73, total_cost_micro: 18_730_000, total_tokens: 5_200_000 },
      { tenant_id: "t2", tenant_name: "Beta SRL", plan: "business", currency: "EUR", llm_cost: 7.2, reasoning_cost: 0, coding_cost: 1.4, vision_cost: 0.6, stt_cost: 0.9, tts_cost: 1.2, embedding_cost: 0.02, total_cost: 11.32, total_cost_micro: 11_320_000, total_tokens: 3_800_000 },
      { tenant_id: "t3", tenant_name: "Gamma SpA", plan: "business", currency: "EUR", llm_cost: 4.8, reasoning_cost: 0, coding_cost: 0.8, vision_cost: 0, stt_cost: 0.6, tts_cost: 0.5, embedding_cost: 0.01, total_cost: 6.71, total_cost_micro: 6_710_000, total_tokens: 2_100_000 },
      { tenant_id: "t4", tenant_name: "Delta Inc", plan: "starter", currency: "EUR", llm_cost: 1.8, reasoning_cost: 0, coding_cost: 0.5, vision_cost: 0, stt_cost: 0.2, tts_cost: 0, embedding_cost: 0.01, total_cost: 2.51, total_cost_micro: 2_510_000, total_tokens: 1_300_000 },
    ],
  },

  "/admin/models": {
    models: [
      { id: "qwen2.5-72b", name: "Qwen 2.5 72B", category: "llm", tier: "large", min_plan: "business", vram_gb: 48, is_active: true, capabilities: { tool_calling: true, streaming: true, vision: false, batch_input: false } },
      { id: "qwen2.5-32b", name: "Qwen 2.5 32B", category: "llm", tier: "medium", min_plan: "starter", vram_gb: 20, is_active: true, capabilities: { tool_calling: true, streaming: true, vision: false, batch_input: false } },
      { id: "qwq-32b", name: "QwQ 32B", category: "reasoning", tier: "medium", min_plan: "business", vram_gb: 20, is_active: true, capabilities: { tool_calling: false, streaming: true, vision: false, batch_input: false } },
      { id: "qwen2.5-coder-32b", name: "Qwen 2.5 Coder 32B", category: "coding", tier: "medium", min_plan: "starter", vram_gb: 20, is_active: true, capabilities: { tool_calling: true, streaming: true, vision: false, batch_input: false } },
      { id: "qwen2.5-vl-72b", name: "Qwen 2.5 VL 72B", category: "vision", tier: "large", min_plan: "enterprise", vram_gb: 48, is_active: true, capabilities: { tool_calling: false, streaming: true, vision: true, batch_input: false } },
      { id: "whisper-large-v3-turbo", name: "Whisper Large v3 Turbo", category: "stt", tier: "medium", min_plan: "starter", vram_gb: 6, is_active: true, capabilities: { tool_calling: false, streaming: false, vision: false, batch_input: false } },
      { id: "xtts-v2", name: "XTTS v2", category: "tts", tier: "medium", min_plan: "business", vram_gb: 4, is_active: true, capabilities: { tool_calling: false, streaming: false, vision: false, batch_input: false } },
      { id: "kokoro-v1", name: "Kokoro v1", category: "tts", tier: "small", min_plan: "starter", vram_gb: 2, is_active: true, capabilities: { tool_calling: false, streaming: false, vision: false, batch_input: false } },
      { id: "bge-m3", name: "BGE M3", category: "embedding", tier: "medium", min_plan: "starter", vram_gb: 2, is_active: true, capabilities: { tool_calling: false, streaming: false, vision: false, batch_input: true } },
    ],
  },

  "/admin/models/pricing": {
    pricing: [
      { model_id: "qwen2.5-72b",            model_name: "Qwen 2.5 72B",              category: "llm",       currency: "EUR", input_cost_per_1k_micro: 500,   output_cost_per_1k_micro: 1500,  input_cost_per_1k: 0.0005,   output_cost_per_1k: 0.0015,   input_cost_per_token: 0.0000005,   output_cost_per_token: 0.0000015 },
      { model_id: "qwen2.5-32b",            model_name: "Qwen 2.5 32B",              category: "llm",       currency: "EUR", input_cost_per_1k_micro: 200,   output_cost_per_1k_micro: 600,   input_cost_per_1k: 0.0002,   output_cost_per_1k: 0.0006,   input_cost_per_token: 0.0000002,   output_cost_per_token: 0.0000006 },
      { model_id: "qwq-32b",                model_name: "QwQ 32B",                   category: "reasoning", currency: "EUR", input_cost_per_1k_micro: 800,   output_cost_per_1k_micro: 2400,  input_cost_per_1k: 0.0008,   output_cost_per_1k: 0.0024,   input_cost_per_token: 0.0000008,   output_cost_per_token: 0.0000024 },
      { model_id: "qwen2.5-coder-32b",      model_name: "Qwen 2.5 Coder 32B",       category: "coding",    currency: "EUR", input_cost_per_1k_micro: 300,   output_cost_per_1k_micro: 900,   input_cost_per_1k: 0.0003,   output_cost_per_1k: 0.0009,   input_cost_per_token: 0.0000003,   output_cost_per_token: 0.0000009 },
      { model_id: "qwen2.5-vl-72b",         model_name: "Qwen 2.5 VL 72B",          category: "vision",    currency: "EUR", input_cost_per_1k_micro: 700,   output_cost_per_1k_micro: 2100,  input_cost_per_1k: 0.0007,   output_cost_per_1k: 0.0021,   input_cost_per_token: 0.0000007,   output_cost_per_token: 0.0000021 },
      { model_id: "whisper-large-v3-turbo", model_name: "Whisper Large v3 Turbo",   category: "stt",       currency: "EUR", input_cost_per_1k_micro: 6000,  output_cost_per_1k_micro: 0,     input_cost_per_1k: 0.006,    output_cost_per_1k: 0,        input_cost_per_token: 0.000006,    output_cost_per_token: 0 },
      { model_id: "xtts-v2",                model_name: "XTTS v2",                   category: "tts",       currency: "EUR", input_cost_per_1k_micro: 15000, output_cost_per_1k_micro: 0,     input_cost_per_1k: 0.015,    output_cost_per_1k: 0,        input_cost_per_token: 0.000015,    output_cost_per_token: 0 },
      { model_id: "kokoro-v1",              model_name: "Kokoro v1",                 category: "tts",       currency: "EUR", input_cost_per_1k_micro: 8000,  output_cost_per_1k_micro: 0,     input_cost_per_1k: 0.008,    output_cost_per_1k: 0,        input_cost_per_token: 0.000008,    output_cost_per_token: 0 },
      { model_id: "bge-m3",                 model_name: "BGE M3",                    category: "embedding", currency: "EUR", input_cost_per_1k_micro: 50,    output_cost_per_1k_micro: 0,     input_cost_per_1k: 0.00005,  output_cost_per_1k: 0,        input_cost_per_token: 0.00000005,  output_cost_per_token: 0 },
    ],
  },

  "/admin/health": {
    status: "healthy",
    models_ready: true,
    gateway_version: "1.0.0",
    uptime_seconds: 86400,
    services: [
      { name: "PostgreSQL", status: "healthy", latency_ms: 2 },
      { name: "Redis", status: "healthy", latency_ms: 1 },
      { name: "vLLM LLM", status: "healthy", latency_ms: 45 },
      { name: "vLLM Coding", status: "healthy", latency_ms: 38 },
      { name: "vLLM Vision", status: "degraded", latency_ms: 210, message: "High GPU memory usage" },
      { name: "vLLM Embedding", status: "healthy", latency_ms: 12 },
      { name: "Whisper STT", status: "healthy", latency_ms: 0 },
      { name: "XTTS TTS", status: "loading", message: "Warming up model..." },
      { name: "Kokoro TTS", status: "healthy", latency_ms: 0 },
    ],
  },
};

MOCK["/admin/models/t1"] = (MOCK["/admin/models"] as { models: unknown[] }).models[0];

const _pricingHistoryEntry = (daysAgo: number, inputMicro: number, outputMicro: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return {
    input_cost_per_1k_micro: inputMicro,
    output_cost_per_1k_micro: outputMicro,
    input_cost_per_1k: inputMicro / 1_000_000,
    output_cost_per_1k: outputMicro / 1_000_000,
    currency: "EUR",
    changed_by: "admin@demo.local",
    effective_from: d.toISOString(),
  };
};

const _mockPricingHistory = {
  history: [
    _pricingHistoryEntry(60, 400, 1200),
    _pricingHistoryEntry(30, 450, 1350),
    _pricingHistoryEntry(7, 480, 1440),
  ],
};

const _sessionEntry = (
  id: string,
  modelId: string,
  backendUrl: string,
  gpuIds: string[],
  status: string,
  daysAgo: number
) => {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return {
    id,
    model_id: modelId,
    backend_url: backendUrl,
    gpu_ids: gpuIds,
    status,
    tensor_parallel_size: gpuIds.length || 1,
    max_model_len: null,
    started_at: status === "running" ? d.toISOString() : null,
    stopped_at: status === "stopped" ? d.toISOString() : null,
    started_by: "admin@demo.local",
    extra_config: {},
    created_at: d.toISOString(),
    updated_at: d.toISOString(),
  };
};

const _mockSessions = {
  sessions: [
    _sessionEntry("s1", "qwen2.5-72b", "http://gpu0:8001", ["0"], "running", 5),
    _sessionEntry("s2", "qwen2.5-72b", "http://gpu1:8001", ["1"], "running", 3),
    _sessionEntry("s3", "qwen2.5-32b", "http://gpu2:8001", ["2"], "running", 7),
    _sessionEntry("s4", "whisper-large-v3-turbo", "http://stt-service:8010", ["3"], "running", 2),
    _sessionEntry("s5", "xtts-v2", "http://tts-service:8020", ["3"], "running", 2),
    _sessionEntry("s6", "deepseek-r1-70b", "http://gpu4:8001", ["4", "5"], "stopped", 10),
    _sessionEntry("s7", "bge-m3", "http://gpu6:8001", ["6"], "running", 1),
  ],
};

const _mockModelSearch = {
  source: "huggingface",
  query: "llama",
  category: "llm",
  total: 5,
  models: [
    {
      id: "meta-llama--llama-3.3-70b-instruct",
      name: "Llama-3.3-70B-Instruct",
      hf_repo: "meta-llama/Llama-3.3-70B-Instruct",
      category: "llm",
      estimated_vram_gb: 42,
      downloads: 1_200_000,
      likes: 3400,
      tags: ["text-generation", "llama", "meta", "70b"],
      pipeline_tag: "text-generation",
      compatible: true,
      gated: true,
      private: false,
      author: "meta-llama",
      last_modified: "2024-12-01T10:00:00Z",
    },
    {
      id: "meta-llama--llama-3.1-8b-instruct",
      name: "Llama-3.1-8B-Instruct",
      hf_repo: "meta-llama/Llama-3.1-8B-Instruct",
      category: "llm",
      estimated_vram_gb: 8,
      downloads: 2_800_000,
      likes: 5200,
      tags: ["text-generation", "llama", "meta", "8b"],
      pipeline_tag: "text-generation",
      compatible: true,
      gated: true,
      private: false,
      author: "meta-llama",
      last_modified: "2024-10-15T10:00:00Z",
    },
    {
      id: "unsloth--llama-3.2-3b-instruct",
      name: "Llama-3.2-3B-Instruct",
      hf_repo: "unsloth/Llama-3.2-3B-Instruct",
      category: "llm",
      estimated_vram_gb: 3,
      downloads: 950_000,
      likes: 1800,
      tags: ["text-generation", "llama", "3b", "edge"],
      pipeline_tag: "text-generation",
      compatible: true,
      gated: false,
      private: false,
      author: "unsloth",
      last_modified: "2024-11-10T10:00:00Z",
    },
  ],
};

MOCK["/admin/sessions"] = _mockSessions;

// ─── Pod Definitions mock ─────────────────────────────────────────────────────
const _mockPods = {
  pods: [
    {
      id: "pod-1", name: "LLM Primary (72B)", model_id: "qwen2.5-72b", worker_type: "vllm",
      docker_image: "ghcr.io/org/vllm-qwen:latest", gpu_type: "A100_SXM4_80GB",
      gpu_count: 1, vram_gb: 80, container_disk_gb: 20, region: "EU",
      session_type: "persistent", idle_timeout_minutes: 30, schedule_cron: null,
      prewarm_minutes: 15, priority: 10, network_volume_id: "vol-abc123",
      runpod_pod_id: "rp-abc123", pod_status: "running",
      backend_url: "https://rp-abc123-8000.proxy.runpod.net",
      last_request_at: new Date(Date.now() - 120000).toISOString(),
      started_at: new Date(Date.now() - 86400000).toISOString(),
      started_by: "admin@demo.local", extra_config: {},
      created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
      updated_at: new Date(Date.now() - 120000).toISOString(),
    },
    {
      id: "pod-2", name: "STT Primary (Whisper)", model_id: "whisper-large-v3-turbo", worker_type: "stt_worker",
      docker_image: "ghcr.io/org/stt-whisper:latest", gpu_type: "RTX4090",
      gpu_count: 1, vram_gb: 24, container_disk_gb: 15, region: "EU",
      session_type: "idle", idle_timeout_minutes: 20, schedule_cron: null,
      prewarm_minutes: 10, priority: 10, network_volume_id: "vol-def456",
      runpod_pod_id: "rp-def456", pod_status: "running",
      backend_url: "https://rp-def456-8010.proxy.runpod.net",
      last_request_at: new Date(Date.now() - 900000).toISOString(),
      started_at: new Date(Date.now() - 3600000).toISOString(),
      started_by: "admin@demo.local", extra_config: {},
      created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      updated_at: new Date(Date.now() - 900000).toISOString(),
    },
    {
      id: "pod-3", name: "TTS Primary (XTTS)", model_id: "xtts-v2", worker_type: "tts_worker",
      docker_image: "ghcr.io/org/tts-xtts:latest", gpu_type: "RTX4090",
      gpu_count: 1, vram_gb: 24, container_disk_gb: 15, region: "EU",
      session_type: "idle", idle_timeout_minutes: 20, schedule_cron: null,
      prewarm_minutes: 10, priority: 10, network_volume_id: "vol-ghi789",
      runpod_pod_id: "rp-ghi789", pod_status: "stopped",
      backend_url: null,
      last_request_at: new Date(Date.now() - 7200000).toISOString(),
      started_at: null, started_by: null, extra_config: {},
      created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      updated_at: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: "pod-4", name: "LLM Scheduled (Business Hours)", model_id: "qwen2.5-32b", worker_type: "vllm",
      docker_image: "ghcr.io/org/vllm-qwen32:latest", gpu_type: "A100_SXM4_40GB",
      gpu_count: 1, vram_gb: 40, container_disk_gb: 20, region: "EU",
      session_type: "scheduled", idle_timeout_minutes: 30, schedule_cron: "0 8 * * 1-5",
      schedule_stop_cron: "0 20 * * 1-5", prewarm_minutes: 15, priority: 20,
      network_volume_id: "vol-jkl012", runpod_pod_id: "rp-jkl012", pod_status: "stopped",
      backend_url: null, last_request_at: null, started_at: null, started_by: null, extra_config: {},
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
  ],
};

// ─── Platform Settings mock ───────────────────────────────────────────────────
const _mockSettings = {
  settings: [
    { key: "s3.access_key_id", category: "s3", description: "AWS Access Key ID", updated_by: "admin@demo.local", updated_at: new Date().toISOString() },
    { key: "s3.secret_access_key", category: "s3", description: "AWS Secret Access Key", updated_by: "admin@demo.local", updated_at: new Date().toISOString() },
    { key: "s3.region", category: "s3", description: "AWS Region", updated_by: "admin@demo.local", updated_at: new Date().toISOString() },
    { key: "s3.bucket_name", category: "s3", description: "S3 Bucket Name", updated_by: "admin@demo.local", updated_at: new Date().toISOString() },
    { key: "runpod.api_key", category: "runpod", description: "RunPod API Key", updated_by: "admin@demo.local", updated_at: new Date().toISOString() },
  ],
};

const _mockPiiToggles = {
  toggles: { CF: true, PIVA: true, IBAN: true, CC: true, EMAIL: true, PHONE: true, ADDRESS: true, PERSON: true },
};

// ─── Conversations mock ───────────────────────────────────────────────────────
const _mockConversations = {
  conversations: [
    {
      id: "conv-1", tenant_id: "t1", tenant_name: "Acme Corp", warm_state: "active",
      last_activity: new Date(Date.now() - 60000).toISOString(),
      created_at: new Date(Date.now() - 1800000).toISOString(),
      workers: [
        { model_class: "llm", model_id: "qwen2.5-72b", pod_name: "LLM Primary (72B)", pod_status: "running" },
        { model_class: "stt", model_id: "whisper-large-v3-turbo", pod_name: "STT Primary (Whisper)", pod_status: "running" },
        { model_class: "tts", model_id: "xtts-v2", pod_name: "TTS Primary (XTTS)", pod_status: "running" },
      ],
    },
    {
      id: "conv-2", tenant_id: "t2", tenant_name: "Beta SRL", warm_state: "idle",
      last_activity: new Date(Date.now() - 1200000).toISOString(),
      created_at: new Date(Date.now() - 3600000).toISOString(),
      workers: [
        { model_class: "llm", model_id: "qwen2.5-32b", pod_name: "LLM Scheduled (Business Hours)", pod_status: "stopped" },
        { model_class: "stt", model_id: "whisper-large-v3-turbo", pod_name: "STT Primary (Whisper)", pod_status: "running" },
      ],
    },
  ],
  total: 2,
};

MOCK["/admin/docs/api"] = `# Custom AI Gateway — API Reference

## Base URL
\`http://your-server:8000\`

## Authentication
- **Tenant API key**: \`Authorization: Bearer <api_key>\`
- **Admin JWT**: \`Authorization: Bearer <jwt_token>\`

## OpenAI-Compatible Endpoints

### POST /v1/chat/completions
Chat completions (streaming supported via \`stream: true\`).

### POST /v1/embeddings
Text embeddings (batch up to 100 inputs).

### POST /v1/audio/transcriptions
Speech-to-text (WAV, MP3, M4A).

### POST /v1/audio/speech
Text-to-speech. Body: \`{ model, input, voice }\`

### GET /v1/models
List available models with capabilities.

### GET /v1/usage
Token usage for the authenticated tenant.

## Admin Endpoints (require admin JWT)

### GET /admin/models/pricing
Returns pricing for all models in micro-EUR per 1K units.

### PATCH /admin/models/:id/pricing
Update pricing: \`{ input_cost_per_1k_micro, output_cost_per_1k_micro }\`

### GET /admin/tenants
List all tenants.

### GET /admin/usage/billing?period=YYYY-MM
Monthly billing report per tenant.

### GET /admin/health
Service health status.

> Note: This is mock documentation. Start the gateway to load the full API reference.
`;

MOCK["/admin/pods"]          = _mockPods;
MOCK["/admin/settings"]      = _mockSettings;
MOCK["/admin/settings/pii/toggles"] = _mockPiiToggles;
MOCK["/admin/conversations"] = _mockConversations;
MOCK["/admin/gpu-types"] = {
  gpu_types: [
    { id: "NVIDIA_A100_SXM4_80GB", displayName: "A100 SXM4 80GB", memoryInGb: 80, securePrice: 1.89, communityPrice: 1.49 },
    { id: "NVIDIA_A100_SXM4_40GB", displayName: "A100 SXM4 40GB", memoryInGb: 40, securePrice: 1.29, communityPrice: 0.99 },
    { id: "NVIDIA_RTX4090", displayName: "RTX 4090", memoryInGb: 24, securePrice: 0.74, communityPrice: 0.44 },
    { id: "NVIDIA_RTX3090", displayName: "RTX 3090", memoryInGb: 24, securePrice: 0.44, communityPrice: 0.22 },
    { id: "NVIDIA_H100_SXM5_80GB", displayName: "H100 SXM5 80GB", memoryInGb: 80, securePrice: 2.99, communityPrice: 2.49 },
  ],
};

export function getMockForUrl(url: string): unknown | null {
  // Strip query params
  const path = url.split("?")[0];
  // Exact match
  if (MOCK[path] !== undefined) return MOCK[path];
  // Tenant detail: /admin/tenants/:id
  if (/^\/admin\/tenants\/[^/]+$/.test(path)) return MOCK["/admin/tenants/t1"];
  // Pricing history: /admin/models/:id/pricing/history
  if (/^\/admin\/models\/[^/]+\/pricing\/history$/.test(path)) {
    return { ...(_mockPricingHistory), model_id: path.split("/")[3] };
  }
  // Sessions for model: /admin/models/:id/sessions
  if (/^\/admin\/models\/[^/]+\/sessions$/.test(path)) {
    const modelId = path.split("/")[3];
    const sessions = (_mockSessions.sessions as { model_id: string }[]).filter(
      (s) => s.model_id === modelId
    );
    return { model_id: modelId, sessions };
  }
  // Pod detail: /admin/pods/:id
  if (/^\/admin\/pods\/[^/]+$/.test(path) && !path.includes("/metrics")) {
    const pods = (_mockPods.pods as { id: string }[]);
    const id = path.split("/").pop();
    return pods.find((p) => p.id === id) ?? pods[0];
  }
  // Pod metrics: /admin/pods/:id/metrics
  if (/^\/admin\/pods\/[^/]+\/metrics$/.test(path)) {
    return { gpu_util_percent: 72, vram_util_percent: 68, cpu_percent: 12, memory_percent: 35, vllm_queue_depth: 2 };
  }
  // Settings detail: /admin/settings/:key
  if (/^\/admin\/settings\/.+$/.test(path) && !path.includes("/test") && !path.includes("/toggles") && !path.includes("/toggle")) {
    return { key: path.split("/admin/settings/")[1], category: "general", value: "***", description: null };
  }
  // Conversation detail: /admin/conversations/:id
  if (/^\/admin\/conversations\/[^/]+$/.test(path)) {
    return (_mockConversations.conversations as { id: string }[])[0];
  }
  // API docs
  if (path === "/admin/docs/api") return MOCK["/admin/docs/api"];
  // Model search: /admin/models/search (has query params)
  if (path === "/admin/models/search") return _mockModelSearch;
  // Model detail: /admin/models/:id (not /pricing, /reload, /enable, /health, /search, /sessions)
  if (/^\/admin\/models\/[^/]+$/.test(path)) {
    const models = (MOCK["/admin/models"] as { models: unknown[] }).models;
    const id = path.split("/").pop();
    return { model: models.find((m: unknown) => (m as { id: string }).id === id) ?? models[0] };
  }
  return null;
}
