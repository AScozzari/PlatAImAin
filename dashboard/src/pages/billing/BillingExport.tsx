import { useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "@/lib/api";
import { ArrowLeft, Download } from "lucide-react";

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function jsonToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const v = String(row[h] ?? "");
          return v.includes(",") ? `"${v}"` : v;
        })
        .join(",")
    ),
  ];
  return lines.join("\n");
}

export function BillingExport() {
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [period, setPeriod] = useState(defaultPeriod);
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminApi.billingReport(period);
      const rows = data?.rows ?? [];
      const filename = `billing-${period}.${format}`;

      if (format === "json") {
        downloadBlob(JSON.stringify(rows, null, 2), filename, "application/json");
      } else {
        downloadBlob(jsonToCsv(rows), filename, "text/csv");
      }
    } catch {
      setError("Failed to fetch billing data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 max-w-md">
      <div className="flex items-center gap-3">
        <Link
          to="/billing"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Billing
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Export Billing Data</h1>
      </div>

      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
          <div className="flex gap-4">
            {(["csv", "json"] as const).map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value={f}
                  checked={format === f}
                  onChange={() => setFormat(f)}
                />
                <span className="uppercase font-medium">{f}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
        )}

        <button
          onClick={handleExport}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          {loading ? "Exporting…" : `Export as ${format.toUpperCase()}`}
        </button>
      </div>
    </div>
  );
}
