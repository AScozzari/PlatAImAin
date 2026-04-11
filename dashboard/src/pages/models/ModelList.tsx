import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RefreshCw, DollarSign } from "lucide-react";

type Model = {
  id: string;
  name: string;
  category: string;
  tier: string;
  min_plan: string;
  vram_gb?: number;
  is_active: boolean;
  capabilities?: {
    tool_calling?: boolean;
    streaming?: boolean;
    vision?: boolean;
    batch_input?: boolean;
  };
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

export function ModelList() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["models"],
    queryFn: () => adminApi.listModels().then((r) => r.data),
  });

  const reloadMutation = useMutation({
    mutationFn: () => adminApi.reloadModels(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });

  const models: Model[] = data?.models ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Models</h1>
        <button
          onClick={() => reloadMutation.mutate()}
          disabled={reloadMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw
            className={cn("w-4 h-4", reloadMutation.isPending && "animate-spin")}
          />
          Reload Config
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Model ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tier</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Min Plan</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">VRAM</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Capabilities</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-800">{m.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        CATEGORY_COLORS[m.category] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {m.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.tier}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{m.min_plan}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {m.vram_gb ? `${m.vram_gb}GB` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {m.capabilities?.tool_calling && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                          tools
                        </span>
                      )}
                      {m.capabilities?.streaming && (
                        <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-600 rounded">
                          stream
                        </span>
                      )}
                      {m.capabilities?.vision && (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">
                          vision
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {m.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/models/${m.id}/pricing`}
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 border rounded px-2 py-1 hover:bg-gray-50 transition-colors"
                    >
                      <DollarSign className="w-3 h-3" />
                      Pricing
                    </Link>
                  </td>
                </tr>
              ))}
              {models.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No models loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
