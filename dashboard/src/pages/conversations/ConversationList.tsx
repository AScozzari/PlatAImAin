import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { MessageSquare, Cpu, Mic, Volume2, Unlink, RefreshCw } from "lucide-react";

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

const warmStateBadge = (state: string) => {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    idle:   "bg-yellow-100 text-yellow-800",
    closed: "bg-gray-100 text-gray-600",
  };
  return map[state] ?? "bg-gray-100 text-gray-600";
};

const podStatusBadge = (status: string) => {
  const map: Record<string, string> = {
    running:  "bg-green-100 text-green-800",
    stopped:  "bg-gray-100 text-gray-600",
    starting: "bg-blue-100 text-blue-800",
    error:    "bg-red-100 text-red-800",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
};

const WorkerIcon = ({ model_class }: { model_class: string }) => {
  if (model_class === "llm") return <Cpu className="h-3.5 w-3.5 text-blue-500" />;
  if (model_class === "stt") return <Mic className="h-3.5 w-3.5 text-purple-500" />;
  if (model_class === "tts") return <Volume2 className="h-3.5 w-3.5 text-orange-500" />;
  return null;
};

export function ConversationList() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => adminApi.listConversations(),
    select: (res) => res.data as { conversations: Conversation[]; total: number },
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
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Aggiorna
        </Button>
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

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-gray-400">Caricamento...</div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
          <MessageSquare className="h-8 w-8" />
          <p>Nessuna conversazione attiva</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Workers pinned</TableHead>
              <TableHead>Ultima attività</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conversations.map((conv) => (
              <TableRow key={conv.id}>
                <TableCell className="font-mono text-xs text-gray-500">
                  {conv.id.slice(0, 8)}…
                </TableCell>
                <TableCell className="font-medium">{conv.tenant_name ?? conv.tenant_id.slice(0, 8)}</TableCell>
                <TableCell>
                  <Badge className={`${warmStateBadge(conv.warm_state)} border-0 text-xs`}>
                    {conv.warm_state}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {conv.workers.map((w) => (
                      <div
                        key={w.model_class}
                        className="flex items-center gap-1 text-xs border rounded px-1.5 py-0.5"
                      >
                        <WorkerIcon model_class={w.model_class} />
                        <span className="font-medium">{w.model_class.toUpperCase()}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500 max-w-[80px] truncate" title={w.pod_name}>
                          {w.pod_name}
                        </span>
                        <Badge className={`${podStatusBadge(w.pod_status)} border-0 text-[10px] px-1 py-0`}>
                          {w.pod_status}
                        </Badge>
                      </div>
                    ))}
                    {conv.workers.length === 0 && (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-gray-500">
                  {formatDistanceToNow(new Date(conv.last_activity), { addSuffix: true, locale: it })}
                </TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-orange-600 hover:text-orange-700 hover:bg-orange-50">
                        <Unlink className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Rilascia session affinity</AlertDialogTitle>
                        <AlertDialogDescription>
                          Rimuove il pinning dei pod per questa conversazione.
                          La prossima richiesta verrà assegnata a un pod diverso tramite routing normale.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => releaseMutation.mutate(conv.id)}
                          className="bg-orange-600 hover:bg-orange-700"
                        >
                          Rilascia
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
