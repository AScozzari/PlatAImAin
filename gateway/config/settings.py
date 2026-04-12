from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_name: str = "Custom AI Gateway"
    debug: bool = False
    port: int = 8000

    # Database
    database_url: str = "postgresql://customai:customai@postgres:5432/customai"
    db_pool_min: int = 5
    db_pool_max: int = 20

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # vLLM backend URLs
    vllm_llm_url: str = "http://vllm-llm:8001"
    vllm_vision_url: str = "http://vllm-vision:8002"
    vllm_coding_url: str = "http://vllm-coding:8003"
    vllm_embedding_url: str = "http://vllm-embedding:8004"

    # Models config
    models_config_path: str = "models.config.json"

    # JWT Auth
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    bcrypt_rounds: int = 12
    max_sessions_per_user: int = 5

    # Session (for OAuth2 state)
    session_secret_key: str = "change-me-in-production-session"

    # OAuth2 Google
    oauth2_google_client_id: Optional[str] = None
    oauth2_google_client_secret: Optional[str] = None
    oauth2_google_redirect_uri: str = "http://localhost:8000/auth/oauth2/google/callback"

    # OAuth2 GitHub
    oauth2_github_client_id: Optional[str] = None
    oauth2_github_client_secret: Optional[str] = None
    oauth2_github_redirect_uri: str = "http://localhost:8000/auth/oauth2/github/callback"

    # Dashboard redirect URL (for OAuth2 callback)
    dashboard_url: str = "http://localhost:3000"

    # Type B — STT
    stt_enabled: bool = True
    whisper_model_path: str = "/models/stt/whisper-large-v3-turbo"
    whisper_device: str = "cuda"
    whisper_compute_type: str = "float16"

    # Type B — TTS XTTS V2
    tts_xtts_enabled: bool = True
    xtts_model_path: str = "/models/tts/xtts-v2"

    # Type B — TTS Kokoro
    tts_kokoro_enabled: bool = True
    kokoro_model_path: str = "/models/tts/kokoro-v1"

    # Type B — TTS StyleTTS2
    tts_stylett2_enabled: bool = False
    stylett2_model_path: str = "/models/tts/stylett2"

    # Voice storage
    voices_storage_path: str = "/data/voices"

    # Langfuse tracing
    langfuse_public_key: Optional[str] = None
    langfuse_secret_key: Optional[str] = None
    langfuse_host: str = "http://langfuse:3001"

    # Rate limits (requests per minute per tenant plan)
    rate_limit_starter: int = 60
    rate_limit_business: int = 300
    rate_limit_enterprise: int = 1000

    # Fallback provider
    fallback_enabled: bool = False
    fallback_openai_key: Optional[str] = None

    # Admin secret (for bootstrap endpoint)
    admin_secret: str = "change-me-in-production-admin"

    # Proxy HTTP timeout
    proxy_timeout_seconds: int = 300

    # Platform settings encryption (AES-256-GCM)
    # Must be a base64url-encoded 32-byte key: python -c "import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
    settings_encryption_key: str = "CHANGE_ME_generate_32_byte_base64url_key"

    # RunPod integration
    runpod_api_key: Optional[str] = None
    runpod_default_region: str = "EU"
    runpod_network_volume_id: Optional[str] = None
    runpod_saturation_threshold: int = 5  # vllm:num_requests_waiting > N → scale

    # AWS S3 / S3-compatible storage
    s3_access_key_id: Optional[str] = None
    s3_secret_access_key: Optional[str] = None
    s3_region: str = "eu-west-1"
    s3_bucket_name: Optional[str] = None
    s3_endpoint_url: Optional[str] = None  # None = AWS; set for MinIO/R2

    # Docker Registry
    registry_url: Optional[str] = None
    registry_username: Optional[str] = None
    registry_password: Optional[str] = None

    # Session manager tuning
    idle_check_interval_seconds: int = 300   # every 5 min
    schedule_check_interval_seconds: int = 60  # every 1 min
    health_check_interval_seconds: int = 30

    def get_rate_limit(self, plan: str) -> int:
        return {
            "starter": self.rate_limit_starter,
            "business": self.rate_limit_business,
            "enterprise": self.rate_limit_enterprise,
        }.get(plan, self.rate_limit_starter)


@lru_cache()
def get_settings() -> Settings:
    return Settings()
