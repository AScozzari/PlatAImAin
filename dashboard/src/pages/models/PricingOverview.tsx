import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi } from "@/lib/api";
import { Save, Loader2, History, RefreshCw, Info } from "lucide-react";

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
  stt: "1K secondi",
  tts: "1K caratteri",
};
function unitFor(cat: string) { return UNIT_LABEL[cat] ?? "1K token"; }

// micro-EUR → display string in EUR
function microToEur(micro: number): string {
  if (micro === 0) return "—";
  const eur = micro / 1_000_000;
  if (eur >= 0.001) return `€${eur.toFixed(4)}`;
  if (eur >= 0.00001) return `€${eur.toFixed(6)}`;
  return `€${eur.toFixed(8)}`;
}

// micro-EUR → €/singola unità
function microToPerUnit(micro: number): string {
  if (micro === 0) return "—";
  const perUnit = micro / 1_000_000 / 1000;
  if (perUnit >= 0.000001) return `€${perUnit.toFixed(8)}`;
  return `€${perUnit.toExponential(2)}`;
}

// EUR string → micro-EUR integer
function eurToMicro(eurStr: string): number {
  const v = parseFloat(eurStr);
  if (isNaN(v) || v < 0) return 0;
  return Math.round(v * 1_000_000);
}

// ─── Inline editable price cell (input in EUR) ────────────────────────────────
function EditablePrice({
  modelId,
  field,
  valueMicro,
  onSaved,
}: {
  modelId: string;
  field: "input" | "output";
  valueMicro: number;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // Draft shown in EUR (e.g. "0.0005")
  const [draft, setDraft] = useState("");

  const mutation = useMutation({
    mutationFn: (micro: number) =>
      adminApi.updatePricing(modelId, {
        ...(field === "input"
          ? { input_cost_per_1k_micro: micro }
          : { output_cost_per_1k_micro: micro }),
      }),
    onSuccess: () => {
      setEditing(false);
      onSaved();
    },
  });

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(valueMicro === 0 ? "0" : (valueMicro / 1_000_000).toFixed(7).replace(/\.?0+$/, ""));
          setEditing(true);
        }}
        className="group text-left font-mono text-sm hover:bg-blue-50 hover:text-blue-700 rounded px-2 py-1 transition-colors min-w-[100px] block"
        title="Click per modificare (valore in €)"
      >
        {valueMicro === 0 ? <span className="text-gray-300">—</span> : microToEur(valueMicro)}
        <span className="text-gray-300 group-hover:text-blue-400 ml-1 text-xs">✎</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
        <input
          autoFocus
          type="number"
          min={0}
          step="0.0000001"
          value={draft}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") mutation.mutate(eurToMicro(draft));
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-28 pl-5 pr-1 py-1 border rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0.0005"
        />
      </div>
      <span className="text-xs text-gray-400">/1K</span>
      <button
        onClick={() => mutation.mutate(eurToMicro(draft))}
        disabled={mutation.isPending}
        className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        title="Salva"
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
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Token Pricing</h1>
          <p className="text-gray-500 mt-1">
            Imposta il costo fatturato ai tenant per ogni modello.
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

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <div>
          <strong>Come funziona:</strong> ad ogni richiesta il gateway calcola automaticamente
          il costo (token × tariffa) e lo somma al report Billing del tenant.{" "}
          <strong>Click su un valore per modificarlo.</strong> Inserisci il prezzo in <strong>€ per 1K unità</strong>{" "}
          (es. <code className="bg-blue-100 px-1 rounded">0.0005</code> = €0.0005/1K token = €0.0000005/token).
          <br />
          <span className="text-blue-700">
            Unità: LLM/Reasoning/Coding/Vision/Embedding → token · STT → secondi · TTS → caratteri
          </span>
        </div>
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

      {/* Table */}
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Input cost / 1K
                  <span className="block text-xs font-normal text-gray-400">click per modificare</span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Output cost / 1K
                  <span className="block text-xs font-normal text-gray-400">click per modificare</span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  € / token (input)
                  <span className="block text-xs font-normal text-gray-400">calcolato</span>
                </th>
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
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {unitFor(row.category)}
                  </td>
                  <td className="px-4 py-2">
                    <EditablePrice
                      modelId={row.model_id}
                      field="input"
                      valueMicro={row.input_cost_per_1k_micro}
                      onSaved={() => queryClient.invalidateQueries({ queryKey: ["pricing"] })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    {row.output_cost_per_1k_micro > 0 ? (
                      <EditablePrice
                        modelId={row.model_id}
                        field="output"
                        valueMicro={row.output_cost_per_1k_micro}
                        onSaved={() => queryClient.invalidateQueries({ queryKey: ["pricing"] })}
                      />
                    ) : (
                      <span className="text-gray-300 px-2 py-1 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                    {microToPerUnit(row.input_cost_per_1k_micro)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/models/${row.model_id}/pricing`}
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors whitespace-nowrap"
                      title="Storico modifiche prezzi"
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
