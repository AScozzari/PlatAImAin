// Mock data returned in DEV mode when the backend is not running

const today = new Date();
const days = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(today);
  d.setDate(d.getDate() - (29 - i));
  return d.toISOString().slice(0, 10);
});

export const MOCK: Record<string, unknown> = {
  "/admin/usage/overview": {
    active_tenants: 4,
    total_tokens_month: 12_400_000,
    total_cost_month: 38.42,
    requests_per_hour: 142,
    daily_tokens: days.map((date, i) => ({
      date,
      total_tokens: 200_000 + Math.floor(Math.sin(i) * 80_000 + Math.random() * 120_000),
    })),
    category_breakdown: [
      { category: "llm", total_tokens: 8_200_000, total_cost: 24.6 },
      { category: "coding", total_tokens: 1_800_000, total_cost: 5.4 },
      { category: "embedding", total_tokens: 1_200_000, total_cost: 0.06 },
      { category: "stt", total_tokens: 800_000, total_cost: 4.8 },
      { category: "tts", total_tokens: 400_000, total_cost: 3.56 },
    ],
    top_tenants: [
      { tenant_id: "t1", tenant_name: "Acme Corp", total_tokens: 5_200_000, total_cost: 16.4, total_requests: 3200 },
      { tenant_id: "t2", tenant_name: "Beta SRL", total_tokens: 3_800_000, total_cost: 11.2, total_requests: 2100 },
      { tenant_id: "t3", tenant_name: "Gamma SpA", total_tokens: 2_100_000, total_cost: 7.1, total_requests: 980 },
      { tenant_id: "t4", tenant_name: "Delta Inc", total_tokens: 1_300_000, total_cost: 3.72, total_requests: 540 },
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
    rows: [
      { tenant_id: "t1", tenant_name: "Acme Corp", plan: "enterprise", llm_cost: 12.4, reasoning_cost: 2.1, coding_cost: 1.8, vision_cost: 0, stt_cost: 1.6, tts_cost: 0.8, embedding_cost: 0.03, total_cost: 18.73, total_tokens: 5_200_000 },
      { tenant_id: "t2", tenant_name: "Beta SRL", plan: "business", llm_cost: 7.2, reasoning_cost: 0, coding_cost: 1.4, vision_cost: 0.6, stt_cost: 0.9, tts_cost: 1.2, embedding_cost: 0.02, total_cost: 11.32, total_tokens: 3_800_000 },
      { tenant_id: "t3", tenant_name: "Gamma SpA", plan: "business", llm_cost: 4.8, reasoning_cost: 0, coding_cost: 0.8, vision_cost: 0, stt_cost: 0.6, tts_cost: 0.5, embedding_cost: 0.01, total_cost: 6.71, total_tokens: 2_100_000 },
      { tenant_id: "t4", tenant_name: "Delta Inc", plan: "starter", llm_cost: 1.8, reasoning_cost: 0, coding_cost: 0.5, vision_cost: 0, stt_cost: 0.2, tts_cost: 0, embedding_cost: 0.01, total_cost: 2.51, total_tokens: 1_300_000 },
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
      { model_id: "qwen2.5-72b", input_cost_per_1k_micro: 500, output_cost_per_1k_micro: 1500 },
      { model_id: "qwen2.5-32b", input_cost_per_1k_micro: 200, output_cost_per_1k_micro: 600 },
      { model_id: "qwq-32b", input_cost_per_1k_micro: 800, output_cost_per_1k_micro: 2400 },
      { model_id: "qwen2.5-coder-32b", input_cost_per_1k_micro: 300, output_cost_per_1k_micro: 900 },
      { model_id: "qwen2.5-vl-72b", input_cost_per_1k_micro: 700, output_cost_per_1k_micro: 2100 },
      { model_id: "whisper-large-v3-turbo", input_cost_per_1k_micro: 6000, output_cost_per_1k_micro: 0 },
      { model_id: "xtts-v2", input_cost_per_1k_micro: 15000, output_cost_per_1k_micro: 0 },
      { model_id: "kokoro-v1", input_cost_per_1k_micro: 8000, output_cost_per_1k_micro: 0 },
      { model_id: "bge-m3", input_cost_per_1k_micro: 50, output_cost_per_1k_micro: 0 },
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

export function getMockForUrl(url: string): unknown | null {
  // Exact match
  if (MOCK[url]) return MOCK[url];
  // Tenant detail: /admin/tenants/:id
  if (/^\/admin\/tenants\/[^/]+$/.test(url)) return MOCK["/admin/tenants/t1"];
  return null;
}
