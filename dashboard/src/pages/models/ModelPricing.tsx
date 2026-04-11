import { useState, useEffect, FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { ArrowLeft, Check, History } from "lucide-react";
import { formatDate } from "@/lib/utils";

type PricingHistory = {
  input_cost_per_1k_micro: number;
  output_cost_per_1k_micro: number;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
  currency: string;
  changed_by: string | null;
  effective_from: string;
};

export function ModelPricing() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: priceData, isLoading } = useQuery({
    queryKey: ["pricing", id],
    queryFn: () =>
      adminApi.listPricing().then((r) => {
        const list = r.data?.pricing ?? [];
        return list.find((p: { model_id: string }) => p.model_id === id) ?? null;
      }),
    enabled: !!id,
  });

  const { data: historyData } = useQuery({
    queryKey: ["pricing-history", id],
    queryFn: () => adminApi.getPricingHistory(id!).then((r) => r.data),
    enabled: !!id,
  });

  const [inputCost, setInputCost] = useState("");
  const [outputCost, setOutputCost] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (priceData) {
      setInputCost(String(priceData.input_cost_per_1k_micro ?? 0));
      setOutputCost(String(priceData.output_cost_per_1k_micro ?? 0));
    }
  }, [priceData]);

  const mutation = useMutation({
    mutationFn: (data: object) => adminApi.updatePricing(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing"] });
      qc.invalidateQueries({ queryKey: ["pricing-history", id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to update pricing";
      setError(msg);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      input_cost_per_1k_micro: parseInt(inputCost, 10),
      output_cost_per_1k_micro: parseInt(outputCost, 10),
      currency: "EUR",
    });
  };

  const toEUR = (micro: string) => {
    const v = parseInt(micro, 10);
    if (isNaN(v) || v === 0) return "—";
    const per1k = (v / 1_000_000).toFixed(6);
    const perToken = (v / 1_000_000_000).toFixed(10);
    return `€${per1k}/1K  (€${perToken}/token)`;
  };

  const history: PricingHistory[] = historyData?.history ?? [];

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          to="/models"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Models
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Pricing — {id}</h1>
      </div>

      {/* Pricing form */}
      <div className="bg-white rounded-xl border p-6">
        {isLoading ? (
          <div className="h-24 animate-pulse bg-gray-100 rounded-md" />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
              Valori in <strong>micro-EUR per 1K token</strong> (interi).
              Esempio: <code className="font-mono">500</code> = €0.0005/1K token = €0.0000005/token.
              Per STT/TTS: per 1K secondi audio o caratteri.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Costo Input (micro-EUR / 1K)
              </label>
              <input
                type="number"
                min="0"
                value={inputCost}
                onChange={(e) => setInputCost(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">{toEUR(inputCost)}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Costo Output (micro-EUR / 1K)
              </label>
              <input
                type="number"
                min="0"
                value={outputCost}
                onChange={(e) => setOutputCost(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">{toEUR(outputCost)}</p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" />
                  Salvato
                </>
              ) : mutation.isPending ? (
                "Salvataggio…"
              ) : (
                "Salva Pricing"
              )}
            </button>
          </form>
        )}
      </div>

      {/* Pricing history */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50">
            <History className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Storico prezzi</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Data</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Input / 1K</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Output / 1K</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Modificato da</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-600 text-xs">{formatDate(h.effective_from)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-gray-800">
                    €{h.input_cost_per_1k.toFixed(6)}
                    <span className="text-gray-400 ml-1">({h.input_cost_per_1k_micro}µ)</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-gray-800">
                    {h.output_cost_per_1k_micro > 0
                      ? <>€{h.output_cost_per_1k.toFixed(6)}<span className="text-gray-400 ml-1">({h.output_cost_per_1k_micro}µ)</span></>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{h.changed_by ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
