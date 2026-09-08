"""
KP Backend — Market Data Service (yfinance 1.7+)
All data sourced from Yahoo Finance — never fabricated.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import structlog

log = structlog.get_logger(__name__)

_NSE_SUFFIX = ".NS"
_INDEX_MAP: dict[str, str] = {
    "NIFTY50":    "^NSEI",
    "BANKNIFTY":  "^NSEBANK",
    "NIFTYMID50": "^NSEMDCP50",
    "SENSEX":     "^BSESN",
    "INDIAVIX":   "^INDIAVIX",
}


def nse_to_yf(symbol: str) -> str:
    upper = symbol.upper()
    return _INDEX_MAP.get(upper, f"{upper}{_NSE_SUFFIX}")


async def fetch_quote(symbol: str) -> dict[str, Any] | None:
    """
    Live quote via yfinance.fast_info. Returns None on failure.
    NEVER returns fabricated data.
    """
    try:
        import yfinance as yf
        yf_ticker = nse_to_yf(symbol)
        loop = asyncio.get_event_loop()

        fi = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: yf.Ticker(yf_ticker).fast_info),
            timeout=15,
        )

        ltp = getattr(fi, "last_price", None)
        if ltp is None:
            return None

        prev  = getattr(fi, "previous_close", None)
        chg   = round(ltp - prev, 2)           if prev else None
        chgp  = round(chg / prev * 100, 4)     if (chg and prev) else None

        return {
            "symbol":     symbol.upper(),
            "yf_ticker":  yf_ticker,
            "ltp":        round(float(ltp), 2),
            "prev_close": round(float(prev), 2)               if prev                          else None,
            "open":       round(float(fi.open), 2)            if getattr(fi, "open",     None) else None,
            "day_high":   round(float(fi.day_high), 2)        if getattr(fi, "day_high", None) else None,
            "day_low":    round(float(fi.day_low),  2)        if getattr(fi, "day_low",  None) else None,
            "change":     chg,
            "change_pct": chgp,
            "volume":     int(getattr(fi, "last_volume", 0) or 0),
            "market_cap": getattr(fi, "market_cap", None),
            "currency":   getattr(fi, "currency", "INR"),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "source":     "yfinance",
            "quality":    "live",
        }
    except asyncio.TimeoutError:
        log.warning("yfinance_timeout", symbol=symbol)
        return None
    except Exception as e:
        log.warning("yfinance_fetch_failed", symbol=symbol, error=str(e))
        return None


async def fetch_index_quotes() -> dict[str, Any]:
    """NIFTY50 + BANKNIFTY concurrently. Unavailable on failure — never fabricates."""
    symbols = ["NIFTY50", "BANKNIFTY"]
    results = await asyncio.gather(*[fetch_quote(s) for s in symbols], return_exceptions=True)
    quotes: dict[str, Any] = {}
    for sym, res in zip(symbols, results):
        if isinstance(res, dict):
            quotes[sym] = res
        else:
            quotes[sym] = {
                "symbol": sym, "ltp": None, "change": None, "change_pct": None,
                "quality": "unavailable",
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "source": "yfinance",
                "error": str(res) if isinstance(res, Exception) else "no_data",
            }
    return quotes


async def fetch_ohlcv(symbol: str, period: str = "1d", interval: str = "5m") -> list[dict]:
    """OHLCV bars via yfinance. Returns [] on failure — never fabricates."""
    try:
        import yfinance as yf
        yf_ticker = nse_to_yf(symbol)
        loop = asyncio.get_event_loop()

        hist = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: yf.Ticker(yf_ticker).history(period=period, interval=interval, auto_adjust=True),
            ),
            timeout=20,
        )
        if hist is None or hist.empty:
            return []

        return [
            {
                "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                "open":   round(float(row["Open"]),  2),
                "high":   round(float(row["High"]),  2),
                "low":    round(float(row["Low"]),   2),
                "close":  round(float(row["Close"]), 2),
                "volume": int(row.get("Volume", 0)),
            }
            for ts, row in hist.iterrows()
        ]
    except asyncio.TimeoutError:
        log.warning("yfinance_ohlcv_timeout", symbol=symbol)
        return []
    except Exception as e:
        log.warning("yfinance_ohlcv_failed", symbol=symbol, error=str(e))
        return []
