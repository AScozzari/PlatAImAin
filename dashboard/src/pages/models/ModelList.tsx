import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  RefreshCw, DollarSign, Plus, Archive, RotateCcw,
  ChevronDown, ChevronUp, Play, Square, Search, X,
} from "lucide-react";

type Capabilities = {
  tool_calling?: boolean;
  streaming?: boolean;
  vision?: boolean;
  batch_input?: boolean;
};

type Model = {
  id: string;
  name: string;
  category: string;
  tier: string;
  min_plan: string;
  vram_gb?: number;
  is_active: boolean;
  deprecated?: boolean;
  capabilities?: Capabilities;
};

type Session = {
  id: string;
  model_id: string;
  backend_url: string;
  gpu_ids: string[];
  status: "running" | "stopped" | "loading" | "error";
  tensor_parallel_size: number;
  started_at: string | null;
};

const CATEGORY_COLORS: Record<string, string> = {
  llm: "bg-blue-100 text-blue-700",
  reasoning: "bg-purple-100 text-purple-700",
  coding: "bg-cyan-100 text-cyan-700",
  vision: "bg-green-100 text-green-700",
  stt: "bg-amber-100 text-amber-700",
  tts: "bg-orange-100 text-orange-700",
  embedding: "bg-gray-100 text-gray-700",
};

const CATEGORIES = ["llm", "reasoning", "coding", "vision", "stt", "tts", "embedding"];

const EMPTY_FORM = {
  id: "", name: "", category: "llm", tier: "medium", min_plan: "starter",
  vram_gb: "", hf_repo: "",
  tool_calling: false, streaming: true, vision: false, batch_input: false,
};

const EMPTY_SESSION_FORM = {
  backend_url: "",
  gpu_ids: "",
  tensor_parallel_size: 1,
  max_model_len: "",
};

// ─── Session badge ────────────────────────────────────────────────────────────

function SessionBadge({ sessions }: { sessions: Session[] }) {
  const running = sessions.filter((s) => s.status === "running");
  const loading = sessions.filter((s) => s.status === "loading");

  if (running.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
        {running.length > 1 ? `×${running.length}` : "online"}
      </span>
    );
  }
  if (loading.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-600">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block animate-pulse" />
        loading
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full border border-gray-300 inline-block" />
      offline
    </span>
  );
}

// ─── Start Session Modal ──────────────────────────────────────────────────────

function StartSessionModal({
  modelId,
  onClose,
}: {
  modelId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_SESSION_FORM);
  const [error, setError] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: () =>
      adminApi.startSession(modelId, {
        backend_url: form.backend_url,
        gpu_ids: form.gpu_ids ? form.gpu_ids.split(",").map((s) => s.trim()) : [],
        tensor_parallel_size: form.tensor_parallel_size,
        max_model_len: form.max_model_len ? Number(form.max_model_len) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      onClose();
    },
    onError: (e: unknown) => {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Errore avvio sessione");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800">Avvia Sessione — {modelId}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Backend URL *</label>
            <input
              value={form.backend_url}
              onChange={(e) => setForm({ ...form, backend_url: e.target.value })}
              className="w-full px-3 py-1.5 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="http://gpu0:8001"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">GPU IDs (comma-separated)</label>
            <input
              value={form.gpu_ids}
              onChange={(e) => setForm({ ...form, gpu_ids: e.target.value })}
              className="w-full px-3 py-1.5 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0 or 0,1 for tensor parallel"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tensor Parallel Size</label>
              <input
                type="number"
                min={1}
                value={form.tensor_parallel_size}
                onChange={(e) => setForm({ ...form, tensor_parallel_size: Number(e.target.value) })}
                className="w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max Model Len</label>
              <input
                type="number"
                value={form.max_model_len}
                onChange={(e) => setForm({ ...form, max_model_len: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="opzionale"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={() => startMutation.mutate()}
            disabled={!form.backend_url || startMutation.isPending}
            className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {startMutation.isPending ? "Avvio…" : "Avvia"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ModelList() {
  const qc = useQueryClient();
  const [showDeprecated, setShowDeprecated] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [startSessionFor, setStartSessionFor] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["models"],
    queryFn: () => adminApi.listModels().then((r) => r.data),
  });

  const { data: sessionsData } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => adminApi.listSessions().then((r) => r.data),
    refetchInterval: 15_000,
  });

  const reloadMutation = useMutation({
    mutationFn: () => adminApi.reloadModels(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });

  const deprecateMutation = useMutation({
    mutationFn: (id: string) => adminApi.deprecateModel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => adminApi.restoreModel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });

  const createMutation = useMutation({
    mutationFn: (d: object) => adminApi.createModel(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["models"] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: (e: unknown) => {
      setFormError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Errore creazione modello");
    },
  });

  const stopSessionMutation = useMutation({
    mutationFn: (sessionId: string) => adminApi.stopSession(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const allSessions: Session[] = sessionsData?.sessions ?? [];
  const sessionsByModel = (modelId: string) =>
    allSessions.filter((s) => s.model_id === modelId);

  const allModels: Model[] = data?.models ?? [];
  const active = allModels.filter((m) => !m.deprecated && m.is_active);
  const deprecated = allModels.filter((m) => m.deprecated || !m.is_active);

  const handleCreate = () => {
    setFormError(null);
    createMutation.mutate({
      id: form.id,
      name: form.name,
      category: form.category,
      tier: form.tier,
      min_plan: form.min_plan,
      vram_gb: form.vram_gb ? Number(form.vram_gb) : null,
      hf_repo: form.hf_repo || null,
      capabilities: {
        tool_calling: form.tool_calling,
        streaming: form.streaming,
        vision: form.vision,
        batch_input: form.batch_input,
      },
    });
  };

  const ModelTable = ({ models, allowDeprecate }: { models: Model[]; allowDeprecate: boolean }) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-gray-50">
          <th className="text-left px-4 py-3 font-medium text-gray-600">Model ID</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Categoria</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Sessione</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Tier</th>
          <th className="text-right px-4 py-3 font-medium text-gray-600">VRAM</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Capabilities</th>
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {models.map((m) => {
          const sessions = sessionsByModel(m.id);
          const runningSessions = sessions.filter((s) => s.status === "running");
          return (
            <tr key={m.id} className={cn("border-b last:border-0 hover:bg-gray-50", !m.is_active && "opacity-60")}>
              <td className="px-4 py-3">
                <span className="font-mono text-xs text-gray-800">{m.id}</span>
                {m.name && m.name !== m.id && (
                  <p className="text-xs text-gray-400 mt-0.5">{m.name}</p>
                )}
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[m.category] ?? "bg-gray-100 text-gray-700"}`}>
                  {m.category}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <SessionBadge sessions={sessions} />
                  {/* Stop button for each running session */}
                  {runningSessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => stopSessionMutation.mutate(s.id)}
                      disabled={stopSessionMutation.isPending}
                      title={`Stop ${s.backend_url}`}
                      className="p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Square className="w-3 h-3" />
                    </button>
                  ))}
                  {/* Start new session button */}
                  <button
                    onClick={() => setStartSessionFor(m.id)}
                    title="Avvia nuova sessione"
                    className="p-0.5 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                  </button>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-600 text-xs">{m.tier}</td>
              <td className="px-4 py-3 text-right text-gray-600 text-xs">{m.vram_gb ? `${m.vram_gb}GB` : "—"}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  {m.capabilities?.tool_calling && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">tools</span>}
                  {m.capabilities?.streaming && <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-600 rounded">stream</span>}
                  {m.capabilities?.vision && <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">vision</span>}
                  {m.capabilities?.batch_input && <span className="text-xs px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded">batch</span>}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Link
                    to={`/models/${m.id}/pricing`}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 border rounded px-2 py-1 hover:bg-gray-50 transition-colors"
                  >
                    <DollarSign className="w-3 h-3" />
                    Pricing
                  </Link>
                  {allowDeprecate ? (
                    <button
                      onClick={() => confirm(`Deprecare "${m.id}"?`) && deprecateMutation.mutate(m.id)}
                      title="Depreca modello"
                      className="p-1.5 rounded text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => restoreMutation.mutate(m.id)}
                      title="Ripristina modello"
                      className="p-1.5 rounded text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
        {models.length === 0 && (
          <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-sm">Nessun modello.</td></tr>
        )}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-4">
      {/* Start Session Modal */}
      {startSessionFor && (
        <StartSessionModal
          modelId={startSessionFor}
          onClose={() => setStartSessionFor(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Models</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/models/search"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Search className="w-4 h-4" />
            Cerca Repository
          </Link>
          <button
            onClick={() => reloadMutation.mutate()}
            disabled={reloadMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", reloadMutation.isPending && "animate-spin")} />
            Reload Config
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setFormError(null); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Aggiungi Modello
          </button>
        </div>
      </div>

      {/* Add model form */}
      {showForm && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Nuovo Modello</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Model ID *</label>
              <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="es. llama-3.3-70b" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="es. LLaMA 3.3 70B" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Categoria</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tier</label>
              <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {["fast", "balanced", "powerful", "enterprise"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Min Plan</label>
              <select value={form.min_plan} onChange={(e) => setForm({ ...form, min_plan: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {["starter", "business", "enterprise"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">VRAM (GB)</label>
              <input type="number" value={form.vram_gb} onChange={(e) => setForm({ ...form, vram_gb: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="es. 20" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">HuggingFace Repo</label>
              <input value={form.hf_repo} onChange={(e) => setForm({ ...form, hf_repo: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="es. meta-llama/Llama-3.3-70B-Instruct" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-2">Capabilities</label>
              <div className="flex gap-4">
                {(["tool_calling", "streaming", "vision", "batch_input"] as const).map((cap) => (
                  <label key={cap} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={form[cap] as boolean}
                      onChange={(e) => setForm({ ...form, [cap]: e.target.checked })}
                      className="rounded" />
                    <span className="text-gray-700">{cap.replace("_", " ")}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          {formError && <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{formError}</p>}
          <div className="flex gap-3 mt-4">
            <button onClick={handleCreate} disabled={!form.id || !form.name || createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {createMutation.isPending ? "Salvataggio…" : "Crea Modello"}
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Active models */}
      <div className="bg-white rounded-xl border overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Caricamento…</div>
        ) : (
          <ModelTable models={active} allowDeprecate={true} />
        )}
      </div>

      {/* Deprecated models */}
      {deprecated.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <button
            onClick={() => setShowDeprecated(!showDeprecated)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Archive className="w-4 h-4" />
              Modelli deprecati / disattivati ({deprecated.length})
            </span>
            {showDeprecated ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showDeprecated && (
            <div className="border-t overflow-x-auto">
              <ModelTable models={deprecated} allowDeprecate={false} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
