import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, Loader2, Save, RefreshCw } from "lucide-react";

// ─── S3 Settings Tab ──────────────────────────────────────────────────────────
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
    onSuccess: (res) => setTestResult(res.data),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Access Key ID</Label>
          <Input
            type="password"
            placeholder="AKIA..."
            value={form["s3.access_key_id"]}
            onChange={(e) => setForm({ ...form, "s3.access_key_id": e.target.value })}
          />
        </div>
        <div>
          <Label>Secret Access Key</Label>
          <Input
            type="password"
            placeholder="••••••••"
            value={form["s3.secret_access_key"]}
            onChange={(e) => setForm({ ...form, "s3.secret_access_key": e.target.value })}
          />
        </div>
        <div>
          <Label>Region</Label>
          <Input
            placeholder="eu-west-1"
            value={form["s3.region"]}
            onChange={(e) => setForm({ ...form, "s3.region": e.target.value })}
          />
        </div>
        <div>
          <Label>Bucket Name</Label>
          <Input
            placeholder="my-bucket"
            value={form["s3.bucket_name"]}
            onChange={(e) => setForm({ ...form, "s3.bucket_name": e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <Label>Endpoint URL <span className="text-gray-400 text-xs">(opzionale — per MinIO / Cloudflare R2)</span></Label>
          <Input
            placeholder="https://s3.example.com"
            value={form["s3.endpoint_url"]}
            onChange={(e) => setForm({ ...form, "s3.endpoint_url": e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salva
        </Button>
        <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
          {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Test Connessione
        </Button>
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

// ─── RunPod Settings Tab ──────────────────────────────────────────────────────
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
    onSuccess: (res) => setTestResult(res.data),
  });

  const { data: gpuData } = useQuery({
    queryKey: ["gpu-types"],
    queryFn: () => adminApi.listGpuTypes(),
    select: (res) => res.data.gpu_types ?? [],
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>RunPod API Key</Label>
        <Input
          type="password"
          placeholder="rp_••••••••"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !apiKey}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salva
        </Button>
        <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
          {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Test + Lista GPU
        </Button>
        {testResult && (
          <span className={`flex items-center gap-1 text-sm ${testResult.ok ? "text-green-600" : "text-red-600"}`}>
            {testResult.ok
              ? <><CheckCircle className="h-4 w-4" /> Connesso ({testResult.gpu_types?.length ?? 0} GPU types)</>
              : <><XCircle className="h-4 w-4" /> {testResult.error}</>}
          </span>
        )}
      </div>

      {gpuData && gpuData.length > 0 && (
        <div className="mt-4">
          <Label className="text-xs text-gray-500 uppercase tracking-wide">GPU Types Disponibili</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(gpuData as { id: string; displayName: string; memoryInGb: number; securePrice: number; communityPrice: number }[]).map((gpu) => (
              <div key={gpu.id} className="border rounded-md p-2 text-sm">
                <div className="font-medium">{gpu.displayName}</div>
                <div className="text-gray-500">{gpu.memoryInGb}GB VRAM</div>
                <div className="text-xs text-gray-400">${gpu.securePrice}/h secure · ${gpu.communityPrice}/h community</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Registry Settings Tab ────────────────────────────────────────────────────
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Registry Docker self-hosted (registry:2 + S3 backend). Credenziali statiche, no rotation.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Registry URL</Label>
          <Input
            placeholder="registry.plataimain.internal:5001"
            value={form["registry.url"]}
            onChange={(e) => setForm({ ...form, "registry.url": e.target.value })}
          />
        </div>
        <div>
          <Label>Username</Label>
          <Input
            placeholder="admin"
            value={form["registry.username"]}
            onChange={(e) => setForm({ ...form, "registry.username": e.target.value })}
          />
        </div>
        <div>
          <Label>Password</Label>
          <Input
            type="password"
            placeholder="••••••••"
            value={form["registry.password"]}
            onChange={(e) => setForm({ ...form, "registry.password": e.target.value })}
          />
        </div>
      </div>
      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Salva
      </Button>
    </div>
  );
}

// ─── PII Settings Tab ─────────────────────────────────────────────────────────
function PiiSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["pii-toggles"],
    queryFn: () => adminApi.getPiiToggles(),
    select: (res) => res.data.toggles as Record<string, boolean>,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ entity_type, enabled }: { entity_type: string; enabled: boolean }) =>
      adminApi.togglePii(entity_type, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pii-toggles"] }),
  });

  const entityDescriptions: Record<string, string> = {
    CF:      "Codice Fiscale italiano",
    PIVA:    "Partita IVA italiana",
    IBAN:    "IBAN italiano (IT + 25 chars)",
    CC:      "Carta di credito (Visa, MC, Amex...)",
    EMAIL:   "Indirizzo email",
    PHONE:   "Telefono italiano (+39...)",
    ADDRESS: "Via/Corso/Piazza + numero civico",
    PERSON:  "Nome + Cognome (euristica maiuscole)",
  };

  if (isLoading) return <div className="text-sm text-gray-500">Caricamento...</div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Attiva o disattiva la tokenizzazione PII per categoria. I valori vengono sostituiti con token
        prima di inviare al modello e ripristinati nella risposta.
      </p>
      <div className="space-y-2">
        {Object.entries(entityDescriptions).map(([entity, desc]) => (
          <div key={entity} className="flex items-center justify-between py-2 border-b last:border-0">
            <div>
              <span className="font-mono text-sm font-medium">[{entity}_n]</span>
              <span className="ml-2 text-sm text-gray-500">{desc}</span>
            </div>
            <Switch
              checked={data?.[entity] ?? true}
              disabled={toggleMutation.isPending}
              onCheckedChange={(checked) => toggleMutation.mutate({ entity_type: entity, enabled: checked })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PlatformSettings() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
        <p className="text-gray-500 mt-1">
          Configura le integrazioni esterne. Tutti i valori sono cifrati AES-256-GCM nel database.
        </p>
      </div>

      <Tabs defaultValue="s3">
        <TabsList>
          <TabsTrigger value="s3">AWS S3</TabsTrigger>
          <TabsTrigger value="runpod">RunPod</TabsTrigger>
          <TabsTrigger value="registry">Docker Registry</TabsTrigger>
          <TabsTrigger value="pii">PII Tokenizer</TabsTrigger>
        </TabsList>

        <TabsContent value="s3">
          <Card>
            <CardHeader>
              <CardTitle>AWS S3 / S3-compatible</CardTitle>
              <CardDescription>
                Storage centralizzato per voice files tenant, billing reports e Docker registry layers.
                Supporta AWS S3, Cloudflare R2, MinIO.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <S3Settings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runpod">
          <Card>
            <CardHeader>
              <CardTitle>RunPod Integration</CardTitle>
              <CardDescription>
                API key per gestire il lifecycle dei pod (vLLM, STT, TTS) tramite RunPod REST + GraphQL API.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RunPodSettings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registry">
          <Card>
            <CardHeader>
              <CardTitle>Docker Registry</CardTitle>
              <CardDescription>
                Registry privato self-hosted (registry:2 + S3 backend). Credenziali statiche per i pod RunPod.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RegistrySettings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pii">
          <Card>
            <CardHeader>
              <CardTitle>PII Tokenizer</CardTitle>
              <CardDescription>
                Sanitizzazione GDPR-ready: le entità PII vengono tokenizzate prima di inviare al modello
                e ripristinate nella risposta. Zero dipendenze esterne, tutto on-premise.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PiiSettings />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
