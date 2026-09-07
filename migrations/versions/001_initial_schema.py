"""
KP Database Migration — 001 Initial Core Schema

Creates:
  - users, roles
  - instruments (NSE instrument master)
  - sectors, industries
  - market_sessions
  - system_health table
  - audit_logs table
  - data_quality table

NOTE: PostgreSQL 18 is installed. TimescaleDB does not yet support PG18.
Hypertables are deferred to a later migration when TimescaleDB adds PG18 support.
All time-series tables use standard PostgreSQL TIMESTAMPTZ with date-range partitioning.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# ── Revision identifiers ────────────────────────────────────
revision: str = "001"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ── Enable extensions ────────────────────────────────────────────
    # TimescaleDB not available for PG18 yet — skipping
    # Will be added in migration 002 once TimescaleDB supports PG18
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # ── sectors ──────────────────────────────────────────────
    op.create_table(
        "sectors",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("nse_sector_name", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ── industries ───────────────────────────────────────────
    op.create_table(
        "industries",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("sector_id", sa.Integer(), sa.ForeignKey("sectors.id"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ── instruments (NSE instrument master) ──────────────────
    op.create_table(
        "instruments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("exchange", sa.String(10), nullable=False, default="NSE"),
        sa.Column("symbol", sa.String(50), nullable=False),
        sa.Column("company_name", sa.String(300), nullable=True),
        sa.Column("isin", sa.String(20), nullable=True),
        sa.Column("sector_id", sa.Integer(), sa.ForeignKey("sectors.id"), nullable=True),
        sa.Column("industry_id", sa.Integer(), sa.ForeignKey("industries.id"), nullable=True),
        sa.Column("instrument_type", sa.String(30), nullable=False, default="EQ"),
        # EQ, FUT, OPT, INDEX, ETF, SGB, BOND
        sa.Column("active", sa.Boolean(), nullable=False, default=True),
        sa.Column("listed_at", sa.Date(), nullable=True),
        sa.Column("delisted_at", sa.Date(), nullable=True),
        sa.Column("market_cap_category", sa.String(20), nullable=True),
        # LARGE, MID, SMALL
        sa.Column("fno_eligible", sa.Boolean(), nullable=False, default=False),
        sa.Column("provider_tokens", JSONB(), nullable=True),
        # {"yfinance": "RELIANCE.NS", "zerodha": 738561, ...}
        sa.Column("meta", JSONB(), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_unique_constraint("uq_instruments_exchange_symbol", "instruments", ["exchange", "symbol"])
    op.create_index("ix_instruments_symbol", "instruments", ["symbol"])
    op.create_index("ix_instruments_isin", "instruments", ["isin"])
    op.create_index("ix_instruments_active", "instruments", ["active"])
    op.create_index("ix_instruments_fno", "instruments", ["fno_eligible"])

    # ── users ────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("username", sa.String(100), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, default="user"),
        # user | researcher | admin
        sa.Column("is_active", sa.Boolean(), nullable=False, default=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False, default=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # ── market_sessions ──────────────────────────────────────
    op.create_table(
        "market_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("exchange", sa.String(10), nullable=False, default="NSE"),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("session_type", sa.String(30), nullable=False, default="REGULAR"),
        # REGULAR, SPECIAL, MUHURAT
        sa.Column("status", sa.String(30), nullable=False, default="UNKNOWN"),
        # SCHEDULED, OPEN, CLOSED, HOLIDAY, CANCELLED
        sa.Column("pre_open_start", sa.Time(timezone=True), nullable=True),
        sa.Column("open_time", sa.Time(timezone=True), nullable=True),
        sa.Column("close_time", sa.Time(timezone=True), nullable=True),
        sa.Column("data_quality_score", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_unique_constraint("uq_sessions_exchange_date", "market_sessions", ["exchange", "session_date"])
    op.create_index("ix_sessions_date", "market_sessions", ["session_date"])

    # ── data_quality ─────────────────────────────────────────
    op.create_table(
        "data_quality",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("symbol", sa.String(50), nullable=True),
        sa.Column("session_date", sa.Date(), nullable=True),
        sa.Column("check_type", sa.String(50), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("passed", sa.Boolean(), nullable=False, default=True),
        sa.Column("details", JSONB(), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_dq_source_date", "data_quality", ["source", "session_date"])
    op.create_index("ix_dq_symbol", "data_quality", ["symbol"])

    # ── audit_logs ───────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=True),
        sa.Column("resource_id", sa.String(100), nullable=True),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("details", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_audit_user", "audit_logs", ["user_id"])
    op.create_index("ix_audit_action", "audit_logs", ["action"])
    op.create_index("ix_audit_created", "audit_logs", ["created_at"])

    # ── system_health ────────────────────────────────────────────
    op.create_table(
        "system_health",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("component", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        # online | degraded | offline
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column("detail", JSONB(), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    # NOTE: TimescaleDB hypertable deferred until PG18 support is added
    # op.execute("SELECT create_hypertable('system_health', 'checked_at', ...)")
    op.create_index("ix_syshealth_component", "system_health", ["component", "checked_at"])

    # ── watchlists ───────────────────────────────────────────
    op.create_table(
        "watchlists",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, default=False),
        sa.Column("symbols", JSONB(), nullable=False, default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_watchlists_user", "watchlists", ["user_id"])

    # ── models registry ──────────────────────────────────────
    op.create_table(
        "ml_models",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column("model_type", sa.String(50), nullable=False),
        # xgboost | lgbm | lstm | transformer | ensemble
        sa.Column("target", sa.String(50), nullable=False),
        # direction | return | volatility
        sa.Column("horizon", sa.String(20), nullable=False),
        # 1m | 5m | 15m | 1h | 1d
        sa.Column("status", sa.String(20), nullable=False, default="training"),
        # training | validated | deployed | retired | failed
        sa.Column("training_start", sa.Date(), nullable=True),
        sa.Column("training_end", sa.Date(), nullable=True),
        sa.Column("validation_start", sa.Date(), nullable=True),
        sa.Column("validation_end", sa.Date(), nullable=True),
        sa.Column("feature_version", sa.String(50), nullable=True),
        sa.Column("metrics", JSONB(), nullable=True),
        sa.Column("artifact_path", sa.String(500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("deployed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_unique_constraint("uq_model_name_version", "ml_models", ["name", "version"])
    op.create_index("ix_models_status", "ml_models", ["status"])


def downgrade() -> None:
    op.drop_table("ml_models")
    op.drop_table("watchlists")
    op.drop_table("system_health")
    op.drop_table("audit_logs")
    op.drop_table("data_quality")
    op.drop_table("market_sessions")
    op.drop_table("users")
    op.drop_table("instruments")
    op.drop_table("industries")
    op.drop_table("sectors")
