import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { CheckCircle, XCircle, Loader2, Save, RefreshCw } from "lucide-react";

const inputCls = "w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-xs font-medium text-gray-700 mb-1";
const btnPrimary = "inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors";
const btnOutline = "inline-flex items-center gap-1.5 px-4 py-2 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors";

// ─── S3 Settings ──────────────────────────────────────────────────────────────
function S3Settings() {
  const [form, setForm] = useState({
    "s3.access_key_id": "",
    "s3.secret_access_key": "",
    "s3.region": "eu-west-1",
    "s3.bucket_name": "",
    "s3.endpoint_url": "",
  });
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; bucket?: string } | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => {
      const settings: Record<string, string> = {};
      for (const [key, value] of Object.entries(form)) {
        if (value) settings[key] = value;
      }
      return adminApi.upsertSettingsBulk({ settings, category: "s3" });
    },
    onSuccess: () => setTestResult(null),
  });

  const testMutation = useMutation({
    mutationFn: () => adminApi.testS3(),
    onSuccess: (res: { data: { ok: boolean; error?: string; bucket?: string } }) => setTestResult(res.data),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Access Key ID</label>
          <input type="password" className={inputCls} placeholder="AKIA..." value={form["s3.access_key_id"]} onChange={set("s3.access_key_id")} />
        </div>
        <div>
          <label className={labelCls}>Secret Access Key</label>
          <input type="password" className={inputCls} placeholder="••••••••" value={form["s3.secret_access_key"]} onChange={set("s3.secret_access_key")} />
        </div>
        <div>
          <label className={labelCls}>Region</label>
          <input className={inputCls} placeholder="eu-west-1" value={form["s3.region"]} onChange={set("s3.region")} />
        </div>
        <div>
          <label className={labelCls}>Bucket Name</label>
          <input className={inputCls} placeholder="my-bucket" value={form["s3.bucket_name"]} onChange={set("s3.bucket_name")} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>
            Endpoint URL <span className="text-gray-400 font-normal">(opzionale — per MinIO / Cloudflare R2)</span>
          </label>
          <input className={inputCls} placeholder="https://s3.example.com" value={form["s3.endpoint_url"]} onChange={set("s3.endpoint_url")} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className={btnPrimary} onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salva
        </button>
        <button className={btnOutline} onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
          {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Test Connessione
        </button>
        {testResult && (
          <span className={`flex items-center gap-1 text-sm ${testResult.ok ? "text-green-600" : "text-red-600"}`}>
            {testResult.ok
              ? <><CheckCircle className="h-4 w-4" /> Connesso ({testResult.bucket})</>
              : <><XCircle className="h-4 w-4" /> {testResult.error}</>}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── RunPod Settings ──────────────────────────────────────────────────────────
function RunPodSettings() {
  const [apiKey, setApiKey] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; gpu_types?: unknown[] } | null>(null);

  const saveMutation = useMutation({
    mutationFn: () =>
      adminApi.upsertSettingsBulk({ settings: { "runpod.api_key": apiKey }, category: "runpod" }),
    onSuccess: () => setTestResult(null),
  });

  const testMutation = useMutation({
    mutationFn: () => adminApi.testRunpod(),
    onSuccess: (res: { data: { ok: boolean; error?: string; gpu_types?: unknown[] } }) => setTestResult(res.data),
  });

  const { data: gpuData } = useQuery({
    queryKey: ["gpu-types"],
    queryFn: () => adminApi.listGpuTypes(),
    select: (res: { data: { gpu_types?: { id: string; displayName: string; memoryInGb: number; securePrice: number; communityPrice: number }[] } }) =>
      res.data.gpu_types ?? [],
  });

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>RunPod API Key</label>
        <input
          type="password"
          className={inputCls}
          placeholder="rp_••••••••"
          value={apiKey}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <button className={btnPrimary} onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !apiKey}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salva
        </button>
        <button className={btnOutline} onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
          {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Test + Lista GPU
        </button>
        {testResult && (
          <span className={`flex items-center gap-1 text-sm ${testResult.ok ? "text-green-600" : "text-red-600"}`}>
            {testResult.ok
              ? <><CheckCircle className="h-4 w-4" /> Connesso ({testResult.gpu_types?.length ?? 0} GPU types)</>
              : <><XCircle className="h-4 w-4" /> {testResult.error}</>}
          </span>
        )}
      </div>
      {gpuData && gpuData.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">GPU Types Disponibili</p>
          <div className="grid grid-cols-2 gap-2">
            {gpuData.map((gpu) => (
              <div key={gpu.id} className="border rounded-md p-2 text-sm">
                <div className="font-medium">{gpu.displayName}</div>
                <div className="text-gray-500 text-xs">{gpu.memoryInGb}GB VRAM</div>
                <div className="text-gray-400 text-xs">${gpu.securePrice}/h secure · ${gpu.communityPrice}/h community</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Registry Settings ────────────────────────────────────────────────────────
function RegistrySettings() {
  const [form, setForm] = useState({ "registry.url": "", "registry.username": "", "registry.password": "" });

  const saveMutation = useMutation({
    mutationFn: () => {
      const settings: Record<string, string> = {};
      for (const [key, value] of Object.entries(form)) {
        if (value) settings[key] = value;
      }
      return adminApi.upsertSettingsBulk({ settings, category: "registry" });
    },
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Registry Docker self-hosted (registry:2 + S3 backend). Credenziali statiche, no rotation.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={labelCls}>Registry URL</label>
          <input className={inputCls} placeholder="registry.plataimain.internal:5001" value={form["registry.url"]} onChange={set("registry.url")} />
        </div>
        <div>
          <label className={labelCls}>Username</label>
          <input className={inputCls} placeholder="admin" value={form["registry.username"]} onChange={set("registry.username")} />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <input type="password" className={inputCls} placeholder="••••••••" value={form["registry.password"]} onChange={set("registry.password")} />
        </div>
      </div>
      <button className={btnPrimary} onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salva
      </button>
    </div>
  );
}

// ─── PII Settings ─────────────────────────────────────────────────────────────
const PII_LABELS: Record<string, string> = {
  CF:      "Codice Fiscale italiano",
  PIVA:    "Partita IVA italiana",
  IBAN:    "IBAN italiano (IT + 25 chars)",
  CC:      "Carta di credito (Visa, MC, Amex...)",
  EMAIL:   "Indirizzo email",
  PHONE:   "Telefono italiano (+39...)",
  ADDRESS: "Via/Corso/Piazza + numero civico",
  PERSON:  "Nome + Cognome (euristica maiuscole)",
};

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${checked ? "bg-blue-600" : "bg-gray-200"}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

function PiiSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["pii-toggles"],
    queryFn: () => adminApi.getPiiToggles(),
    select: (res: { data: { toggles: Record<string, boolean> } }) => res.data.toggles,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ entity_type, enabled }: { entity_type: string; enabled: boolean }) =>
      adminApi.togglePii(entity_type, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pii-toggles"] }),
  });

  if (isLoading) return <div className="text-sm text-gray-500">Caricamento...</div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Attiva o disattiva la tokenizzazione PII per categoria. I valori vengono sostituiti con token
        prima di inviare al modello e ripristinati nella risposta.
      </p>
      <div className="space-y-1">
        {Object.entries(PII_LABELS).map(([entity, desc]) => (
          <div key={entity} className="flex items-center justify-between py-2.5 border-b last:border-0">
            <div>
              <span className="font-mono text-sm font-medium">[{entity}_n]</span>
              <span className="ml-2 text-sm text-gray-500">{desc}</span>
            </div>
            <Toggle
              checked={data?.[entity] ?? true}
              disabled={toggleMutation.isPending}
              onChange={(enabled) => toggleMutation.mutate({ entity_type: entity, enabled })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
type Tab = "s3" | "runpod" | "registry" | "pii";
const TABS: { id: Tab; label: string }[] = [
  { id: "s3",       label: "AWS S3" },
  { id: "runpod",   label: "RunPod" },
  { id: "registry", label: "Docker Registry" },
  { id: "pii",      label: "PII Tokenizer" },
];

const TAB_DESCRIPTIONS: Record<Tab, { title: string; description: string }> = {
  s3: {
    title: "AWS S3 / S3-compatible",
    description: "Storage centralizzato per voice files tenant, billing reports e Docker registry layers. Supporta AWS S3, Cloudflare R2, MinIO.",
  },
  runpod: {
    title: "RunPod Integration",
    description: "API key per gestire il lifecycle dei pod (vLLM, STT, TTS) tramite RunPod REST + GraphQL API.",
  },
  registry: {
    title: "Docker Registry",
    description: "Registry privato self-hosted (registry:2 + S3 backend). Credenziali statiche per i pod RunPod.",
  },
  pii: {
    title: "PII Tokenizer",
    description: "Sanitizzazione GDPR-ready: le entità PII vengono tokenizzate prima di inviare al modello e ripristinate nella risposta. Zero dipendenze esterne, tutto on-premise.",
  },
};

export function PlatformSettings() {
  const [activeTab, setActiveTab] = useState<Tab>("s3");
  const { title, description } = TAB_DESCRIPTIONS[activeTab];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
        <p className="text-gray-500 mt-1">
          Configura le integrazioni esterne. Tutti i valori sono cifrati AES-256-GCM nel database.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-white border rounded-xl p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        </div>
        {activeTab === "s3"       && <S3Settings />}
        {activeTab === "runpod"   && <RunPodSettings />}
        {activeTab === "registry" && <RegistrySettings />}
        {activeTab === "pii"      && <PiiSettings />}
      </div>
    </div>
  );
}
