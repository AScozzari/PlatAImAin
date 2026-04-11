import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { cn, statusColor } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertCircle, Clock, RefreshCw } from "lucide-react";

type ServiceStatus = {
  name: string;
  status: "healthy" | "degraded" | "unhealthy" | "loading" | "not_started";
  latency_ms?: number;
  message?: string;
  version?: string;
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  healthy: CheckCircle2,
  degraded: AlertCircle,
  unhealthy: XCircle,
  loading: Clock,
  not_started: Clock,
};

const STATUS_BG: Record<string, string> = {
  healthy: "bg-green-50 border-green-200",
  degraded: "bg-yellow-50 border-yellow-200",
  unhealthy: "bg-red-50 border-red-200",
  loading: "bg-blue-50 border-blue-200",
  not_started: "bg-gray-50 border-gray-200",
};

function ServiceCard({ service }: { service: ServiceStatus }) {
  const Icon = STATUS_ICONS[service.status] ?? AlertCircle;
  const bg = STATUS_BG[service.status] ?? "bg-gray-50 border-gray-200";
  const textColor = statusColor(service.status);

  return (
    <div className={cn("rounded-xl border p-4", bg)}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("w-5 h-5", textColor)} />
          <span className="font-semibold text-gray-900 text-sm">{service.name}</span>
        </div>
        {service.latency_ms !== undefined && (
          <span className="text-xs text-gray-500">{service.latency_ms}ms</span>
        )}
      </div>
      <p className={cn("text-xs font-medium capitalize", textColor)}>{service.status}</p>
      {service.message && (
        <p className="text-xs text-gray-500 mt-1">{service.message}</p>
      )}
      {service.version && (
        <p className="text-xs text-gray-400 mt-1">v{service.version}</p>
      )}
    </div>
  );
}

export function HealthDashboard() {
  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["health"],
    queryFn: () => adminApi.health().then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const services: ServiceStatus[] = data?.services ?? [];
  const overallStatus = data?.status ?? "loading";
  const modelsReady: boolean = data?.models_ready ?? false;

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Health</h1>
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full font-medium capitalize",
              overallStatus === "healthy"
                ? "bg-green-100 text-green-700"
                : overallStatus === "degraded"
                ? "bg-yellow-100 text-yellow-700"
                : overallStatus === "unhealthy"
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-600"
            )}
          >
            {overallStatus}
          </span>
          {!modelsReady && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
              Models loading…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {isFetching && <RefreshCw className="w-3 h-3 animate-spin" />}
          {lastUpdated && <span>Updated {lastUpdated} · auto-refresh 30s</span>}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-xl border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s) => (
            <ServiceCard key={s.name} service={s} />
          ))}
          {services.length === 0 && (
            <div className="col-span-3 text-center text-sm text-gray-400 py-8">
              No health data available.
            </div>
          )}
        </div>
      )}

      {/* Gateway info */}
      {data?.gateway_version && (
        <p className="text-xs text-gray-400">
          Gateway v{data.gateway_version} · {data.uptime_seconds
            ? `Uptime: ${Math.floor(data.uptime_seconds / 3600)}h ${Math.floor((data.uptime_seconds % 3600) / 60)}m`
            : ""}
        </p>
      )}
    </div>
  );
}
