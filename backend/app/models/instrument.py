"""
KP Backend — Instrument ORM Model
Matches actual DB schema from migration 001.
"""
from __future__ import annotations

from datetime import datetime
from datetime import date

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, Integer, String, Text
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Instrument(Base, TimestampMixin):
    """
    NSE Instrument Master — matches the DB schema from migration 001.
    sector_id / industry_id are integer FKs (not UUID) as defined in the migration.
    """
    __tablename__ = "instruments"

    # PK is UUID in the DB
    id: Mapped[str] = mapped_column(String(36), primary_key=True)

    # Core identity
    symbol: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    company_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    isin: Mapped[str | None] = mapped_column(String(12), nullable=True, index=True)
    exchange: Mapped[str] = mapped_column(String(10), nullable=False, default="NSE")
    instrument_type: Mapped[str] = mapped_column(String(20), nullable=False, default="EQ")

    # Classification
    sector_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    industry_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    market_cap_category: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # LARGE | MID | SMALL | MICRO

    # Trading attributes
    fno_eligible: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    # Dates
    listed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    delisted_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    first_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Flexible JSON fields
    provider_tokens: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # stores: nse_token, bse_code, yfinance_symbol etc.
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    def __repr__(self) -> str:
        return f"<Instrument {self.symbol}:{self.exchange}>"

    @property
    def display_name(self) -> str:
        return f"{self.symbol} — {self.company_name or 'Unknown'}"

    @property
    def is_active(self) -> bool:
        """Alias for template compatibility."""
        return self.active
