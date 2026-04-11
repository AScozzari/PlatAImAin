import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatTokens, formatCost } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { TokenUsageChart } from "@/components/charts/TokenUsageChart";
import { ModelUsageChart } from "@/components/charts/ModelUsageChart";

export function UsageByTenant() {
  const { tenantId } = useParams<{ tenantId: string }>();

  const { data: tenantData } = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: () => adminApi.getTenant(tenantId!).then((r) => r.data),
    enabled: !!tenantId,
  });

  const tenant = tenantData?.tenant ?? tenantData;

  const dailyTokens = (tenantData?.daily_tokens ?? []).map(
    (d: { date: string; total_tokens: number }) => ({
      date: d.date,
      tokens: d.total_tokens,
    })
  );

  const modelBreakdown = (tenantData?.model_breakdown ?? []).map(
    (d: { model_id: string; total_tokens: number }) => ({
      model: d.model_id,
      tokens: d.total_tokens,
    })
  );

  const categoryBreakdown: {
    category: string;
    total_tokens: number;
    total_cost: number;
    requests: number;
  }[] = tenantData?.category_breakdown ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          to="/usage"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Usage
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">
          {tenant?.name ?? "Tenant"} — Usage Detail
        </h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Monthly Tokens", value: formatTokens(tenantData?.monthly_tokens ?? 0) },
          { label: "Monthly Cost", value: formatCost(tenantData?.monthly_cost ?? 0) },
          {
            label: "Total Requests",
            value: String(tenantData?.monthly_requests ?? 0),
          },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border p-4">
            <p className="text-sm text-gray-500 mb-1">{s.label}</p>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Tokens / Day</h2>
          <TokenUsageChart data={dailyTokens} />
        </div>
        {modelBreakdown.length > 0 && (
          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Token Distribution by Model
            </h2>
            <ModelUsageChart data={modelBreakdown} />
          </div>
        )}
      </div>

      {/* Category breakdown table */}
      {categoryBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Breakdown by Category</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left pb-2 font-medium text-gray-600">Category</th>
                <th className="text-right pb-2 font-medium text-gray-600">Tokens</th>
                <th className="text-right pb-2 font-medium text-gray-600">Cost</th>
                <th className="text-right pb-2 font-medium text-gray-600">Requests</th>
              </tr>
            </thead>
            <tbody>
              {categoryBreakdown.map((c) => (
                <tr key={c.category} className="border-b last:border-0">
                  <td className="py-2.5 capitalize font-medium text-gray-800">{c.category}</td>
                  <td className="py-2.5 text-right text-gray-600">
                    {formatTokens(c.total_tokens)}
                  </td>
                  <td className="py-2.5 text-right font-medium text-gray-900">
                    {formatCost(c.total_cost)}
                  </td>
                  <td className="py-2.5 text-right text-gray-600">{c.requests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
