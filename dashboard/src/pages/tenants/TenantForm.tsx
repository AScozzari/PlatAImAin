import { useState, useEffect, FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

export function TenantForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [plan, setPlan] = useState("starter");
  const [metadata, setMetadata] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: existing } = useQuery({
    queryKey: ["tenant", id],
    queryFn: () => adminApi.getTenant(id!).then((r) => r.data),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      const t = existing.tenant ?? existing;
      setName(t.name ?? "");
      setPlan(t.plan ?? "starter");
      setMetadata(t.metadata ? JSON.stringify(t.metadata, null, 2) : "");
    }
  }, [existing]);

  const createMutation = useMutation({
    mutationFn: (d: { name: string; plan: string; metadata?: object }) =>
      adminApi.createTenant(d),
    onSuccess: (res) => {
      const key = res.data?.api_key;
      if (key) {
        alert(`Tenant created!\n\nAPI Key:\n${key}\n\nStore it now — it won't be shown again.`);
      }
      qc.invalidateQueries({ queryKey: ["tenants"] });
      navigate("/tenants");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Error creating tenant";
      setError(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (d: object) => adminApi.updateTenant(id!, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["tenant", id] });
      navigate(`/tenants/${id}`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Error updating tenant";
      setError(msg);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    let parsedMeta: object | undefined;
    if (metadata.trim()) {
      try {
        parsedMeta = JSON.parse(metadata);
      } catch {
        setError("Metadata must be valid JSON");
        return;
      }
    }

    if (isEdit) {
      updateMutation.mutate({ name, plan, metadata: parsedMeta });
    } else {
      createMutation.mutate({ name, plan, metadata: parsedMeta });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-3">
        <Link
          to={isEdit ? `/tenants/${id}` : "/tenants"}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          {isEdit ? "Back" : "Tenants"}
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">
          {isEdit ? "Edit Tenant" : "New Tenant"}
        </h1>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="starter">Starter</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Metadata{" "}
              <span className="text-gray-400 font-normal">(optional JSON)</span>
            </label>
            <textarea
              value={metadata}
              onChange={(e) => setMetadata(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder='{"contact": "john@example.com"}'
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Tenant"}
            </button>
            <Link
              to={isEdit ? `/tenants/${id}` : "/tenants"}
              className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
