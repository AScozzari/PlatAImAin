import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { ArrowLeft, Copy, Check, AlertTriangle } from "lucide-react";

export function TenantApiKey() {
  const { id } = useParams<{ id: string }>();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const regenMutation = useMutation({
    mutationFn: () => adminApi.regenerateApiKey(id!),
    onSuccess: (res) => setNewKey(res.data.api_key),
  });

  const handleCopy = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-3">
        <Link
          to={`/tenants/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Tenant
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Regenerate API Key</h1>
      </div>

      <div className="bg-white rounded-xl border p-6 space-y-4">
        {!newKey ? (
          <>
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Warning</p>
                <p>
                  Regenerating the API key will immediately invalidate the existing key. Any
                  integrations using the old key will stop working.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="rounded"
              />
              I understand that the old API key will stop working immediately.
            </label>

            <button
              onClick={() => regenMutation.mutate()}
              disabled={!confirmed || regenMutation.isPending}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {regenMutation.isPending ? "Regenerating…" : "Regenerate API Key"}
            </button>
          </>
        ) : (
          <>
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              <p className="font-medium mb-1">New API key generated</p>
              <p>Copy and store this key securely. It won't be shown again.</p>
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2.5 bg-gray-50 border rounded-md text-xs font-mono break-all">
                {newKey}
              </code>
              <button
                onClick={handleCopy}
                className="p-2 border rounded-md text-gray-500 hover:bg-gray-50 transition-colors shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            <Link
              to={`/tenants/${id}`}
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Tenant
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
