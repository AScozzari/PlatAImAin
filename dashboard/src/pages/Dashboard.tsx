import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatTokens, formatCost } from "@/lib/utils";
import { TokenUsageChart } from "@/components/charts/TokenUsageChart";
import { CostChart } from "@/components/charts/CostChart";
import { Users, Zap, DollarSign, Activity } from "lucide-react";

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 font-medium">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

export function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["usage-overview"],
    queryFn: () => adminApi.usageOverview().then((r) => r.data),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-5 animate-pulse h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 bg-red-50 rounded-md px-4 py-3">
        Failed to load overview data.
      </div>
    );
  }

  const summary = data?.summary ?? {};
  const kpis = [
    {
      label: "Active Tenants",
      value: String(summary.active_tenants ?? 0),
      icon: Users,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Tokens This Month",
      value: formatTokens(summary.total_tokens ?? 0),
      icon: Zap,
      color: "bg-purple-50 text-purple-600",
    },
    {
      label: "Cost This Month",
      value: formatCost(summary.total_cost ?? 0),
      icon: DollarSign,
      color: "bg-green-50 text-green-600",
    },
    {
      label: "Requests This Month",
      value: formatTokens(summary.total_requests ?? 0),
      icon: Activity,
      color: "bg-orange-50 text-orange-600",
    },
  ];

  const dailyTokens = (data?.daily ?? []).map(
    (d: { date: string; tokens: number }) => ({
      date: d.date,
      tokens: d.tokens,
    })
  );

  // category breakdown derived from top_tenants for now (real overview doesn't include it)
  const categoryBreakdown: { category: string; cost: number }[] = [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Token Usage — Last 30 Days
          </h2>
          <TokenUsageChart data={dailyTokens} />
        </div>
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Cost by Category</h2>
          <CostChart data={categoryBreakdown} />
        </div>
      </div>

      {/* Top tenants */}
      {data?.top_tenants && data.top_tenants.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Top Tenants</h2>
          <div className="space-y-2">
            {data.top_tenants
              .slice(0, 5)
              .map((t: { tenant_name: string; tokens: number; cost: number }) => (
                <div
                  key={t.tenant_name}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <span className="text-sm font-medium text-gray-800">{t.tenant_name}</span>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{formatTokens(t.tokens)} tok</span>
                    <span className="text-gray-900 font-medium">{formatCost(t.cost)}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
