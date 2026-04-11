import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi } from "@/lib/api";
import { formatCost, formatTokens, planBadgeColor } from "@/lib/utils";
import { Download } from "lucide-react";

type BillingRow = {
  tenant_id: string;
  tenant_name: string;
  plan: string;
  llm_cost: number;
  reasoning_cost: number;
  coding_cost: number;
  vision_cost: number;
  stt_cost: number;
  tts_cost: number;
  embedding_cost: number;
  total_cost: number;
  total_tokens: number;
};

const CATEGORIES = ["llm", "reasoning", "coding", "vision", "stt", "tts", "embedding"];

export function BillingOverview() {
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [period, setPeriod] = useState(defaultPeriod);

  const { data, isLoading } = useQuery({
    queryKey: ["billing", period],
    queryFn: () => adminApi.billingReport(period).then((r) => r.data),
    staleTime: 60_000,
  });

  const rows: BillingRow[] = data?.rows ?? [];
  const totalCost = rows.reduce((s, r) => s + r.total_cost, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Billing</h1>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="text-sm border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Link
            to="/billing/export"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tenant</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
                {CATEGORIES.map((c) => (
                  <th
                    key={c}
                    className="text-right px-3 py-3 font-medium text-gray-600 capitalize"
                  >
                    {c}
                  </th>
                ))}
                <th className="text-right px-4 py-3 font-medium text-gray-900">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tenant_id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.tenant_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${planBadgeColor(row.plan)}`}
                    >
                      {row.plan}
                    </span>
                  </td>
                  {CATEGORIES.map((c) => {
                    const key = `${c}_cost` as keyof BillingRow;
                    const v = row[key] as number;
                    return (
                      <td key={c} className="px-3 py-3 text-right text-gray-600">
                        {v > 0 ? formatCost(v) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {formatCost(row.total_cost)}
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={CATEGORIES.length + 3}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    No billing data for {period}.
                  </td>
                </tr>
              )}

              {/* Footer total */}
              {rows.length > 0 && (
                <tr className="border-t bg-gray-50">
                  <td colSpan={2} className="px-4 py-3 font-semibold text-gray-800">
                    Total
                  </td>
                  {CATEGORIES.map((c) => {
                    const key = `${c}_cost` as keyof BillingRow;
                    const sum = rows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0);
                    return (
                      <td key={c} className="px-3 py-3 text-right font-medium text-gray-700">
                        {sum > 0 ? formatCost(sum) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {formatCost(totalCost)}
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
