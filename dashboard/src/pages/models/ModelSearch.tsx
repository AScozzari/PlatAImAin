import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Search, ArrowLeft, Download, ThumbsUp, CheckCircle, Lock, Cpu } from "lucide-react";

const CATEGORIES = ["", "llm", "reasoning", "coding", "vision", "stt", "tts", "embedding"];
const CATEGORY_LABELS: Record<string, string> = {
  "": "Tutte le categorie",
  llm: "LLM", reasoning: "Reasoning", coding: "Coding",
  vision: "Vision", stt: "STT", tts: "TTS", embedding: "Embedding",
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

type SearchResult = {
  id: string;
  name: string;
  hf_repo: string;
  category: string;
  estimated_vram_gb: number | null;
  downloads: number;
  likes: number;
  tags: string[];
  pipeline_tag: string | null;
  compatible: boolean;
  gated: boolean;
  private: boolean;
  author: string | null;
  last_modified: string | null;
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function ModelSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [compatibleOnly, setCompatibleOnly] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["model-search", query, category, compatibleOnly],
    queryFn: () =>
      adminApi.searchModels({
        q: query,
        category: category || undefined,
        source: "huggingface",
        max_results: 30,
        compatible_only: compatibleOnly || undefined,
      }).then((r) => r.data),
    enabled: submitted && query.length >= 2,
    staleTime: 60_000,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) setSubmitted(true);
  };

  const handleAddModel = (result: SearchResult) => {
    // Navigate to ModelList with the form pre-filled (via query param)
    navigate(`/models?add=1&id=${encodeURIComponent(result.id)}&name=${encodeURIComponent(result.name)}&hf_repo=${encodeURIComponent(result.hf_repo)}&category=${result.category}&vram=${result.estimated_vram_gb ?? ""}`);
  };

  const results: SearchResult[] = data?.models ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/models"
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Cerca Modelli</h1>
      </div>

      {/* Search form */}
      <div className="bg-white rounded-xl border p-5">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSubmitted(false); }}
                className="w-full pl-9 pr-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Cerca modelli su HuggingFace (es. llama, qwen, whisper...)"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={query.trim().length < 2}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Cerca
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={compatibleOnly}
              onChange={(e) => setCompatibleOnly(e.target.checked)}
              className="rounded"
            />
            <span className="text-gray-700">Solo modelli compatibili con vLLM / servizi nativi</span>
          </label>
        </form>

        {/* Source badge */}
        <p className="mt-3 text-xs text-gray-400">
          Fonte: <span className="font-medium text-gray-600">HuggingFace Hub</span>
          {data && ` — ${data.total} risultati`}
        </p>
      </div>

      {/* Results */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-4 animate-pulse h-40" />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 rounded-xl border border-red-200 px-4 py-3 text-sm text-red-700">
          Errore nella ricerca. Verifica la connessione a HuggingFace.
        </div>
      )}

      {!isLoading && submitted && results.length === 0 && (
        <div className="bg-white rounded-xl border px-4 py-8 text-center text-sm text-gray-400">
          Nessun risultato per "{query}".
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((result) => (
            <div
              key={result.hf_repo}
              className={cn(
                "bg-white rounded-xl border p-4 space-y-3",
                !result.compatible && "opacity-70"
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{result.name}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">{result.hf_repo}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {result.compatible ? (
                    <span className="inline-flex items-center gap-0.5 text-xs text-green-700 font-medium">
                      <CheckCircle className="w-3 h-3" /> compatibile
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">non compatibile</span>
                  )}
                  {result.gated && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-amber-600">
                      <Lock className="w-3 h-3" /> gated
                    </span>
                  )}
                </div>
              </div>

              {/* Category + VRAM */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[result.category] ?? "bg-gray-100 text-gray-700"}`}>
                  {result.category}
                </span>
                {result.estimated_vram_gb != null && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-gray-500">
                    <Cpu className="w-3 h-3" />
                    {result.estimated_vram_gb} GB VRAM
                  </span>
                )}
                {result.pipeline_tag && (
                  <span className="text-xs text-gray-400">{result.pipeline_tag}</span>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-0.5">
                  <Download className="w-3 h-3" />
                  {formatNumber(result.downloads)}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <ThumbsUp className="w-3 h-3" />
                  {formatNumber(result.likes)}
                </span>
                {result.author && <span className="text-gray-400">by {result.author}</span>}
              </div>

              {/* Tags */}
              {result.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {result.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Add button */}
              <button
                onClick={() => handleAddModel(result)}
                disabled={!result.compatible}
                className="w-full px-3 py-1.5 border border-blue-200 text-blue-700 text-xs font-medium rounded-md hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Aggiungi al catalogo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
