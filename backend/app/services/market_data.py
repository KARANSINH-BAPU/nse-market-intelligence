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
    """Fetch all major NSE/BSE indices. Never fabricates data."""
    # symbol_key → yfinance ticker mapping
    INDEX_MAP = {
        "NIFTY50":    "^NSEI",
        "BANKNIFTY":  "^NSEBANK",
        "SENSEX":     "^BSESN",
        "NIFTYIT":    "^CNXIT",
        "NIFTYAUTO":  "^CNXAUTO",
        "NIFTYPHARMA":"^CNXPHARMA",
        "NIFTYFMCG":  "^CNXFMCG",
        "NIFTYMETAL": "^CNXMETAL",
        "NIFTYENERGY":"^CNXENERGY",
        "NIFTYINFRA": "^CNXINFRA",
        "NIFTYMIDCAP":"^CNXMID50",
    }
    results = await asyncio.gather(
        *[_fetch_index_single(sym_key, yf_tick) for sym_key, yf_tick in INDEX_MAP.items()],
        return_exceptions=True,
    )
    quotes: dict[str, Any] = {}
    for sym_key, res in zip(INDEX_MAP.keys(), results):
        if isinstance(res, dict):
            quotes[sym_key] = res
        else:
            quotes[sym_key] = {
                "symbol": sym_key, "ltp": None, "change": None, "change_pct": None,
                "quality": "unavailable", "source": "yfinance",
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "error": str(res) if isinstance(res, Exception) else "no_data",
            }
    return quotes


async def _fetch_index_single(sym_key: str, yf_ticker: str) -> dict[str, Any]:
    """Fetch one index from yfinance using its ^TICKER."""
    import asyncio as _asyncio
    import yfinance as yf
    loop = _asyncio.get_event_loop()
    try:
        info = await _asyncio.wait_for(
            loop.run_in_executor(None, lambda: yf.Ticker(yf_ticker).info),
            timeout=15,
        )
        price = info.get("regularMarketPrice") or info.get("currentPrice")
        prev  = info.get("regularMarketPreviousClose") or info.get("previousClose")
        open_ = info.get("regularMarketOpen") or info.get("open")
        high  = info.get("dayHigh") or info.get("regularMarketDayHigh")
        low   = info.get("dayLow") or info.get("regularMarketDayLow")
        chg   = (price - prev) if price and prev else None
        pct   = (chg / prev * 100) if chg is not None and prev else None
        return {
            "symbol":     sym_key,
            "yf_ticker":  yf_ticker,
            "ltp":        round(price, 2) if price else None,
            "prev_close": round(prev,  2) if prev  else None,
            "open":       round(open_, 2) if open_ else None,
            "day_high":   round(high,  2) if high  else None,
            "day_low":    round(low,   2) if low   else None,
            "change":     round(chg, 2)   if chg   else None,
            "change_pct": round(pct, 4)   if pct   else None,
            "volume":     info.get("regularMarketVolume", 0) or 0,
            "currency":   "INR",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "source":     "yfinance",
            "quality":    "live" if price else "unavailable",
        }
    except Exception as e:
        raise RuntimeError(f"{sym_key}: {e}") from e



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
