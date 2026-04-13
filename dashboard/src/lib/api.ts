import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// ─── Request interceptor: attach JWT ─────────────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── DEV mock interceptor ────────────────────────────────────────────────────
import { getMockForUrl } from "./mockData";

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (import.meta.env.DEV) {
      const url: string = error.config?.url ?? "";
      const mock = getMockForUrl(url);
      if (mock !== null) {
        return Promise.resolve({ data: mock, status: 200, statusText: "OK (mock)", headers: {}, config: error.config });
      }
    }
    return Promise.reject(error);
  }
);

// ─── Response interceptor: auto-refresh on 401 ───────────────────────────────
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) throw new Error("No refresh token");

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        useAuthStore.getState().setTokens(data.access_token, data.refresh_token);
        pendingQueue.forEach(({ resolve }) => resolve(undefined));
        pendingQueue = [];

        return api(originalRequest);
      } catch {
        pendingQueue.forEach(({ reject }) => reject(error));
        pendingQueue = [];
        useAuthStore.getState().logout();
        window.location.href = "/login";
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ─── Typed API helpers ────────────────────────────────────────────────────────
export const adminApi = {
  // Tenants
  listTenants: (params?: { limit?: number; offset?: number }) =>
    api.get("/admin/tenants", { params }),
  getTenant: (id: string) => api.get(`/admin/tenants/${id}`),
  createTenant: (data: { name: string; plan: string; metadata?: object }) =>
    api.post("/admin/tenants", data),
  updateTenant: (id: string, data: object) => api.patch(`/admin/tenants/${id}`, data),
  deleteTenant: (id: string) => api.delete(`/admin/tenants/${id}`),
  regenerateApiKey: (id: string) => api.post(`/admin/tenants/${id}/api-key`),
  setQuota: (id: string, data: object) => api.patch(`/admin/tenants/${id}/quota`, data),

  // Usage & Billing
  usageOverview: () => api.get("/admin/usage/overview"),
  billingReport: (period?: string) =>
    api.get("/admin/usage/billing", { params: period ? { period } : {} }),
  listPricing: () => api.get("/admin/models/pricing"),
  updatePricing: (modelId: string, data: object) =>
    api.patch(`/admin/models/${modelId}/pricing`, data),
  getPricingHistory: (modelId: string) =>
    api.get(`/admin/models/${modelId}/pricing/history`),

  // Health
  health: () => api.get("/admin/health"),

  // Models
  listModels: () => api.get("/admin/models"),
  reloadModels: () => api.post("/admin/models/reload"),
  getModel: (id: string) => api.get(`/admin/models/${id}`),
  createModel: (data: object) => api.post("/admin/models", data),
  updateModel: (id: string, data: object) => api.patch(`/admin/models/${id}`, data),
  deprecateModel: (id: string) => api.patch(`/admin/models/${id}`, { is_active: false, deprecated: true }),
  restoreModel: (id: string) => api.patch(`/admin/models/${id}`, { is_active: true, deprecated: false }),

  // Sessions
  listSessions: () => api.get("/admin/sessions"),
  listModelSessions: (modelId: string) => api.get(`/admin/models/${modelId}/sessions`),
  startSession: (modelId: string, data: {
    backend_url: string;
    gpu_ids?: string[];
    tensor_parallel_size?: number;
    max_model_len?: number;
    extra_config?: object;
  }) => api.post(`/admin/models/${modelId}/sessions/start`, data),
  stopSession: (sessionId: string) => api.post(`/admin/sessions/${sessionId}/stop`),
  deleteSession: (sessionId: string) => api.delete(`/admin/sessions/${sessionId}`),
  patchSession: (sessionId: string, data: { status: string }) =>
    api.patch(`/admin/sessions/${sessionId}`, data),

  // Model Search
  searchModels: (params: {
    q: string;
    category?: string;
    source?: string;
    max_results?: number;
    compatible_only?: boolean;
  }) => api.get("/admin/models/search", { params }),

  // Pod Definitions
  listPods: (params?: { model_id?: string; worker_type?: string }) =>
    api.get("/admin/pods", { params }),
  getPod: (id: string) => api.get(`/admin/pods/${id}`),
  createPod: (data: object) => api.post("/admin/pods", data),
  updatePod: (id: string, data: object) => api.patch(`/admin/pods/${id}`, data),
  deletePod: (id: string) => api.delete(`/admin/pods/${id}`),
  startPod: (id: string) => api.post(`/admin/pods/${id}/start`),
  stopPod: (id: string) => api.post(`/admin/pods/${id}/stop`),
  terminatePod: (id: string) => api.post(`/admin/pods/${id}/terminate`),
  createPodOnRunpod: (id: string) => api.post(`/admin/pods/${id}/create-on-runpod`),
  getPodMetrics: (id: string) => api.get(`/admin/pods/${id}/metrics`),
  listGpuTypes: () => api.get("/admin/gpu-types"),

  // Platform Settings
  listSettings: () => api.get("/admin/settings"),
  getSetting: (key: string) => api.get(`/admin/settings/${key}`),
  upsertSetting: (key: string, data: { value: string; category: string; description?: string }) =>
    api.put(`/admin/settings/${key}`, data),
  upsertSettingsBulk: (data: { settings: Record<string, string>; category: string }) =>
    api.put("/admin/settings-bulk", data),
  deleteSetting: (key: string) => api.delete(`/admin/settings/${key}`),
  testS3: () => api.post("/admin/settings/s3/test"),
  testRunpod: () => api.post("/admin/settings/runpod/test"),
  getPiiToggles: () => api.get("/admin/settings/pii/toggles"),
  togglePii: (entity_type: string, enabled: boolean) =>
    api.post("/admin/settings/pii/toggle", { entity_type, enabled }),

  // Docs
  getApiDocs: () => api.get("/admin/docs/api", { headers: { Accept: "text/plain" }, responseType: "text" }),

  // Conversations
  listConversations: (params?: { tenant_id?: string; warm_state?: string }) =>
    api.get("/admin/conversations", { params }),
  getConversation: (id: string) => api.get(`/admin/conversations/${id}`),
  releaseConversation: (id: string) => api.delete(`/admin/conversations/${id}/workers`),
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  logout: (refreshToken: string) =>
    api.post("/auth/logout", { refresh_token: refreshToken }),
  me: () => api.get("/auth/me"),
};
