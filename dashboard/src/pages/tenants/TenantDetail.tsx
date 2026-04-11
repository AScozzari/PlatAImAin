import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatDate, formatTokens, formatCost, planBadgeColor } from "@/lib/utils";
import { ArrowLeft, Edit } from "lucide-react";
import { TokenUsageChart } from "@/components/charts/TokenUsageChart";

export function TenantDetail() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["tenant", id],
    queryFn: () => adminApi.getTenant(id!).then((r) => r.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="h-48 bg-white rounded-xl border animate-pulse" />
      </div>
    );
  }

  if (!data) return <div className="text-sm text-gray-500">Tenant not found.</div>;

  const tenant = data.tenant ?? data;
  const dailyTokens = (data.daily_tokens ?? []).map(
    (d: { date: string; total_tokens: number }) => ({
      date: d.date,
      tokens: d.total_tokens,
    })
  );

  return (
    <div className="space-y-5">
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <Link
          to="/tenants"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Tenants
        </Link>
        <Link
          to={`/tenants/${id}/edit`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Edit className="w-3.5 h-3.5" />
          Edit
        </Link>
      </div>

      {/* Info card */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{tenant.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{tenant.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${planBadgeColor(tenant.plan)}`}
            >
              {tenant.plan}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                tenant.is_active
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {tenant.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500 mb-0.5">Created</p>
            <p className="font-medium">{formatDate(tenant.created_at)}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-0.5">Monthly Tokens</p>
            <p className="font-medium">{formatTokens(data.monthly_tokens ?? 0)}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-0.5">Monthly Cost</p>
            <p className="font-medium">{formatCost(data.monthly_cost ?? 0)}</p>
          </div>
        </div>
      </div>

      {/* Quota */}
      {data.quota && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Quota</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {Object.entries(data.quota).map(([k, v]) => (
              <div key={k}>
                <p className="text-gray-500 mb-0.5 capitalize">{k.replace(/_/g, " ")}</p>
                <p className="font-medium">{v === 0 ? "Unlimited" : formatTokens(v as number)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usage chart */}
      {dailyTokens.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Token Usage — Last 30 Days
          </h2>
          <TokenUsageChart data={dailyTokens} />
        </div>
      )}

      {/* Assigned models */}
      {data.models && data.models.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Assigned Models</h2>
          <div className="flex flex-wrap gap-2">
            {data.models.map((m: { model_id: string }) => (
              <span
                key={m.model_id}
                className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-md"
              >
                {m.model_id}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
