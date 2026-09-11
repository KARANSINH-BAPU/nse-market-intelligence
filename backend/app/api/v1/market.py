"""
KP — Market API (movers, breadth, sector-performance, all-stocks, search, quote)

All data from PostgreSQL ohlcv_daily + live_quotes service + yfinance.
NSE-accurate gainers/losers with full OHLCV fields.
"""
from __future__ import annotations

import asyncio
import math
from datetime import date, timedelta

import asyncpg
import structlog
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.quote_cache import cached_snapshot

log = structlog.get_logger(__name__)
router = APIRouter()
DB = "postgresql://kp_user:kp_dev_password@localhost:5432/kp_db"

# ── Nifty 50 constituents (as of 2026) ─────────────────────────────────────
NIFTY50_SYMBOLS = [
    "RELIANCE", "TCS", "HDFCBANK", "BHARTIARTL", "ICICIBANK",
    "INFOSYS", "SBIN", "HINDUNILVR", "ITC", "LICI",
    "KOTAKBANK", "LT", "HCLTECH", "MARUTI", "SUNPHARMA",
    "BAJFINANCE", "AXISBANK", "TITAN", "ASIANPAINT", "NTPC",
    "POWERGRID", "ULTRACEMCO", "NESTLEIND", "WIPRO", "INDUSINDBK",
    "TECHM", "M&M", "HDFCLIFE", "BAJAJFINSV", "ONGC",
    "COALINDIA", "ADANIENT", "ADANIPORTS", "TATACONSUM", "CIPLA",
    "APOLLOHOSP", "DRREDDY", "TATAMOTORS", "TATASTEEL", "JSWSTEEL",
    "GRASIM", "BRITANNIA", "HINDALCO", "HEROMOTOCO", "EICHERMOT",
    "BPCL", "SHRIRAMFIN", "SBILIFE", "DIVISLAB", "BEL",
]


def _safe_float(v) -> float:
    try:
        f = float(v)
        return 0.0 if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return 0.0


async def _latest_date(conn) -> date:
    row = await conn.fetchrow("SELECT MAX(trade_date) AS dt FROM ohlcv_daily")
    return row["dt"] if row and row["dt"] else date.today() - timedelta(days=1)


OHLCV_WITH_PREV = """(
    SELECT id, symbol, trade_date, open, high, low, close, volume,
           COALESCE(prev_close,
               LAG(close) OVER (PARTITION BY symbol ORDER BY trade_date)
           ) AS prev_close
    FROM ohlcv_daily
) ohlcv_base"""


class IndexQuote(BaseModel):
    symbol: str
    ltp: float | None
    open: float | None = None
    high: float | None = None
    low: float | None = None
    prev_close: float | None = None
    change: float | None
    change_pct: float | None
    volume: int | None = None
    source: str
    is_live: bool = False


# ── Movers ─────────────────────────────────────────────────────────────────────
@router.get("/movers")
async def get_movers(limit: int = Query(10, ge=1, le=50)):
    """Top gainers and losers from the live quote cache."""
    from app.services.live_quotes import get_live_quotes
    quotes = await get_live_quotes()
    stocks = list(quotes.values())
    gainers = sorted(stocks, key=lambda x: x.get("change_pct") or 0, reverse=True)[:limit]
    losers  = sorted(stocks, key=lambda x: x.get("change_pct") or 0)[:limit]

    def fmt(q):
        return {
            "symbol":     q["symbol"],
            "name":       q.get("name", q["symbol"]),
            "close":      q.get("ltp") or 0,
            "ltp":        q.get("ltp") or 0,
            "open":       q.get("open"),
            "high":       q.get("high"),
            "low":        q.get("low"),
            "prev_close": q.get("prev_close"),
            "change":     q.get("change") or 0,
            "change_pct": q.get("change_pct") or 0,
            "volume":     q.get("volume") or 0,
        }

    return {
        "gainers":      [fmt(g) for g in gainers],
        "losers":       [fmt(l) for l in losers],
        "trade_date":   gainers[0].get("trade_date") if gainers else str(date.today()),
        "total_stocks": len(stocks),
    }


# ── NSE-Accurate Gainers / Losers (Nifty 50 focus) ────────────────────────────
@router.get("/gainers-losers")
async def get_gainers_losers(
    index: str = Query("NIFTY50", description="NIFTY50 | ALL"),
    limit: int = Query(20, ge=1, le=50),
):
    """
    NSE-accurate top gainers and losers.
    Fetches live OHLCV data from yfinance for the selected index,
    matching NSE website columns: Symbol, Open, High, Low, Prev Close, LTP, %Change, Volume.
    Falls back to DB data if market is closed.
    """
    import yfinance as yf

    symbols = NIFTY50_SYMBOLS if index == "NIFTY50" else NIFTY50_SYMBOLS

    def _batch_fetch(syms: list[str]) -> list[dict]:
        results = []
        yf_syms = [f"{s}.NS" for s in syms]
        try:
            tickers = yf.Tickers(" ".join(yf_syms))
            for sym, yf_sym in zip(syms, yf_syms):
                try:
                    t = tickers.tickers.get(yf_sym)
                    if not t:
                        continue
                    fi = t.fast_info
                    ltp      = getattr(fi, "last_price", None)
                    prev     = getattr(fi, "previous_close", None)
                    open_    = getattr(fi, "open", None)
                    day_high = getattr(fi, "day_high", None)
                    day_low  = getattr(fi, "day_low", None)
                    volume   = int(getattr(fi, "last_volume", 0) or 0)
                    if not ltp or ltp <= 0:
                        continue
                    chg  = round(ltp - prev, 2) if prev else 0.0
                    chgp = round(chg / prev * 100, 2) if prev and prev > 0 else 0.0
                    # Value in lakhs = (ltp * volume) / 1e5
                    value_lakhs = round((ltp * volume) / 1e5, 2) if volume else 0.0
                    results.append({
                        "symbol":     sym,
                        "ltp":        round(float(ltp), 2),
                        "open":       round(float(open_), 2) if open_ else None,
                        "high":       round(float(day_high), 2) if day_high else None,
                        "low":        round(float(day_low), 2) if day_low else None,
                        "prev_close": round(float(prev), 2) if prev else None,
                        "change":     chg,
                        "change_pct": chgp,
                        "volume":     volume,
                        "value_lakhs": value_lakhs,
                        "source":     "yfinance_live",
                    })
                except Exception:
                    pass
        except Exception as e:
            log.warning("gainers_losers_yf_error", error=str(e)[:200])
        return results

    loop = asyncio.get_event_loop()
    try:
        stocks = await asyncio.wait_for(
            loop.run_in_executor(None, _batch_fetch, symbols),
            timeout=30,
        )
    except asyncio.TimeoutError:
        stocks = []

    # If yfinance failed (market closed or timeout), fall back to DB
    if not stocks:
        conn = await asyncpg.connect(DB)
        try:
            latest = await _latest_date(conn)
            rows = await conn.fetch(
                f"""
                SELECT ohlcv_base.symbol, ohlcv_base.open, ohlcv_base.high,
                       ohlcv_base.low, ohlcv_base.close AS ltp,
                       ohlcv_base.prev_close, ohlcv_base.volume,
                       CASE WHEN ohlcv_base.prev_close > 0
                            THEN ROUND(((ohlcv_base.close - ohlcv_base.prev_close)
                                 / ohlcv_base.prev_close * 100)::numeric, 2)
                            ELSE 0 END AS change_pct,
                       (ohlcv_base.close - ohlcv_base.prev_close) AS change
                FROM {OHLCV_WITH_PREV}
                WHERE ohlcv_base.trade_date = $1
                  AND ohlcv_base.symbol = ANY($2::text[])
                  AND ohlcv_base.prev_close > 0
                """,
                latest,
                symbols,
            )
            stocks = [
                {
                    "symbol":      r["symbol"],
                    "ltp":         _safe_float(r["ltp"]),
                    "open":        _safe_float(r["open"]) or None,
                    "high":        _safe_float(r["high"]) or None,
                    "low":         _safe_float(r["low"]) or None,
                    "prev_close":  _safe_float(r["prev_close"]) or None,
                    "change":      _safe_float(r["change"]),
                    "change_pct":  _safe_float(r["change_pct"]),
                    "volume":      int(r["volume"] or 0),
                    "value_lakhs": round(_safe_float(r["ltp"]) * int(r["volume"] or 0) / 1e5, 2),
                    "source":      "ohlcv_daily",
                }
                for r in rows
            ]
        finally:
            conn.close()

    gainers = sorted(stocks, key=lambda x: x.get("change_pct") or 0, reverse=True)[:limit]
    losers  = sorted(stocks, key=lambda x: x.get("change_pct") or 0)[:limit]
    as_of   = str(date.today())

    return {
        "gainers":    gainers,
        "losers":     losers,
        "index":      index,
        "as_of":      as_of,
        "total":      len(stocks),
        "live":       any(s.get("source") == "yfinance_live" for s in stocks),
    }


# ── Breadth ─────────────────────────────────────────────────────────────────────
@router.get("/breadth")
async def get_breadth():
    conn = await asyncpg.connect(DB)
    try:
        latest = await _latest_date(conn)
        row = await conn.fetchrow(
            f"""
            SELECT
                COUNT(*) FILTER (WHERE ohlcv_base.close > ohlcv_base.prev_close) AS advances,
                COUNT(*) FILTER (WHERE ohlcv_base.close < ohlcv_base.prev_close) AS declines,
                COUNT(*) FILTER (WHERE ohlcv_base.close = ohlcv_base.prev_close) AS unchanged,
                COUNT(*)                                                          AS total
            FROM {OHLCV_WITH_PREV}
            WHERE ohlcv_base.trade_date = $1
              AND ohlcv_base.prev_close IS NOT NULL
              AND ohlcv_base.prev_close > 0
            """,
            latest,
        )
        adv = int(row["advances"] or 0)
        dec = int(row["declines"] or 0)
        return {
            "advances":   adv,
            "declines":   dec,
            "unchanged":  int(row["unchanged"] or 0),
            "total":      int(row["total"] or 0),
            "ratio":      round(adv / dec, 2) if dec > 0 else float(adv),
            "trade_date": str(latest),
        }
    finally:
        await conn.close()


# ── Sector Performance ─────────────────────────────────────────────────────────
@router.get("/sector-performance")
async def get_sector_performance():
    conn = await asyncpg.connect(DB)
    try:
        latest  = await _latest_date(conn)
        sec_cnt = await conn.fetchval("SELECT COUNT(*) FROM sectors")

        if sec_cnt and sec_cnt > 0:
            grp = "s.name"
        else:
            grp = "COALESCE(i.market_cap_category, 'Others')"

        rows = await conn.fetch(
            f"""
            SELECT
                {grp} AS sector,
                ROUND(COALESCE(
                    AVG(CASE WHEN ohlcv_base.prev_close > 0
                        THEN (ohlcv_base.close - ohlcv_base.prev_close) / ohlcv_base.prev_close * 100
                        ELSE NULL END), 0
                )::numeric, 2) AS avg_chg_pct,
                COUNT(*)                                                              AS stock_count,
                COUNT(*) FILTER (WHERE ohlcv_base.close > ohlcv_base.prev_close)     AS advances,
                COUNT(*) FILTER (WHERE ohlcv_base.close < ohlcv_base.prev_close)     AS declines
            FROM {OHLCV_WITH_PREV}
            LEFT JOIN instruments i ON i.symbol = ohlcv_base.symbol AND i.exchange = 'NSE'
            LEFT JOIN sectors s ON s.id = i.sector_id
            WHERE ohlcv_base.trade_date = $1
              AND ohlcv_base.prev_close IS NOT NULL
              AND ohlcv_base.prev_close > 0
            GROUP BY {grp}
            HAVING {grp} IS NOT NULL
            ORDER BY avg_chg_pct DESC
            """,
            latest,
        )

        result = []
        for r in rows:
            sector = r["sector"]
            if not sector:
                continue
            avg = _safe_float(r["avg_chg_pct"])
            result.append({
                "sector":         sector,
                "avg_change_pct": avg,
                "stock_count":    int(r["stock_count"]),
                "advances":       int(r["advances"]),
                "declines":       int(r["declines"]),
                "top_gainer":     None,
                "top_loser":      None,
            })
        return result
    finally:
        await conn.close()


# ── Snapshot ───────────────────────────────────────────────────────────────────
@router.get("/snapshot")
async def get_snapshot():
    data = await cached_snapshot()
    # Add is_open field based on IST time
    from datetime import datetime, timezone, timedelta, time as dtime
    now_ist = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    is_open = (
        now_ist.weekday() < 5
        and dtime(9, 15) <= now_ist.time() <= dtime(15, 35)
    )
    data["is_open"] = is_open
    return data


# ── All Stocks ─────────────────────────────────────────────────────────────────
@router.get("/all-stocks")
async def get_all_stocks(
    page:    int        = Query(1, ge=1),
    size:    int        = Query(50, ge=1, le=500),
    search:  str | None = Query(None),
    sort_by: str        = Query("change_pct"),
    order:   str        = Query("desc"),
) -> dict:
    """
    Returns ALL 2060 NSE stocks with live prices from the live quote cache.
    Cache refreshes every 3 minutes during market hours, 15 minutes otherwise.
    """
    from app.services.live_quotes import get_live_quotes
    quotes = await get_live_quotes()

    stocks = list(quotes.values())

    # Search
    if search:
        s = search.upper()
        stocks = [q for q in stocks if s in q.get("symbol", "") or s in (q.get("name") or "").upper()]

    # Sort
    sort_map = {"change_pct": "change_pct", "close": "ltp", "ltp": "ltp",
                "volume": "volume", "symbol": "symbol"}
    key = sort_map.get(sort_by, "change_pct")
    reverse = order.lower() != "asc"
    stocks.sort(key=lambda x: (x.get(key) or 0) if key != "symbol" else (x.get("symbol") or ""),
                reverse=reverse)

    total = len(stocks)
    start = (page - 1) * size
    page_data = stocks[start:start + size]

    return {
        "stocks": [{
            "symbol":     q["symbol"],
            "name":       q.get("name", q["symbol"]),
            "sector":     q.get("sector"),
            "close":      q.get("ltp") or 0,
            "ltp":        q.get("ltp") or 0,
            "prev_close": q.get("prev_close"),
            "change":     q.get("change") or 0,
            "change_pct": q.get("change_pct") or 0,
            "volume":     q.get("volume") or 0,
            "high":       q.get("high"),
            "low":        q.get("low"),
            "open":       q.get("open"),
            "source":     q.get("source", "ohlcv_daily"),
            "trade_date": q.get("trade_date"),
        } for q in page_data],
        "total":      total,
        "page":       page,
        "size":       size,
        "pages":      max(1, (total + size - 1) // size),
        "trade_date": page_data[0].get("trade_date") if page_data else str(date.today()),
        "live":       any(q.get("source") == "yfinance_live" for q in page_data),
    }


# ── Live Quotes Bulk ───────────────────────────────────────────────────────────
@router.get("/live-quotes")
async def get_live_quotes_bulk(
    symbols: str | None = Query(None, description="Comma-separated NSE symbols"),
    force:   bool       = Query(False),
) -> dict:
    """Fast bulk live quote lookup. ?symbols=RELIANCE,TCS or no param for all."""
    from app.services.live_quotes import get_live_quotes
    all_q = await get_live_quotes(force_refresh=force)

    if symbols:
        syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
        result = {s: all_q[s] for s in syms if s in all_q}
    else:
        result = all_q

    return {"quotes": result, "count": len(result)}


# ── Global Search ──────────────────────────────────────────────────────────────
@router.get("/search")
async def search_stocks(
    q:     str = Query(..., min_length=1),
    limit: int = Query(15, ge=1, le=50),
) -> dict:
    """Search all NSE stocks by symbol or company name. Returns {results: [...]}"""
    from app.services.live_quotes import get_live_quotes
    quotes = await get_live_quotes()
    s = q.upper()
    results = [
        {
            "symbol":     v["symbol"],
            "name":       v.get("name", v["symbol"]),
            "close":      v.get("ltp") or 0,
            "change_pct": v.get("change_pct") or 0,
        }
        for v in quotes.values()
        if s in v.get("symbol", "") or s in (v.get("name") or "").upper()
    ]
    # Sort exact symbol matches first
    results.sort(key=lambda x: (0 if x["symbol"].startswith(s) else 1, x["symbol"]))
    results = results[:limit]
    return {"results": results, "total": len(results)}


# ── Quote Single (Enhanced with full OHLCV + live yfinance) ───────────────────
@router.get("/quote/{symbol}")
async def get_quote(symbol: str) -> dict:
    """
    Single stock live quote. Tries yfinance first for real-time price,
    falls back to DB cache. Returns full OHLCV fields.
    """
    import yfinance as yf
    sym = symbol.upper().strip()

    # Try yfinance first (real-time)
    def _fetch_yf(ticker_str: str) -> dict | None:
        try:
            t = yf.Ticker(ticker_str)
            fi = t.fast_info
            ltp  = getattr(fi, "last_price", None)
            prev = getattr(fi, "previous_close", None)
            if not ltp or ltp <= 0:
                return None
            chg  = round(ltp - prev, 2) if prev else 0.0
            chgp = round(chg / prev * 100, 2) if prev and prev > 0 else 0.0
            return {
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
                "is_live":    True,
            }
        except Exception:
            return None

    loop = asyncio.get_event_loop()
    try:
        q = await asyncio.wait_for(
            loop.run_in_executor(None, _fetch_yf, f"{sym}.NS"),
            timeout=10,
        )
    except asyncio.TimeoutError:
        q = None

    # Fallback to DB cache
    if not q:
        from app.services.live_quotes import get_quote_single
        db_q = await get_quote_single(sym)
        if db_q:
            q = {
                "symbol":     sym,
                "ltp":        db_q.get("ltp"),
                "open":       db_q.get("open"),
                "high":       db_q.get("high"),
                "low":        db_q.get("low"),
                "prev_close": db_q.get("prev_close"),
                "change":     db_q.get("change"),
                "change_pct": db_q.get("change_pct"),
                "volume":     db_q.get("volume"),
                "source":     db_q.get("source", "ohlcv_daily"),
                "is_live":    False,
            }

    if not q:
        raise HTTPException(status_code=404, detail=f"No data for {sym}")

    return q
