"""
KP Backend — Market Snapshot & Quote API
GET /api/v1/market/status         — real IST clock open/close
GET /api/v1/market/snapshot       — NIFTY50 + BANKNIFTY via yfinance
GET /api/v1/market/quote/{symbol} — single NSE equity quote
GET /api/v1/market/ohlcv/{symbol} — OHLCV bars
GET /api/v1/market/session        — DB session record for today
"""
from __future__ import annotations

import zoneinfo
from datetime import datetime, time, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.market_session import MarketSession
from app.services.quote_cache import cached_ohlcv, cached_quote, cached_snapshot

log = structlog.get_logger(__name__)
router = APIRouter()

IST = zoneinfo.ZoneInfo("Asia/Kolkata")
_NSE_OPEN  = time(9, 15)
_NSE_CLOSE = time(15, 30)
_PRE_OPEN  = time(9, 0)


def _is_nse_open() -> bool:
    now = datetime.now(IST)
    return now.weekday() < 5 and _NSE_OPEN <= now.time() <= _NSE_CLOSE


def _market_phase() -> str:
    now = datetime.now(IST)
    if now.weekday() >= 5:
        return "closed_weekend"
    t = now.time()
    if t < _PRE_OPEN:       return "pre_session"
    if t < _NSE_OPEN:       return "pre_open"
    if t <= _NSE_CLOSE:     return "market_hours"
    return "post_close"


# ── /status ───────────────────────────────────────────────────────
@router.get("/status", summary="NSE market open/close status")
async def market_status() -> dict[str, Any]:
    now = datetime.now(IST)
    return {
        "is_open": _is_nse_open(),
        "phase": _market_phase(),
        "exchange": "NSE",
        "timezone": "Asia/Kolkata",
        "server_time_ist": now.isoformat(),
        "server_time_utc": datetime.now(timezone.utc).isoformat(),
        "note": "Holiday calendar pending — weekday/hour check only",
    }


# ── /snapshot ─────────────────────────────────────────────────────
@router.get("/snapshot", summary="NIFTY50 & BANKNIFTY live snapshot")
async def market_snapshot() -> dict[str, Any]:
    """
    Live quotes from yfinance. Fields are None when unavailable.
    NEVER returns fabricated values.
    """
    cached = await cached_snapshot()
    return {
        "status": "ok",
        "phase": _market_phase(),
        "is_open": _is_nse_open(),
        "indices": cached["indices"],
        "source": cached.get("source", "yfinance"),
        "cache": cached.get("cache", "UNKNOWN"),
        "fetched_at": cached.get("fetched_at", datetime.now(timezone.utc).isoformat()),
    }


# ── /quote/{symbol} ───────────────────────────────────────────────
@router.get("/quote/{symbol}", summary="Live quote for an NSE equity")
async def get_quote(symbol: str) -> dict[str, Any]:
    data = await cached_quote(symbol.upper())
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No quote data for '{symbol}'. Check the symbol or try again later.",
        )
    return data


# ── /ohlcv/{symbol} ───────────────────────────────────────────────
@router.get("/ohlcv/{symbol}", summary="OHLCV candlestick bars")
async def get_ohlcv(
    symbol: str,
    period: str   = Query("1d",  description="1d | 5d | 1mo | 3mo | 6mo | 1y"),
    interval: str = Query("5m",  description="1m | 5m | 15m | 30m | 1h | 1d"),
) -> dict[str, Any]:
    """Real OHLCV from yfinance. Returns empty bars[] when data unavailable."""
    bars = await cached_ohlcv(symbol.upper(), period=period, interval=interval)
    return {
        "symbol": symbol.upper(),
        "period": period,
        "interval": interval,
        "count": len(bars),
        "bars": bars,
        "source": "yfinance",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


# ── /session ──────────────────────────────────────────────────────
@router.get("/session", summary="Today's NSE trading session record")
async def market_session_today(
    db: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    today = datetime.now(IST).date()
    stmt  = select(MarketSession).where(MarketSession.session_date == today)
    row   = (await db.execute(stmt)).scalar_one_or_none()

    if row:
        return {
            "session_date":       str(row.session_date),
            "session_type":       row.session_type,
            "status":             row.status,
            "exchange":           row.exchange,
            "data_quality_score": row.data_quality_score,
            "notes":              row.notes,
        }
    return {
        "session_date": str(today),
        "status":       _market_phase(),
        "exchange":     "NSE",
        "session_type": "regular",
        "note":         "No DB record yet for today",
    }
