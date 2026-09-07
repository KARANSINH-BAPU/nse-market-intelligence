"""
KP Backend — Pydantic Schemas: Market data types
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import Field

from app.schemas.base import KPBaseSchema


class DataQuality(str, Enum):
    """Quality classification for market data points."""
    LIVE = "live"        # real-time, < 1 second old
    DELAYED = "delayed"  # real-time but delayed (e.g. 15-min delay)
    STALE = "stale"      # last known value, feed disconnected
    EOD = "eod"          # end-of-day historical
    UNAVAILABLE = "unavailable"  # no data


class QuoteSchema(KPBaseSchema):
    """
    Real-time or delayed quote for a single NSE instrument.
    All price fields are None if data is unavailable — never fabricated.
    """
    symbol: str
    exchange: str = "NSE"

    # All price fields are nullable — absent means no real data available
    ltp: float | None = Field(None, description="Last traded price")
    open: float | None = None
    high: float | None = None
    low: float | None = None
    prev_close: float | None = None
    change: float | None = None
    change_pct: float | None = None
    volume: int | None = None
    value: float | None = None   # turnover in rupees
    vwap: float | None = None
    bid: float | None = None
    ask: float | None = None
    upper_circuit: float | None = None
    lower_circuit: float | None = None

    # Data provenance — always present
    quality: DataQuality = DataQuality.UNAVAILABLE
    timestamp: datetime | None = None   # event timestamp (IST)
    received_at: datetime | None = None  # when KP received it

    @property
    def is_real_data(self) -> bool:
        return self.quality in (DataQuality.LIVE, DataQuality.DELAYED, DataQuality.EOD)


class MarketBreadthSchema(KPBaseSchema):
    """NSE market breadth snapshot."""
    advances: int | None = None
    declines: int | None = None
    unchanged: int | None = None
    total: int | None = None
    advance_decline_ratio: float | None = None
    quality: DataQuality = DataQuality.UNAVAILABLE
    timestamp: datetime | None = None


class IndexQuoteSchema(QuoteSchema):
    """Index-specific quote (NIFTY50, BANKNIFTY, etc.)."""
    index_name: str
    constituents: int | None = None  # number of stocks in index
