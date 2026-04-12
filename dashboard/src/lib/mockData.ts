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
