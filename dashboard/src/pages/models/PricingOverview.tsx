import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi } from "@/lib/api";
import { Save, Loader2, History, RefreshCw } from "lucide-react";

type PricingRow = {
  model_id: string;
  model_name: string;
  category: string;
  currency: string;
  input_cost_per_1k_micro: number;
  output_cost_per_1k_micro: number;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
  updated_at?: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  llm:       "bg-blue-50 text-blue-700",
  reasoning: "bg-purple-50 text-purple-700",
  coding:    "bg-green-50 text-green-700",
  vision:    "bg-orange-50 text-orange-700",
  stt:       "bg-yellow-50 text-yellow-700",
  tts:       "bg-pink-50 text-pink-700",
  embedding: "bg-gray-100 text-gray-700",
};

const UNIT_LABEL: Record<string, string> = {
  stt:       "1K sec",
  tts:       "1K chars",
};

function unitFor(category: string) {
  return UNIT_LABEL[category] ?? "1K tokens";
}

function fmtMicro(micro: number): string {
  if (micro === 0) return "—";
  const eur = micro / 1_000_000;
  if (eur >= 0.01) return `€${eur.toFixed(4)}`;
  return `€${eur.toFixed(7)}`;
}

// ─── Inline editable cell ─────────────────────────────────────────────────────
function EditablePrice({
  modelId,
  field,
  value,
  onSaved,
}: {
  modelId: string;
  field: "input" | "output";
  value: number;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const mutation = useMutation({
    mutationFn: (newVal: number) =>
      adminApi.updatePricing(modelId, {
        ...(field === "input"
          ? { input_cost_per_1k_micro: newVal }
          : { output_cost_per_1k_micro: newVal }),
      }),
    onSuccess: () => {
      setEditing(false);
      onSaved();
    },
  });

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        className="group relative text-left font-mono text-sm hover:bg-blue-50 hover:text-blue-700 rounded px-1.5 py-0.5 transition-colors min-w-[90px]"
        title="Click per modificare"
      >
        {fmtMicro(value)}
        <span className="text-gray-300 group-hover:text-blue-400 ml-1 text-xs">✎</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        type="number"
        min={0}
        value={draft}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") mutation.mutate(parseInt(draft) || 0);
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-24 px-1.5 py-0.5 border rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        onClick={() => mutation.mutate(parseInt(draft) || 0)}
        disabled={mutation.isPending}
        className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
      </button>
      <button onClick={() => setEditing(false)} className="p-1 rounded text-gray-400 hover:text-gray-600 text-xs">✕</button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PricingOverview() {
  const queryClient = useQueryClient();
  const [filterCategory, setFilterCategory] = useState("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pricing"],
    queryFn: () => adminApi.listPricing(),
    select: (res: { data: { pricing: PricingRow[] } }) => res.data.pricing,
  });

  const pricing = (data ?? []).filter(
    (r) => filterCategory === "all" || r.category === filterCategory
  );

  const categories = ["all", ...Array.from(new Set((data ?? []).map((r) => r.category)))];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Token Pricing</h1>
          <p className="text-gray-500 mt-1">
            Costo per 1K unità per ogni modello. Click su un valore per modificarlo inline.
            I costi sono in micro-EUR (1 micro = €0.000001).
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

      {/* Legend */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <strong>Unità di misura:</strong>&nbsp;
        LLM / Reasoning / Coding / Vision / Embedding → per 1K <strong>token</strong> &nbsp;·&nbsp;
        STT → per 1K <strong>secondi</strong> audio &nbsp;·&nbsp;
        TTS → per 1K <strong>caratteri</strong>
        <br />
        <strong>Formato:</strong> valori in micro-EUR (es: 500 micro = €0.0005/1K = €0.0000005/unità)
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${
              filterCategory === cat
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Caricamento...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Modello</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Categoria</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Unità</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Input (micro/1K)</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Output (micro/1K)</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Input €/1K</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Output €/1K</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {pricing.map((row) => (
                <tr key={row.model_id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.model_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{row.model_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[row.category] ?? "bg-gray-100 text-gray-700"}`}>
                      {row.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{unitFor(row.category)}</td>
                  <td className="px-4 py-3">
                    <EditablePrice
                      modelId={row.model_id}
                      field="input"
                      value={row.input_cost_per_1k_micro}
                      onSaved={() => queryClient.invalidateQueries({ queryKey: ["pricing"] })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {row.output_cost_per_1k_micro > 0 ? (
                      <EditablePrice
                        modelId={row.model_id}
                        field="output"
                        value={row.output_cost_per_1k_micro}
                        onSaved={() => queryClient.invalidateQueries({ queryKey: ["pricing"] })}
                      />
                    ) : (
                      <span className="text-gray-300 text-sm px-1.5">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {fmtMicro(row.input_cost_per_1k_micro)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {row.output_cost_per_1k_micro > 0 ? fmtMicro(row.output_cost_per_1k_micro) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/models/${row.model_id}/pricing`}
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
                      title="Storico prezzi"
                    >
                      <History className="h-3.5 w-3.5" />
                      History
                    </Link>
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
