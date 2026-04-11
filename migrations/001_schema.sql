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
