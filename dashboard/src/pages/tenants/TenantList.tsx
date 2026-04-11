import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi } from "@/lib/api";
import { formatTokens, formatDate, planBadgeColor } from "@/lib/utils";
import { Plus, RefreshCw, Key, ExternalLink } from "lucide-react";

type Tenant = {
  id: string;
  name: string;
  plan: string;
  is_active: boolean;
  created_at: string;
  monthly_tokens?: number;
  monthly_cost?: number;
};

export function TenantList() {
  const qc = useQueryClient();
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => adminApi.listTenants({ limit: 100 }).then((r) => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      adminApi.updateTenant(id, { is_active: active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });

  const regenMutation = useMutation({
    mutationFn: (id: string) => adminApi.regenerateApiKey(id),
    onSuccess: (res) => {
      alert(`New API key:\n\n${res.data.api_key}\n\nStore it now — it won't be shown again.`);
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
  });

  const tenants: Tenant[] = data?.tenants ?? [];

  const filtered = tenants.filter((t) => {
    if (planFilter && t.plan !== planFilter) return false;
    if (statusFilter === "active" && !t.is_active) return false;
    if (statusFilter === "inactive" && t.is_active) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Tenants</h1>
        <Link
          to="/tenants/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Tenant
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="text-sm border rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Plans</option>
          <option value="starter">Starter</option>
          <option value="business">Business</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  Tokens (month)
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${planBadgeColor(t.plan)}`}
                    >
                      {t.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {t.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {formatTokens(t.monthly_tokens ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() =>
                          toggleMutation.mutate({ id: t.id, active: !t.is_active })
                        }
                        title={t.is_active ? "Disable" : "Enable"}
                        className="p-1.5 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          confirm("Regenerate API key? The old key will stop working.") &&
                          regenMutation.mutate(t.id)
                        }
                        title="Regenerate API key"
                        className="p-1.5 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      >
                        <Key className="w-3.5 h-3.5" />
                      </button>
                      <Link
                        to={`/tenants/${t.id}`}
                        className="p-1.5 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No tenants found.
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
