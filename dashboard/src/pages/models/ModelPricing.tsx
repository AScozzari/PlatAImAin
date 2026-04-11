import { useState, useEffect, FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { ArrowLeft, Check } from "lucide-react";

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
    });
  };

  const toUSD = (micro: string) => {
    const v = parseInt(micro, 10);
    if (isNaN(v)) return "—";
    return `$${(v / 1_000_000).toFixed(6)}/token  ($${(v / 1000).toFixed(4)}/1K)`;
  };

  return (
    <div className="space-y-5 max-w-lg">
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

      <div className="bg-white rounded-xl border p-6">
        {isLoading ? (
          <div className="h-24 animate-pulse bg-gray-100 rounded-md" />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
              Values are in <strong>micro-USD per 1K tokens</strong> (integers). Example: 3000 =
              $0.003/1K tokens. STT/TTS: per 1K audio seconds or characters.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Input Cost (micro-USD / 1K)
              </label>
              <input
                type="number"
                min="0"
                value={inputCost}
                onChange={(e) => setInputCost(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">{toUSD(inputCost)}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Output Cost (micro-USD / 1K)
              </label>
              <input
                type="number"
                min="0"
                value={outputCost}
                onChange={(e) => setOutputCost(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">{toUSD(outputCost)}</p>
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
                  Saved
                </>
              ) : mutation.isPending ? (
                "Saving…"
              ) : (
                "Save Pricing"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
