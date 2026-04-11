import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatTokens, formatCost, formatDateShort } from "@/lib/utils";
import { TokenUsageChart } from "@/components/charts/TokenUsageChart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Link } from "react-router-dom";

const CATEGORY_COLORS: Record<string, string> = {
  llm: "#3b82f6",
  reasoning: "#8b5cf6",
  coding: "#06b6d4",
  vision: "#10b981",
  stt: "#f59e0b",
  tts: "#f97316",
  embedding: "#6b7280",
};

export function UsageOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["usage-overview"],
    queryFn: () => adminApi.usageOverview().then((r) => r.data),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Usage</h1>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-48 bg-white rounded-xl border animate-pulse" />
        ))}
      </div>
    );
  }

  const dailyTokens = (data?.daily ?? []).map(
    (d: { date: string; tokens: number }) => ({
      date: d.date,
      tokens: d.tokens,
    })
  );

  const hourlyReqs = (data?.hourly_requests ?? []).map(
    (d: { hour: string; requests: number }) => ({
      hour: d.hour,
      requests: d.requests,
    })
  );

  // category breakdown not in overview endpoint; could be derived from billing
  const categoryBreakdown: { category: string; tokens: number }[] = [];

  const topTenants = data?.top_tenants ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">Usage</h1>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Global Tokens / Day — Last 30 Days
          </h2>
          <TokenUsageChart data={dailyTokens} />
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Tokens by Category
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={categoryBreakdown}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={formatTokens}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip formatter={(v: number) => [formatTokens(v), "Tokens"]} />
              <Bar dataKey="tokens" radius={[4, 4, 0, 0]}>
                {categoryBreakdown.map((entry: { category: string }) => (
                  <Cell
                    key={entry.category}
                    fill={CATEGORY_COLORS[entry.category] ?? "#6b7280"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hourly requests chart */}
      {hourlyReqs.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Requests / Hour — Last 24h
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourlyReqs} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(h) => h.slice(11, 16)}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip labelFormatter={(l) => `${String(l).slice(11, 16)}`} />
              <Bar dataKey="requests" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top tenants */}
      {topTenants.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Top Tenants</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left pb-2 font-medium text-gray-600">Tenant</th>
                <th className="text-right pb-2 font-medium text-gray-600">Tokens</th>
                <th className="text-right pb-2 font-medium text-gray-600">Cost</th>
                <th className="text-right pb-2 font-medium text-gray-600">Requests</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {topTenants.map(
                (t: {
                  tenant_id: string;
                  tenant_name: string;
                  tokens: number;
                  cost: number;
                  requests: number;
                }) => (
                  <tr key={t.tenant_id} className="border-b last:border-0">
                    <td className="py-2.5 font-medium text-gray-800">{t.tenant_name}</td>
                    <td className="py-2.5 text-right text-gray-600">
                      {formatTokens(t.tokens)}
                    </td>
                    <td className="py-2.5 text-right text-gray-900 font-medium">
                      {formatCost(t.cost)}
                    </td>
                    <td className="py-2.5 text-right text-gray-600">{t.requests}</td>
                    <td className="py-2.5 text-right">
                      <Link
                        to={`/usage/${t.tenant_id}`}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
