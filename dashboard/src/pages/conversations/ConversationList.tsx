import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { MessageSquare, Cpu, Mic, Volume2, Unlink, RefreshCw, X } from "lucide-react";

type ConvWorker = {
  model_class: "llm" | "stt" | "tts";
  model_id: string;
  pod_name: string;
  pod_status: string;
};

type Conversation = {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  warm_state: "active" | "idle" | "closed";
  last_activity: string;
  created_at: string;
  workers: ConvWorker[];
};

const warmStateColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  idle:   "bg-yellow-100 text-yellow-800",
  closed: "bg-gray-100 text-gray-600",
};

const podStatusColors: Record<string, string> = {
  running:  "bg-green-100 text-green-800",
  stopped:  "bg-gray-100 text-gray-600",
  starting: "bg-blue-100 text-blue-800",
  error:    "bg-red-100 text-red-800",
};

function WorkerIcon({ model_class }: { model_class: string }) {
  if (model_class === "llm") return <Cpu className="h-3.5 w-3.5 text-blue-500" />;
  if (model_class === "stt") return <Mic className="h-3.5 w-3.5 text-purple-500" />;
  if (model_class === "tts") return <Volume2 className="h-3.5 w-3.5 text-orange-500" />;
  return null;
}

function ReleaseConfirm({ convId, onRelease }: { convId: string; onRelease: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded text-orange-500 hover:bg-orange-50 transition-colors"
        title="Rilascia session affinity"
      >
        <Unlink className="h-4 w-4" />
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Rilascia session affinity</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Rimuove il pinning dei pod per questa conversazione ({convId.slice(0, 8)}…).
              La prossima richiesta verrà assegnata a un pod diverso tramite routing normale.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={() => { onRelease(); setOpen(false); }}
                className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-md hover:bg-orange-700 transition-colors"
              >
                Rilascia
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ConversationList() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => adminApi.listConversations(),
    select: (res: { data: { conversations: Conversation[]; total: number } }) => res.data,
    refetchInterval: 30000,
  });

  const releaseMutation = useMutation({
    mutationFn: (id: string) => adminApi.releaseConversation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const conversations = data?.conversations ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
          <p className="text-gray-500 mt-1">
            Session affinity attive: ogni conversazione è pinned ai pod STT + LLM + TTS assegnati.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Aggiorna
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <div className="text-2xl font-bold">{conversations.filter((c) => c.warm_state === "active").length}</div>
          <div className="text-sm text-gray-500">Attive</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-2xl font-bold">{conversations.filter((c) => c.warm_state === "idle").length}</div>
          <div className="text-sm text-gray-500">Idle</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-2xl font-bold">{data?.total ?? 0}</div>
          <div className="text-sm text-gray-500">Totale</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Caricamento...</div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-gray-400 gap-2">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">Nessuna conversazione attiva</p>
          </div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tenant</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stato</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Workers pinned</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ultima attività</th>
                <th className="px-4 py-3 w-14"></th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((conv) => (
                <tr key={conv.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {conv.id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {conv.tenant_name ?? conv.tenant_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${warmStateColors[conv.warm_state] ?? "bg-gray-100 text-gray-600"}`}>
                      {conv.warm_state}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {conv.workers.map((w) => (
                        <div
                          key={w.model_class}
                          className="flex items-center gap-1 text-xs border rounded px-1.5 py-0.5"
                        >
                          <WorkerIcon model_class={w.model_class} />
                          <span className="font-medium">{w.model_class.toUpperCase()}</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-500 max-w-[80px] truncate" title={w.pod_name}>
                            {w.pod_name}
                          </span>
                          <span className={`text-[10px] px-1 rounded font-medium ${podStatusColors[w.pod_status] ?? "bg-gray-100 text-gray-600"}`}>
                            {w.pod_status}
                          </span>
                        </div>
                      ))}
                      {conv.workers.length === 0 && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDistanceToNow(new Date(conv.last_activity), { addSuffix: true, locale: it })}
                  </td>
                  <td className="px-4 py-3">
                    <ReleaseConfirm
                      convId={conv.id}
                      onRelease={() => releaseMutation.mutate(conv.id)}
                    />
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
