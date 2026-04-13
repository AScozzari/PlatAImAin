import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { Play, Square, Trash2, Plus, RefreshCw, Activity, Loader2, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Pod = {
  id: string;
  name: string;
  model_id: string;
  worker_type: string;
  docker_image: string;
  gpu_type: string | null;
  gpu_count: number;
  vram_gb: number;
  region: string;
  session_type: string;
  idle_timeout_minutes: number;
  schedule_cron: string | null;
  prewarm_minutes: number;
  priority: number;
  network_volume_id: string | null;
  runpod_pod_id: string | null;
  pod_status: string;
  backend_url: string | null;
  last_request_at: string | null;
  started_at: string | null;
  started_by: string | null;
  extra_config: object;
  created_at: string;
  updated_at: string;
};

const statusColors: Record<string, string> = {
  running:  "bg-green-100 text-green-800",
  stopped:  "bg-gray-100 text-gray-600",
  starting: "bg-blue-100 text-blue-800",
  error:    "bg-red-100 text-red-800",
  scaling:  "bg-purple-100 text-purple-800",
};

const sessionTypeIcon: Record<string, string> = {
  persistent: "🔄",
  idle:       "⏱",
  scheduled:  "📅",
  fallback:   "⬇️",
};

const inputCls = "w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-xs font-medium text-gray-700 mb-1";
const selectCls = "w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

const EMPTY_FORM = {
  name: "",
  model_id: "",
  worker_type: "vllm",
  docker_image: "",
  gpu_type: "",
  gpu_count: 1,
  vram_gb: 24,
  container_disk_gb: 20,
  region: "EU",
  session_type: "idle",
  idle_timeout_minutes: 30,
  schedule_cron: "",
  schedule_stop_cron: "",
  prewarm_minutes: 15,
  priority: 100,
  network_volume_id: "",
};

// ─── Create Pod Modal ─────────────────────────────────────────────────────────
function CreatePodModal({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: gpuData } = useQuery({
    queryKey: ["gpu-types"],
    queryFn: () => adminApi.listGpuTypes(),
    select: (res: { data: { gpu_types?: { id: string; displayName: string; memoryInGb: number }[] } }) =>
      res.data.gpu_types ?? [],
    enabled: open,
  });

  const { data: modelsData } = useQuery({
    queryKey: ["models"],
    queryFn: () => adminApi.listModels(),
    select: (res: { data: { models?: { id: string; name: string }[] } }) => res.data.models ?? [],
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      adminApi.createPod({
        ...form,
        gpu_type: form.gpu_type || undefined,
        network_volume_id: form.network_volume_id || undefined,
        schedule_cron: form.schedule_cron || undefined,
        schedule_stop_cron: form.schedule_stop_cron || undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      setForm(EMPTY_FORM);
      onCreated();
    },
  });

  const set = (field: string, value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Nuovo Pod
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Crea Pod Definition</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-4 grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nome</label>
                <input className={inputCls} value={form.name}
                  placeholder="LLM Primary (72B)"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("name", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Modello</label>
                <select className={selectCls} value={form.model_id}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("model_id", e.target.value)}>
                  <option value="">Seleziona modello</option>
                  {(modelsData ?? []).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Worker Type</label>
                <select className={selectCls} value={form.worker_type}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("worker_type", e.target.value)}>
                  <option value="vllm">vLLM (LLM)</option>
                  <option value="stt_worker">STT Worker</option>
                  <option value="tts_worker">TTS Worker</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Session Type</label>
                <select className={selectCls} value={form.session_type}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("session_type", e.target.value)}>
                  <option value="persistent">🔄 Persistent (always-on)</option>
                  <option value="idle">⏱ Idle (sleep after timeout)</option>
                  <option value="scheduled">📅 Scheduled (cron)</option>
                  <option value="fallback">⬇️ Fallback</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Docker Image</label>
                <input className={inputCls} value={form.docker_image}
                  placeholder="ghcr.io/org/vllm-qwen:latest"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("docker_image", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>GPU Type</label>
                <select className={selectCls} value={form.gpu_type}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("gpu_type", e.target.value)}>
                  <option value="">Seleziona GPU</option>
                  {(gpuData ?? []).map((g) => (
                    <option key={g.id} value={g.id}>{g.displayName} ({g.memoryInGb}GB)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>GPU Count</label>
                <input type="number" min={1} max={8} className={inputCls} value={form.gpu_count}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("gpu_count", parseInt(e.target.value) || 1)} />
              </div>
              <div>
                <label className={labelCls}>VRAM (GB)</label>
                <input type="number" className={inputCls} value={form.vram_gb}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("vram_gb", parseFloat(e.target.value) || 24)} />
              </div>
              <div>
                <label className={labelCls}>Disk (GB)</label>
                <input type="number" className={inputCls} value={form.container_disk_gb}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("container_disk_gb", parseInt(e.target.value) || 20)} />
              </div>
              <div>
                <label className={labelCls}>Network Volume ID</label>
                <input className={inputCls} value={form.network_volume_id}
                  placeholder="vol-abc123"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("network_volume_id", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Priority (basso = preferito)</label>
                <input type="number" className={inputCls} value={form.priority}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("priority", parseInt(e.target.value) || 100)} />
              </div>
              {form.session_type === "idle" && (
                <div>
                  <label className={labelCls}>Idle Timeout (min)</label>
                  <input type="number" className={inputCls} value={form.idle_timeout_minutes}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("idle_timeout_minutes", parseInt(e.target.value) || 30)} />
                </div>
              )}
              {form.session_type === "scheduled" && (
                <>
                  <div>
                    <label className={labelCls}>Schedule Cron (start)</label>
                    <input className={inputCls} value={form.schedule_cron}
                      placeholder="0 8 * * 1-5"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("schedule_cron", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Schedule Cron (stop)</label>
                    <input className={inputCls} value={form.schedule_stop_cron}
                      placeholder="0 20 * * 1-5"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("schedule_stop_cron", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Pre-warm (min prima)</label>
                    <input type="number" className={inputCls} value={form.prewarm_minutes}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("prewarm_minutes", parseInt(e.target.value) || 15)} />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.name || !form.model_id || !form.docker_image}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Crea
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ pod, onDelete }: { pod: Pod; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
        title="Elimina"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Elimina Pod Definition</h3>
            <p className="text-sm text-gray-600 mb-4">
              Elimina la definizione "{pod.name}".
              {pod.runpod_pod_id && " Il pod RunPod verrà terminato se in esecuzione."}
              {" "}Questa azione non è reversibile.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={() => { onDelete(); setOpen(false); }}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PodList() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pods"],
    queryFn: () => adminApi.listPods(),
    select: (res: { data: { pods: Pod[] } }) => res.data,
    refetchInterval: 30000,
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => adminApi.startPod(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods"] }),
  });
  const stopMutation = useMutation({
    mutationFn: (id: string) => adminApi.stopPod(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deletePod(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods"] }),
  });
  const createOnRunpodMutation = useMutation({
    mutationFn: (id: string) => adminApi.createPodOnRunpod(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods"] }),
  });

  const pods = data?.pods ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pod Definitions</h1>
          <p className="text-gray-500 mt-1">
            Gestisci i pod RunPod: crea, avvia, ferma e monitora i worker (vLLM, STT, TTS).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Aggiorna
          </button>
          <CreatePodModal onCreated={() => queryClient.invalidateQueries({ queryKey: ["pods"] })} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {(["running", "starting", "stopped", "error"] as const).map((status) => (
          <div key={status} className="border rounded-lg p-4">
            <div className="text-2xl font-bold">{pods.filter((p) => p.pod_status === status).length}</div>
            <div className="text-sm text-gray-500 capitalize">{status}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Caricamento...</div>
        ) : pods.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">Nessun pod definito</div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Modello</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Hardware</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Session Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ultima richiesta</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {pods.map((pod) => (
                <tr key={pod.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{pod.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{pod.worker_type}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{pod.model_id}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[140px]" title={pod.docker_image}>
                      {pod.docker_image.split("/").pop()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{pod.gpu_type ?? "—"}</div>
                    <div className="text-xs text-gray-400">{pod.vram_gb}GB · {pod.gpu_count}x GPU</div>
                  </td>
                  <td className="px-4 py-3">
                    <span title={pod.schedule_cron ?? undefined}>
                      {sessionTypeIcon[pod.session_type] ?? "?"} {pod.session_type}
                    </span>
                    {pod.session_type === "idle" && (
                      <div className="text-xs text-gray-400">timeout: {pod.idle_timeout_minutes}min</div>
                    )}
                    {pod.session_type === "scheduled" && pod.schedule_cron && (
                      <div className="text-xs text-gray-400 font-mono">{pod.schedule_cron}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[pod.pod_status] ?? "bg-gray-100 text-gray-600"}`}>
                      {pod.pod_status}
                    </span>
                    {pod.backend_url && (
                      <div className="text-xs text-gray-400 mt-0.5 font-mono truncate max-w-[120px]" title={pod.backend_url}>
                        {pod.backend_url.replace("https://", "")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {pod.last_request_at
                      ? formatDistanceToNow(new Date(pod.last_request_at), { addSuffix: true })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {!pod.runpod_pod_id ? (
                        <button
                          title="Crea su RunPod"
                          onClick={() => createOnRunpodMutation.mutate(pod.id)}
                          disabled={createOnRunpodMutation.isPending}
                          className="p-1.5 rounded border text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      ) : pod.pod_status === "stopped" ? (
                        <button
                          title="Avvia"
                          onClick={() => startMutation.mutate(pod.id)}
                          disabled={startMutation.isPending}
                          className="p-1.5 rounded border text-green-600 hover:bg-green-50 disabled:opacity-50 transition-colors"
                        >
                          {startMutation.isPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Play className="h-3.5 w-3.5" />}
                        </button>
                      ) : pod.pod_status === "running" ? (
                        <button
                          title="Ferma"
                          onClick={() => stopMutation.mutate(pod.id)}
                          disabled={stopMutation.isPending}
                          className="p-1.5 rounded border text-orange-600 hover:bg-orange-50 disabled:opacity-50 transition-colors"
                        >
                          {stopMutation.isPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Square className="h-3.5 w-3.5" />}
                        </button>
                      ) : null}

                      <button title="Metriche" className="p-1.5 rounded text-blue-500 hover:bg-blue-50 transition-colors">
                        <Activity className="h-3.5 w-3.5" />
                      </button>

                      <DeleteConfirm pod={pod} onDelete={() => deleteMutation.mutate(pod.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
