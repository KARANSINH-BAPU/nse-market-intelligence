"""
KP Migration 002 — OHLCV Tables

Adds:
  ohlcv_daily    — daily OHLCV bars per instrument
  ohlcv_intraday — intraday bars (1m, 5m, 15m, 30m, 1h) per instrument

No TimescaleDB — using standard PostgreSQL tables with composite indexes.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── ohlcv_daily ──────────────────────────────────────────────
    op.create_table(
        "ohlcv_daily",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("instrument_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("symbol", sa.String(30), nullable=False, index=True),
        sa.Column("exchange", sa.String(10), nullable=False, server_default="NSE"),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("open", sa.Numeric(12, 4), nullable=True),
        sa.Column("high", sa.Numeric(12, 4), nullable=True),
        sa.Column("low", sa.Numeric(12, 4), nullable=True),
        sa.Column("close", sa.Numeric(12, 4), nullable=False),
        sa.Column("volume", sa.BigInteger(), nullable=True),
        sa.Column("prev_close", sa.Numeric(12, 4), nullable=True),
        sa.Column("delivery_volume", sa.BigInteger(), nullable=True),
        sa.Column("source", sa.String(30), nullable=False, server_default="yfinance"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("symbol", "exchange", "trade_date", name="uq_ohlcv_daily_sym_date"),
        sa.ForeignKeyConstraint(
            ["instrument_id"], ["instruments.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_ohlcv_daily_symbol_date", "ohlcv_daily", ["symbol", "trade_date"])

    # ── ohlcv_intraday ────────────────────────────────────────────
    op.create_table(
        "ohlcv_intraday",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("instrument_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("symbol", sa.String(30), nullable=False),
        sa.Column("exchange", sa.String(10), nullable=False, server_default="NSE"),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("interval_mins", sa.SmallInteger(), nullable=False),  # 1,5,15,30,60
        sa.Column("open", sa.Numeric(12, 4), nullable=True),
        sa.Column("high", sa.Numeric(12, 4), nullable=True),
        sa.Column("low", sa.Numeric(12, 4), nullable=True),
        sa.Column("close", sa.Numeric(12, 4), nullable=False),
        sa.Column("volume", sa.BigInteger(), nullable=True),
        sa.Column("source", sa.String(30), nullable=False, server_default="yfinance"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "symbol", "exchange", "ts", "interval_mins",
            name="uq_ohlcv_intraday_sym_ts_interval",
        ),
        sa.ForeignKeyConstraint(
            ["instrument_id"], ["instruments.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_ohlcv_intraday_symbol_ts",
        "ohlcv_intraday",
        ["symbol", "interval_mins", "ts"],
    )


def downgrade() -> None:
    op.drop_table("ohlcv_intraday")
    op.drop_table("ohlcv_daily")
