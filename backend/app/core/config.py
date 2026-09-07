"""
KP Backend — Core Configuration
All settings loaded from environment variables via Pydantic Settings.
No hard-coded values. No machine-specific paths.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ── Project root (relative to this file) ────────────────────
_BACKEND_DIR = Path(__file__).parent.parent.parent  # backend/
_PROJECT_ROOT = _BACKEND_DIR.parent                  # KP-/


class Settings(BaseSettings):
    """
    All KP application settings.
    Values are loaded from environment variables.
    Defaults are safe for local development only — change in production.
    """

    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ─────────────────────────────────────────
    APP_NAME: str = "KP"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = Field(default="development", description="development | staging | production")
    DEBUG: bool = False
    SECRET_KEY: str = Field(
        default="INSECURE_DEV_ONLY_CHANGE_THIS",
        description="Random 64-char hex. MUST be changed in production.",
    )
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:8000"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    # ── Database ─────────────────────────────────────────────
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://kp_user:kp_dev_password@localhost:5432/kp_db",
        description="Async PostgreSQL connection URL",
    )
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_ECHO: bool = False

    # ── Redis ────────────────────────────────────────────────
    REDIS_URL: str = Field(default="redis://localhost:6379/0")
    REDIS_PASSWORD: str = ""
    REDIS_MAX_CONNECTIONS: int = 50

    # ── Data Directories (configurable, not hard-coded) ──────
    DATA_DIR: Path = Field(default=Path("./data/storage"))
    RAW_DATA_DIR: Path = Field(default=Path("./data/storage/raw"))
    MODEL_DIR: Path = Field(default=Path("./models"))
    LOG_DIR: Path = Field(default=Path("./logs"))
    EXPORT_DIR: Path = Field(default=Path("./data/exports"))

    @field_validator("DATA_DIR", "RAW_DATA_DIR", "MODEL_DIR", "LOG_DIR", "EXPORT_DIR", mode="before")
    @classmethod
    def resolve_path(cls, v: str | Path) -> Path:
        p = Path(v)
        if not p.is_absolute():
            p = _PROJECT_ROOT / p
        p.mkdir(parents=True, exist_ok=True)
        return p

    # ── Data Providers ───────────────────────────────────────
    DATA_PROVIDER: str = Field(default="yfinance", description="yfinance | zerodha | angel | fyers | mock")
    ZERODHA_API_KEY: str = ""
    ZERODHA_API_SECRET: str = ""
    ZERODHA_ACCESS_TOKEN: str = ""
    ANGEL_API_KEY: str = ""
    ANGEL_CLIENT_ID: str = ""
    ANGEL_PASSWORD: str = ""
    ANGEL_TOTP_SECRET: str = ""
    FYERS_APP_ID: str = ""
    FYERS_SECRET_KEY: str = ""
    FYERS_ACCESS_TOKEN: str = ""

    # ── News ─────────────────────────────────────────────────
    NEWS_PROVIDER: str = "none"
    NEWS_API_KEY: str = ""
    GNEWS_API_KEY: str = ""

    # ── Object Storage ───────────────────────────────────────
    OBJECT_STORAGE_ENABLED: bool = False
    OBJECT_STORAGE_ENDPOINT: str = "http://localhost:9000"
    OBJECT_STORAGE_KEY: str = ""
    OBJECT_STORAGE_SECRET: str = ""
    OBJECT_STORAGE_BUCKET: str = "kp-data"
    OBJECT_STORAGE_REGION: str = "ap-south-1"

    # ── LLM / AI Assistant ───────────────────────────────────
    LLM_PROVIDER: str = "none"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # ── Security / JWT ───────────────────────────────────────
    JWT_SECRET: str = Field(default="INSECURE_DEV_ONLY_CHANGE_THIS_JWT_SECRET")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_MINUTES: int = 60
    JWT_REFRESH_EXPIRY_DAYS: int = 30

    # ── Server ───────────────────────────────────────────────
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    FRONTEND_PORT: int = 3000
    WORKERS: int = 2

    # ── Feature Flags ────────────────────────────────────────
    FEATURE_FNO: bool = False
    FEATURE_NEWS: bool = False
    FEATURE_SENTIMENT: bool = False
    FEATURE_EARLY_MOVE: bool = False
    FEATURE_HISTORICAL_SIMILARITY: bool = False
    FEATURE_AI_ASSISTANT: bool = False
    FEATURE_PAPER_TRADING: bool = True
    FEATURE_BACKTESTING: bool = True
    FEATURE_MARKET_REPLAY: bool = False

    # ── Timezone ─────────────────────────────────────────────
    EXCHANGE_TIMEZONE: str = "Asia/Kolkata"
    SERVER_TIMEZONE: str = "Asia/Kolkata"

    # ── Logging ──────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    LOG_FILE: str = "./logs/kp.log"

    # ── Monitoring ───────────────────────────────────────────
    PROMETHEUS_ENABLED: bool = False
    PROMETHEUS_PORT: int = 9090

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"


@lru_cache()
def get_settings() -> Settings:
    """Return cached Settings instance. Call this throughout the app."""
    return Settings()


# ── Module-level singleton for convenience ───────────────────
settings: Settings = get_settings()
