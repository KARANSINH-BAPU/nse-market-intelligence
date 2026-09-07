"""
KP Backend — Pydantic Schemas: Instruments
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import Field

from app.schemas.base import KPBaseSchema, TimestampSchema, UUIDSchema


class InstrumentBase(KPBaseSchema):
    symbol: str = Field(..., min_length=1, max_length=30)
    name: str = Field(..., min_length=1, max_length=200)
    exchange: str = Field(default="NSE", max_length=10)
    segment: str = Field(default="EQ", max_length=20)
    instrument_type: str = Field(default="EQ", max_length=20)


class InstrumentCreate(InstrumentBase):
    isin: str | None = Field(None, min_length=12, max_length=12)
    sector_id: UUID | None = None
    industry_id: UUID | None = None
    lot_size: int = Field(default=1, ge=1)
    tick_size: Decimal = Field(default=Decimal("0.05"))
    face_value: Decimal | None = None
    listing_date: date | None = None
    meta: dict[str, Any] | None = None


class InstrumentRead(UUIDSchema, TimestampSchema, InstrumentBase):
    isin: str | None = None
    sector_id: UUID | None = None
    industry_id: UUID | None = None
    lot_size: int
    tick_size: Decimal
    face_value: Decimal | None
    listing_date: date | None
    is_active: bool
    is_tradeable: bool
    is_suspended: bool
    meta: dict[str, Any] | None = None


class InstrumentSummary(KPBaseSchema):
    """Compact view for lists, search results."""
    id: UUID
    symbol: str
    name: str
    exchange: str
    instrument_type: str
    is_active: bool
