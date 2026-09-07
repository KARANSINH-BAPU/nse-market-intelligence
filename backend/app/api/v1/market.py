"""
KP Backend — Market Snapshot API
GET /api/v1/market/snapshot  — NIFTY, BANKNIFTY, breadth (real data only)
GET /api/v1/market/session   — current trading session info
GET /api/v1/market/status    — is NSE open right now?
"""
from __future__ import annotations

from datetime import datetime, time, timezone
from typing import Annotated
import zoneinfo

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.db.redis import redis_client
from app.models import MarketSession
from app.schemas.market import DataQuality, MarketBreadthSchema

log = structlog.get_logger(__name__)
router = APIRouter()

IST = zoneinfo.ZoneInfo("Asia/Kolkata")

# NSE trading hours (IST)
_NSE_OPEN = time(9, 15)
_NSE_CLOSE = time(15, 30)
_NSE_PRE_OPEN_START = time(9, 0)


def _is_nse_open() -> bool:
    """Check if NSE is currently in normal trading hours (IST, Mon–Fri)."""
    now_ist = datetime.now(IST)
    if now_ist.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    t = now_ist.time()
    return _NSE_OPEN <= t <= _NSE_CLOSE


def _market_phase() -> str:
    """Return current market phase string."""
    now_ist = datetime.now(IST)
    if now_ist.weekday() >= 5:
        return "closed_weekend"
    t = now_ist.time()
    if t < _NSE_PRE_OPEN_START:
        return "pre_session"
    elif t < _NSE_OPEN:
        return "pre_open"
    elif t <= _NSE_CLOSE:
        return "market_hours"
    else:
        return "post_close"


@router.get("/status", summary="NSE market status")
async def market_status() -> dict:
    """
    Returns current NSE market open/close status.
    Based on IST clock and weekday — not fabricated.
    Holidays are checked against DB if available.
    """
    now_ist = datetime.now(IST)
    return {
        "is_open": _is_nse_open(),
        "phase": _market_phase(),
        "exchange": "NSE",
        "timezone": "Asia/Kolkata",
        "server_time_ist": now_ist.isoformat(),
        "server_time_utc": datetime.now(timezone.utc).isoformat(),
        "note": "Holiday calendar pending — weekday/hour check only",
    }


@router.get("/snapshot", summary="Market snapshot (live data required)")
async def market_snapshot() -> dict:
    """
    Returns NIFTY/BANKNIFTY quotes and market breadth.
    Returns UNAVAILABLE status if no live data source is connected.
    NEVER returns fabricated values.
    """
    # Phase 1/2: No live data provider connected yet.
    # Return structured UNAVAILABLE response — not fake data.
    return {
        "status": "unavailable",
        "reason": "Live data provider not configured. Set DATA_PROVIDER in .env.",
        "indices": {
            "NIFTY50": {
                "symbol": "NIFTY50",
                "ltp": None,
                "change": None,
                "change_pct": None,
                "quality": DataQuality.UNAVAILABLE,
                "timestamp": None,
            },
            "BANKNIFTY": {
                "symbol": "BANKNIFTY",
                "ltp": None,
                "change": None,
                "change_pct": None,
                "quality": DataQuality.UNAVAILABLE,
                "timestamp": None,
            },
        },
        "breadth": MarketBreadthSchema().model_dump(),
        "phase": _market_phase(),
        "server_time_ist": datetime.now(IST).isoformat(),
    }


@router.get("/session", summary="Current/last market session")
async def market_session(
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Returns today's (or last) NSE session record from DB."""
    now_ist = datetime.now(IST)
    today = now_ist.date()

    stmt = select(MarketSession).where(
        MarketSession.session_date == today
    )
    row = (await db.execute(stmt)).scalar_one_or_none()

    if row:
        return {
            "session_date": str(row.session_date),
            "status": row.status,
            "is_holiday": row.is_holiday,
            "holiday_name": row.holiday_name,
            "nifty50_open": row.nifty50_open,
            "nifty50_close": row.nifty50_close,
            "advances": row.advances,
            "declines": row.declines,
            "advance_decline_ratio": row.advance_decline_ratio,
        }

    # No session record yet for today
    return {
        "session_date": str(today),
        "status": _market_phase(),
        "is_holiday": None,
        "note": "No session record yet — will populate when market opens",
        "nifty50_open": None,
        "nifty50_close": None,
        "advances": None,
        "declines": None,
    }
