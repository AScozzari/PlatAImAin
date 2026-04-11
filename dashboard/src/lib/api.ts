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
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  logout: (refreshToken: string) =>
    api.post("/auth/logout", { refresh_token: refreshToken }),
  me: () => api.get("/auth/me"),
};
