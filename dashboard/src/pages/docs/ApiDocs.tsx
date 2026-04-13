import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { Download, RefreshCw } from "lucide-react";

export function ApiDocs() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["api-docs"],
    queryFn: () => adminApi.getApiDocs(),
    select: (res: { data: string }) => res.data,
    staleTime: 5 * 60 * 1000, // cache 5 min
  });

  const handleDownload = () => {
    if (!data) return;
    const blob = new Blob([data], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "api.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Documentation</h1>
          <p className="text-gray-500 mt-1">
            Riferimento completo degli endpoint OpenAI-compatible e Admin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Ricarica
          </button>
          <button
            onClick={handleDownload}
            disabled={!data}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
          Caricamento documentazione...
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Impossibile caricare la documentazione. Verifica che il gateway sia in esecuzione.
        </div>
      )}

      {data && (
        <pre className="bg-gray-50 border rounded-xl p-6 text-sm font-mono text-gray-800 whitespace-pre-wrap overflow-auto max-h-[calc(100vh-200px)] leading-relaxed">
          {data}
        </pre>
      )}
    </div>
  );
}
