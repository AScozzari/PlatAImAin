-- Custom AI Platform — Database Schema
-- Run in order: all tables created with IF NOT EXISTS for idempotency

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Admin Users ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

-- ─── Refresh Tokens ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    device_info VARCHAR(500),
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, revoked_at);

-- ─── OAuth2 Accounts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oauth2_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    provider_email VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth2_user ON oauth2_accounts(user_id);

-- ─── Tenants ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL UNIQUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'starter',
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_api_key_hash ON tenants(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan);

-- ─── Tenant Quotas ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    model_category VARCHAR(50) NOT NULL,
    model_id VARCHAR(100),
    monthly_token_limit BIGINT NOT NULL DEFAULT 0,      -- 0 = unlimited
    monthly_audio_seconds_limit FLOAT NOT NULL DEFAULT 0, -- 0 = unlimited
    monthly_char_limit BIGINT NOT NULL DEFAULT 0,       -- for TTS chars; 0 = unlimited
    reset_day INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, model_category, model_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_quotas_tenant ON tenant_quotas(tenant_id);

-- ─── Models ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS models (
    id VARCHAR(100) PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    hf_repo VARCHAR(300),
    description TEXT,
    tier VARCHAR(20),
    min_plan VARCHAR(20) NOT NULL DEFAULT 'starter',
    strengths JSONB NOT NULL DEFAULT '[]',
    languages JSONB NOT NULL DEFAULT '[]',
    tags JSONB NOT NULL DEFAULT '[]',
    capabilities JSONB NOT NULL DEFAULT '{}',
    context_window INT,
    parameters_b FLOAT,
    dimensions INT,
    vram_gb FLOAT,
    quantization VARCHAR(20),
    speed VARCHAR(20),
    quality VARCHAR(20),
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    deprecated BOOLEAN NOT NULL DEFAULT false,
    extra_config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_models_category ON models(category);
CREATE INDEX IF NOT EXISTS idx_models_plan ON models(min_plan);

-- ─── Tenant Model Assignments ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_model_assignments (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    model_id VARCHAR(100) NOT NULL REFERENCES models(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(tenant_id, category)
);

-- ─── Model Pricing ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_pricing (
    model_id VARCHAR(100) PRIMARY KEY REFERENCES models(id),
    -- stored as micro-USD per 1K tokens/units to avoid float precision issues
    input_cost_per_1k_micro INT NOT NULL DEFAULT 0,
    output_cost_per_1k_micro INT NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Token Usage ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    model_id VARCHAR(100) NOT NULL,
    model_category VARCHAR(50) NOT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
    audio_seconds FLOAT NOT NULL DEFAULT 0,
    characters_count INT NOT NULL DEFAULT 0,
    -- cost in micro-USD
    cost_micro INT NOT NULL DEFAULT 0,
    request_id VARCHAR(100),
    agent_id VARCHAR(100),
    session_id VARCHAR(100),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_date ON token_usage(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_model ON token_usage(tenant_id, model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_category ON token_usage(model_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_created ON token_usage(created_at DESC);

-- ─── Tenant Voices ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_voices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    voice_name VARCHAR(100) NOT NULL,
    voice_file_path VARCHAR(500),
    speaker_embedding BYTEA,
    is_default BOOLEAN NOT NULL DEFAULT false,
    language VARCHAR(10) NOT NULL DEFAULT 'it',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, voice_name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_voices_tenant ON tenant_voices(tenant_id);

-- ─── Updated_at triggers ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_admin_users_updated_at
        BEFORE UPDATE ON admin_users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_tenants_updated_at
        BEFORE UPDATE ON tenants
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_models_updated_at
        BEFORE UPDATE ON models
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Pricing currency support ─────────────────────────────────────────────────
ALTER TABLE model_pricing ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'EUR';
ALTER TABLE token_usage   ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'EUR';

-- History table: keep all price changes with timestamps
CREATE TABLE IF NOT EXISTS model_pricing_history (
    id            BIGSERIAL PRIMARY KEY,
    model_id      VARCHAR(100) NOT NULL,
    input_cost_per_1k_micro  INT NOT NULL,
    output_cost_per_1k_micro INT NOT NULL,
    currency      VARCHAR(3)  NOT NULL DEFAULT 'EUR',
    changed_by    VARCHAR(255),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pricing_history_model ON model_pricing_history(model_id, effective_from DESC);

-- ─── Model Sessions ───────────────────────────────────────────────────────────
-- One row = one running process (vLLM, stt-service, tts-service instance)
-- Multiple sessions for the same model → round-robin load balancing
CREATE TABLE IF NOT EXISTS model_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id VARCHAR(100) NOT NULL REFERENCES models(id),
    backend_url VARCHAR(500) NOT NULL,
    gpu_ids TEXT[] NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'stopped',  -- running|stopped|loading|error
    tensor_parallel_size INT NOT NULL DEFAULT 1,
    max_model_len INT,
    started_at TIMESTAMPTZ,
    stopped_at TIMESTAMPTZ,
    started_by VARCHAR(255),
    extra_config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_sessions_model ON model_sessions(model_id, status);
CREATE INDEX IF NOT EXISTS idx_model_sessions_status ON model_sessions(status);

DO $$ BEGIN
    CREATE TRIGGER trg_model_sessions_updated_at
        BEFORE UPDATE ON model_sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Platform Settings (cifrate AES-256 nel gateway) ─────────────────────────
-- Chiavi: s3.*, runpod.*, registry.*, general.*
CREATE TABLE IF NOT EXISTS platform_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT NOT NULL,              -- JSON cifrato con AES-256
    category    VARCHAR(50) NOT NULL,       -- s3 | runpod | registry | general
    description VARCHAR(500),
    updated_by  VARCHAR(255),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Pod Definitions ──────────────────────────────────────────────────────────
-- Un pod RunPod = immagine Docker + modello precaricato su Network Volume
-- 1 pod definition = 1 configurazione di deployment
CREATE TABLE IF NOT EXISTS pod_definitions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 VARCHAR(100) NOT NULL,
    model_id             VARCHAR(100) NOT NULL REFERENCES models(id),
    worker_type          VARCHAR(20) NOT NULL DEFAULT 'vllm',
    -- vllm | stt_worker | tts_worker | custom

    -- RunPod identifiers
    runpod_pod_id        VARCHAR(100),      -- NULL finché non creato su RunPod
    runpod_template_id   VARCHAR(100),
    docker_image         VARCHAR(300) NOT NULL,  -- es. ghcr.io/org/vllm-qwen:tag
    network_volume_id    VARCHAR(100),      -- RunPod Network Volume (pesi modello)

    -- Hardware (da gpuTypes GraphQL query RunPod)
    gpu_type             VARCHAR(50),       -- A100_SXM4_80GB | RTX4090 | ecc.
    gpu_count            INT NOT NULL DEFAULT 1,
    vram_gb              FLOAT NOT NULL,
    container_disk_gb    INT NOT NULL DEFAULT 20,
    region               VARCHAR(50) NOT NULL DEFAULT 'EU',

    -- Lifecycle policy
    session_type         VARCHAR(20) NOT NULL DEFAULT 'idle',
    -- idle       = spegni dopo idle_timeout_minutes di inattività
    -- persistent = mai spegnere (always-on)
    -- fallback   = attiva solo se tutti gli altri sono saturi/in errore
    -- scheduled  = finestre orarie (cron) + pre-warm
    idle_timeout_minutes INT NOT NULL DEFAULT 30,
    schedule_cron        VARCHAR(50),       -- es. "0 8 * * 1-5" (lun-ven ore 8)
    schedule_stop_cron   VARCHAR(50),       -- es. "0 20 * * 1-5" (lun-ven ore 20)
    prewarm_minutes      INT NOT NULL DEFAULT 15,
    priority             INT NOT NULL DEFAULT 100,
    -- priorità nel pool: più basso = preferito

    -- Runtime state (aggiornato dal session manager)
    pod_status           VARCHAR(20) NOT NULL DEFAULT 'stopped',
    -- stopped | starting | running | error | scaling
    backend_url          VARCHAR(500),      -- endpoint quando running
    last_request_at      TIMESTAMPTZ,
    started_at           TIMESTAMPTZ,
    started_by           VARCHAR(255),
    extra_config         JSONB NOT NULL DEFAULT '{}',

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pod_def_model   ON pod_definitions(model_id, pod_status);
CREATE INDEX IF NOT EXISTS idx_pod_def_type    ON pod_definitions(session_type, pod_status);
CREATE INDEX IF NOT EXISTS idx_pod_def_worker  ON pod_definitions(worker_type, pod_status);

DO $$ BEGIN
    CREATE TRIGGER trg_pod_definitions_updated_at
        BEFORE UPDATE ON pod_definitions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Conversations (sessione logica multi-componente) ─────────────────────────
-- Una conversazione vocale = STT + LLM + TTS assegnati con affinity
CREATE TABLE IF NOT EXISTS conversations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    warm_state    VARCHAR(20) NOT NULL DEFAULT 'active',
    -- active | idle | closed
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant   ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_activity ON conversations(last_activity DESC);

-- ─── Conversation Workers (session affinity: conv → pod pinned) ──────────────
CREATE TABLE IF NOT EXISTS conversation_workers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    model_class       VARCHAR(20) NOT NULL,  -- llm | stt | tts
    pod_definition_id UUID NOT NULL REFERENCES pod_definitions(id),
    model_id          VARCHAR(100) NOT NULL,
    last_activity     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(conversation_id, model_class)
);

CREATE INDEX IF NOT EXISTS idx_conv_workers_conv ON conversation_workers(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_workers_pod  ON conversation_workers(pod_definition_id);

-- ─── token_usage — aggiunta colonne compute cost ─────────────────────────────
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS pod_definition_id UUID REFERENCES pod_definitions(id);
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS compute_cost_micro INT NOT NULL DEFAULT 0;
-- costo GPU-hour × tariffa RunPod in micro-EUR
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS gpu_seconds FLOAT NOT NULL DEFAULT 0;
