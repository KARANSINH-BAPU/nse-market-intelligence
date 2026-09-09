"""
KP — Live Quote Service

Fetches live intraday quotes from yfinance for ALL NSE stocks in batches.
Results cached in-memory (refreshed every 3 minutes during market hours).

Architecture:
- Uses yfinance.download() which accepts multiple tickers in one call (fast)
- Splits 2060 symbols into batches of 200 to avoid rate limits
- Falls back to ohlcv_daily data when market is closed
- Accessible via /api/v1/market/live-quotes endpoint
"""
from __future__ import annotations

import asyncio
import math
import time
from datetime import date, datetime, timezone, timedelta
from typing import Any

import asyncpg
import structlog

log = structlog.get_logger(__name__)

DB = "postgresql://kp_user:kp_dev_password@localhost:5432/kp_db"

# ── In-memory cache ──────────────────────────────────────────────────────────
_cache: dict[str, dict] = {}        # symbol → quote dict
_cache_ts: float = 0.0              # epoch seconds when last refreshed
_CACHE_TTL = 180                    # 3 minutes
_is_refreshing = False


def _is_market_open() -> bool:
    """Approximate NSE market hours check (09:15 – 15:30 IST, Mon-Fri)."""
    now_ist = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    if now_ist.weekday() >= 5:   # Saturday / Sunday
        return False
    t = now_ist.time()
    from datetime import time as dtime
    return dtime(9, 15) <= t <= dtime(15, 35)


def _safe(v) -> float | None:
    """Return float or None for bad values."""
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f) or f == 0.0) else round(f, 2)
    except Exception:
        return None


async def _fetch_symbols_from_db() -> list[str]:
    """Get all active NSE symbols from PostgreSQL."""
    conn = await asyncpg.connect(DB)
    try:
        rows = await conn.fetch(
            "SELECT DISTINCT symbol FROM ohlcv_daily "
            "WHERE trade_date >= CURRENT_DATE - INTERVAL '10 days' "
            "ORDER BY symbol"
        )
        return [r["symbol"] for r in rows]
    finally:
        await conn.close()


async def _fetch_ohlcv_latest_from_db() -> dict[str, dict]:
    """Load latest ohlcv_daily data as baseline (fast DB read)."""
    conn = await asyncpg.connect(DB)
    try:
        latest_date = await conn.fetchval(
            "SELECT MAX(trade_date) FROM ohlcv_daily"
        )
        rows = await conn.fetch(
            """
            SELECT o.symbol, o.close, o.open, o.high, o.low, o.volume,
                   o.prev_close,
                   COALESCE(o.prev_close,
                       LAG(o.close) OVER (PARTITION BY o.symbol ORDER BY o.trade_date)
                   ) AS pc
            FROM ohlcv_daily o
            WHERE o.trade_date = $1 AND o.close > 0
            """,
            latest_date,
        )
        result = {}
        for r in rows:
            close = _safe(r["close"])
            pc    = _safe(r["pc"]) or _safe(r["prev_close"])
            if not close:
                continue
            chg_pct = round((close - pc) / pc * 100, 2) if pc and pc > 0 else 0.0
            result[r["symbol"]] = {
                "symbol":     r["symbol"],
                "ltp":        close,
                "open":       _safe(r["open"]),
                "high":       _safe(r["high"]),
                "low":        _safe(r["low"]),
                "prev_close": pc,
                "change":     round(close - pc, 2) if pc else 0.0,
                "change_pct": chg_pct,
                "volume":     int(r["volume"] or 0),
                "trade_date": str(latest_date),
                "source":     "ohlcv_daily",
            }
        log.info("live_quote_db_baseline", count=len(result), date=str(latest_date))
        return result
    finally:
        await conn.close()


async def _batch_yf_quotes(symbols: list[str]) -> dict[str, dict]:
    """
    Download live quotes for a batch of symbols using yfinance.
    yf.download(tickers, period='1d', interval='1m') returns OHLCV for today.
    We also try fast_info for live price.
    """
    import yfinance as yf
    loop = asyncio.get_event_loop()

    # Build NSE tickers
    yf_tickers = [f"{s}.NS" for s in symbols]
    tickers_str = " ".join(yf_tickers)

    result: dict[str, dict] = {}
    try:
        # Use yf.Tickers for batch fast_info
        def _download():
            tickers_obj = yf.Tickers(tickers_str)
            out = {}
            for sym, yf_sym in zip(symbols, yf_tickers):
                try:
                    t = tickers_obj.tickers.get(yf_sym)
                    if t is None:
                        continue
                    fi = t.fast_info
                    ltp  = getattr(fi, "last_price", None)
                    prev = getattr(fi, "previous_close", None)
                    if not ltp or ltp <= 0:
                        continue
                    chg  = round(ltp - prev, 2) if prev else 0.0
                    chgp = round(chg / prev * 100, 2) if prev and prev > 0 else 0.0
                    out[sym] = {
                        "symbol":     sym,
                        "ltp":        round(float(ltp), 2),
                        "open":       round(float(fi.open), 2) if getattr(fi, "open", None) else None,
                        "high":       round(float(fi.day_high), 2) if getattr(fi, "day_high", None) else None,
                        "low":        round(float(fi.day_low), 2) if getattr(fi, "day_low", None) else None,
                        "prev_close": round(float(prev), 2) if prev else None,
                        "change":     chg,
                        "change_pct": chgp,
                        "volume":     int(getattr(fi, "last_volume", 0) or 0),
                        "source":     "yfinance_live",
                    }
                except Exception:
                    pass
            return out

        result = await asyncio.wait_for(
            loop.run_in_executor(None, _download),
            timeout=60,
        )
    except asyncio.TimeoutError:
        log.warning("batch_yf_timeout", batch_size=len(symbols))
    except Exception as e:
        log.warning("batch_yf_error", error=str(e)[:200])
    return result


async def refresh_live_quotes() -> None:
    """Full refresh: load DB baseline first, then overlay yfinance live quotes."""
    global _cache, _cache_ts, _is_refreshing
    if _is_refreshing:
        return
    _is_refreshing = True
    t0 = time.time()
    try:
        # Always load DB baseline (fast, ~200ms)
        db_data = await _fetch_ohlcv_latest_from_db()
        _cache = dict(db_data)  # start with DB data

        # During market hours also fetch live yfinance quotes
        if _is_market_open():
            symbols = list(db_data.keys())
            BATCH = 100  # Process 100 at a time
            total_live = 0
            for i in range(0, len(symbols), BATCH):
                batch = symbols[i:i + BATCH]
                live  = await _batch_yf_quotes(batch)
                for sym, q in live.items():
                    # Merge: preserve DB open/high/low if yfinance missing
                    db_entry = db_data.get(sym, {})
                    q["open"]  = q["open"]  or db_entry.get("open")
                    q["high"]  = q["high"]  or db_entry.get("high")
                    q["low"]   = q["low"]   or db_entry.get("low")
                    q["trade_date"] = db_entry.get("trade_date", str(date.today()))
                    _cache[sym] = q
                    total_live += 1
                await asyncio.sleep(0.5)  # Gentle rate limiting between batches
            log.info("live_quotes_refreshed",
                     total=len(_cache), live_updated=total_live,
                     elapsed_s=round(time.time() - t0, 1))
        else:
            log.info("live_quotes_db_only",
                     total=len(_cache), reason="market_closed",
                     elapsed_s=round(time.time() - t0, 1))

        _cache_ts = time.time()
    except Exception as e:
        log.error("live_quotes_refresh_error", error=str(e)[:300])
    finally:
        _is_refreshing = False


async def get_live_quotes(force_refresh: bool = False) -> dict[str, dict]:
    """
    Get all live quotes from cache, refreshing if stale.
    Returns dict: symbol → quote dict
    """
    global _cache, _cache_ts
    age = time.time() - _cache_ts
    if force_refresh or not _cache or age > _CACHE_TTL:
        await refresh_live_quotes()
    return _cache


async def get_quote_single(symbol: str) -> dict | None:
    """Fast single-stock quote: cache first, then DB fallback."""
    quotes = await get_live_quotes()
    q = quotes.get(symbol.upper())
    if q:
        return q

    # DB fallback
    conn = await asyncpg.connect(DB)
    try:
        row = await conn.fetchrow(
            """
            SELECT o.symbol, o.close, o.open, o.high, o.low, o.volume, o.trade_date,
                   COALESCE(o.prev_close,
                       LAG(o.close) OVER (PARTITION BY o.symbol ORDER BY o.trade_date)
                   ) AS pc
            FROM ohlcv_daily o
            WHERE o.symbol = $1 AND o.close > 0
            ORDER BY o.trade_date DESC LIMIT 1
            """,
            symbol.upper(),
        )
        if row:
            close = _safe(row["close"])
            pc    = _safe(row["pc"])
            chg_pct = round((close - pc) / pc * 100, 2) if close and pc and pc > 0 else 0.0
            return {
                "symbol":     row["symbol"],
                "ltp":        close,
                "open":       _safe(row["open"]),
                "high":       _safe(row["high"]),
                "low":        _safe(row["low"]),
                "prev_close": pc,
                "change":     round(close - pc, 2) if close and pc else 0.0,
                "change_pct": chg_pct,
                "volume":     int(row["volume"] or 0),
                "trade_date": str(row["trade_date"]),
                "source":     "ohlcv_daily",
            }
    finally:
        await conn.close()
    return None


async def start_background_refresh() -> None:
    """
    Start the background refresh loop.
    Call this from app startup. Refreshes every 3 min during market hours,
    every 15 min otherwise.
    """
    log.info("live_quote_service_starting")
    await refresh_live_quotes()   # Initial load

    async def _loop():
        while True:
            ttl = 180 if _is_market_open() else 900   # 3 min / 15 min
            await asyncio.sleep(ttl)
            try:
                await refresh_live_quotes()
            except Exception as e:
                log.error("bg_refresh_error", error=str(e)[:200])

    asyncio.create_task(_loop())
    log.info("live_quote_service_started", initial_stocks=len(_cache))
