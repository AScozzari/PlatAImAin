import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play, Square, Trash2, Plus, RefreshCw, Activity, Loader2 } from "lucide-react";
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

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    running:  "bg-green-100 text-green-800",
    stopped:  "bg-gray-100 text-gray-600",
    starting: "bg-blue-100 text-blue-800",
    error:    "bg-red-100 text-red-800",
    scaling:  "bg-purple-100 text-purple-800",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
};

const sessionTypeIcon = (type: string) => {
  const map: Record<string, string> = {
    persistent: "🔄",
    idle:       "⏱",
    scheduled:  "📅",
    fallback:   "⬇️",
  };
  return map[type] ?? "?";
};

// ─── Create Pod Modal ─────────────────────────────────────────────────────────
function CreatePodModal({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
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
  });

  const { data: gpuData } = useQuery({
    queryKey: ["gpu-types"],
    queryFn: () => adminApi.listGpuTypes(),
    select: (res) => res.data.gpu_types ?? [],
    enabled: open,
  });

  const { data: modelsData } = useQuery({
    queryKey: ["models"],
    queryFn: () => adminApi.listModels(),
    select: (res) => res.data.models ?? [],
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () => adminApi.createPod({
      ...form,
      gpu_type: form.gpu_type || undefined,
      network_volume_id: form.network_volume_id || undefined,
      schedule_cron: form.schedule_cron || undefined,
      schedule_stop_cron: form.schedule_stop_cron || undefined,
    }),
    onSuccess: () => {
      setOpen(false);
      onCreated();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Pod
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crea Pod Definition</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="LLM Primary (72B)" />
          </div>
          <div>
            <Label>Modello</Label>
            <Select value={form.model_id} onValueChange={(v) => setForm({ ...form, model_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona modello" />
              </SelectTrigger>
              <SelectContent>
                {((modelsData ?? []) as { id: string; name: string }[]).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Worker Type</Label>
            <Select value={form.worker_type} onValueChange={(v) => setForm({ ...form, worker_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vllm">vLLM (LLM)</SelectItem>
                <SelectItem value="stt_worker">STT Worker</SelectItem>
                <SelectItem value="tts_worker">TTS Worker</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Session Type</Label>
            <Select value={form.session_type} onValueChange={(v) => setForm({ ...form, session_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="persistent">🔄 Persistent (always-on)</SelectItem>
                <SelectItem value="idle">⏱ Idle (sleep after timeout)</SelectItem>
                <SelectItem value="scheduled">📅 Scheduled (cron)</SelectItem>
                <SelectItem value="fallback">⬇️ Fallback</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Docker Image</Label>
            <Input value={form.docker_image} onChange={(e) => setForm({ ...form, docker_image: e.target.value })} placeholder="ghcr.io/org/vllm-qwen:latest" />
          </div>
          <div>
            <Label>GPU Type</Label>
            <Select value={form.gpu_type} onValueChange={(v) => setForm({ ...form, gpu_type: v })}>
              <SelectTrigger><SelectValue placeholder="Seleziona GPU" /></SelectTrigger>
              <SelectContent>
                {((gpuData ?? []) as { id: string; displayName: string; memoryInGb: number }[]).map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.displayName} ({g.memoryInGb}GB)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>GPU Count</Label>
            <Input type="number" min={1} max={8} value={form.gpu_count} onChange={(e) => setForm({ ...form, gpu_count: parseInt(e.target.value) || 1 })} />
          </div>
          <div>
            <Label>VRAM (GB)</Label>
            <Input type="number" value={form.vram_gb} onChange={(e) => setForm({ ...form, vram_gb: parseFloat(e.target.value) || 24 })} />
          </div>
          <div>
            <Label>Disk (GB)</Label>
            <Input type="number" value={form.container_disk_gb} onChange={(e) => setForm({ ...form, container_disk_gb: parseInt(e.target.value) || 20 })} />
          </div>
          <div>
            <Label>Network Volume ID</Label>
            <Input value={form.network_volume_id} onChange={(e) => setForm({ ...form, network_volume_id: e.target.value })} placeholder="vol-abc123" />
          </div>
          <div>
            <Label>Priority (basso = preferito)</Label>
            <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 100 })} />
          </div>
          {form.session_type === "idle" && (
            <div>
              <Label>Idle Timeout (min)</Label>
              <Input type="number" value={form.idle_timeout_minutes} onChange={(e) => setForm({ ...form, idle_timeout_minutes: parseInt(e.target.value) || 30 })} />
            </div>
          )}
          {form.session_type === "scheduled" && (
            <>
              <div>
                <Label>Schedule Cron (start)</Label>
                <Input value={form.schedule_cron} onChange={(e) => setForm({ ...form, schedule_cron: e.target.value })} placeholder="0 8 * * 1-5" />
              </div>
              <div>
                <Label>Schedule Cron (stop)</Label>
                <Input value={form.schedule_stop_cron} onChange={(e) => setForm({ ...form, schedule_stop_cron: e.target.value })} placeholder="0 20 * * 1-5" />
              </div>
              <div>
                <Label>Pre-warm (min prima)</Label>
                <Input type="number" value={form.prewarm_minutes} onChange={(e) => setForm({ ...form, prewarm_minutes: parseInt(e.target.value) || 15 })} />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name || !form.model_id || !form.docker_image}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Crea
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PodList() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pods"],
    queryFn: () => adminApi.listPods(),
    select: (res) => res.data as { pods: Pod[] },
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
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Aggiorna
          </Button>
          <CreatePodModal onCreated={() => queryClient.invalidateQueries({ queryKey: ["pods"] })} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {["running", "starting", "stopped", "error"].map((status) => (
          <div key={status} className="border rounded-lg p-4">
            <div className="text-2xl font-bold">{pods.filter((p) => p.pod_status === status).length}</div>
            <div className="text-sm text-gray-500 capitalize">{status}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-gray-400">Caricamento...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Modello</TableHead>
              <TableHead>Hardware</TableHead>
              <TableHead>Session Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ultima richiesta</TableHead>
              <TableHead className="w-32">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pods.map((pod) => (
              <TableRow key={pod.id}>
                <TableCell>
                  <div className="font-medium">{pod.name}</div>
                  <div className="text-xs text-gray-400 font-mono">{pod.worker_type}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{pod.model_id}</div>
                  <div className="text-xs text-gray-400 truncate max-w-[140px]" title={pod.docker_image}>
                    {pod.docker_image.split("/").pop()}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{pod.gpu_type ?? "—"}</div>
                  <div className="text-xs text-gray-400">{pod.vram_gb}GB VRAM · {pod.gpu_count}x GPU</div>
                </TableCell>
                <TableCell>
                  <span title={pod.schedule_cron ?? undefined}>
                    {sessionTypeIcon(pod.session_type)} {pod.session_type}
                  </span>
                  {pod.session_type === "idle" && (
                    <div className="text-xs text-gray-400">timeout: {pod.idle_timeout_minutes}min</div>
                  )}
                  {pod.session_type === "scheduled" && pod.schedule_cron && (
                    <div className="text-xs text-gray-400 font-mono">{pod.schedule_cron}</div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={`${statusBadge(pod.pod_status)} border-0 text-xs`}>
                    {pod.pod_status}
                  </Badge>
                  {pod.backend_url && (
                    <div className="text-xs text-gray-400 mt-0.5 font-mono truncate max-w-[120px]" title={pod.backend_url}>
                      {pod.backend_url.replace("https://", "")}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-gray-500">
                  {pod.last_request_at
                    ? formatDistanceToNow(new Date(pod.last_request_at), { addSuffix: true })
                    : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {!pod.runpod_pod_id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        title="Crea su RunPod"
                        onClick={() => createOnRunpodMutation.mutate(pod.id)}
                        disabled={createOnRunpodMutation.isPending}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    ) : pod.pod_status === "stopped" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        title="Avvia"
                        onClick={() => startMutation.mutate(pod.id)}
                        disabled={startMutation.isPending}
                        className="text-green-600 hover:text-green-700"
                      >
                        {startMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      </Button>
                    ) : pod.pod_status === "running" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        title="Ferma"
                        onClick={() => stopMutation.mutate(pod.id)}
                        disabled={stopMutation.isPending}
                        className="text-orange-600 hover:text-orange-700"
                      >
                        {stopMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                      </Button>
                    ) : null}

                    <Button variant="ghost" size="sm" title="Metriche">
                      <Activity className="h-3.5 w-3.5 text-blue-500" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Elimina Pod Definition</AlertDialogTitle>
                          <AlertDialogDescription>
                            Elimina la definizione "{pod.name}".
                            {pod.runpod_pod_id && " Il pod RunPod verrà terminato se in esecuzione."}
                            {" "}Questa azione non è reversibile.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(pod.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
