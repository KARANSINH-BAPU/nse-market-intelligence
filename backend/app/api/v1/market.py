"""
KP — Market API (movers, breadth, sector-performance, all-stocks, search, quote)

All data from PostgreSQL ohlcv_daily — real yfinance data, never fabricated.
prev_close backfilled via LAG window; also stored in column after migration.
"""
from __future__ import annotations

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


def _safe_float(v) -> float:
    """Convert to float; return 0.0 for None/NaN/Inf."""
    try:
        f = float(v)
        return 0.0 if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return 0.0


async def _latest_date(conn) -> date:
    row = await conn.fetchrow("SELECT MAX(trade_date) AS dt FROM ohlcv_daily")
    return row["dt"] if row and row["dt"] else date.today() - timedelta(days=1)


# Inline subquery that computes prev_close from LAG when column is NULL
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
    change: float | None
    change_pct: float | None
    source: str


# ── Movers ──────────────────────────────────────────────────────────────────
@router.get("/movers")
async def get_movers(limit: int = Query(10, ge=1, le=50)):
    """Top gainers and losers from the most recent trading session."""
    conn = await asyncpg.connect(DB)
    try:
        latest = await _latest_date(conn)
        rows = await conn.fetch(
            f"""
            SELECT
                ohlcv_base.symbol,
                COALESCE(i.company_name, ohlcv_base.symbol) AS name,
                s.name                                      AS sector,
                ohlcv_base.close,
                ohlcv_base.prev_close,
                (ohlcv_base.close - ohlcv_base.prev_close)  AS change,
                ROUND(((ohlcv_base.close - ohlcv_base.prev_close) / ohlcv_base.prev_close * 100)::numeric, 2) AS change_pct,
                ohlcv_base.volume
            FROM {OHLCV_WITH_PREV}
            LEFT JOIN instruments i ON i.symbol = ohlcv_base.symbol AND i.exchange = 'NSE'
            LEFT JOIN sectors s ON s.id = i.sector_id
            WHERE ohlcv_base.trade_date = $1
              AND ohlcv_base.prev_close IS NOT NULL
              AND ohlcv_base.prev_close > 0
              AND ohlcv_base.close > 0
            """,
            latest,
        )

        def row_dict(r) -> dict:
            return {
                "symbol":     r["symbol"],
                "name":       r["name"],
                "sector":     r["sector"],
                "close":      _safe_float(r["close"]),
                "prev_close": _safe_float(r["prev_close"]),
                "change":     _safe_float(r["change"]),
                "change_pct": _safe_float(r["change_pct"]),
                "volume":     int(r["volume"]) if r["volume"] else 0,
                "trade_date": str(latest),
            }

        all_m   = [row_dict(r) for r in rows]
        gainers = sorted(all_m, key=lambda x: x["change_pct"], reverse=True)[:limit]
        losers  = sorted(all_m, key=lambda x: x["change_pct"])[:limit]
        return {"gainers": gainers, "losers": losers,
                "trade_date": str(latest), "total_stocks": len(all_m)}
    finally:
        await conn.close()


# ── Breadth ──────────────────────────────────────────────────────────────────
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


# ── Sector Performance ────────────────────────────────────────────────────────
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

            tg = await conn.fetchrow(
                f"""
                SELECT ohlcv_base.symbol FROM {OHLCV_WITH_PREV}
                LEFT JOIN instruments i ON i.symbol = ohlcv_base.symbol AND i.exchange = 'NSE'
                LEFT JOIN sectors s ON s.id = i.sector_id
                WHERE ohlcv_base.trade_date = $1 AND ohlcv_base.prev_close > 0
                  AND {grp} = $2
                ORDER BY (ohlcv_base.close - ohlcv_base.prev_close) / ohlcv_base.prev_close DESC LIMIT 1
                """,
                latest, sector,
            )
            tl = await conn.fetchrow(
                f"""
                SELECT ohlcv_base.symbol FROM {OHLCV_WITH_PREV}
                LEFT JOIN instruments i ON i.symbol = ohlcv_base.symbol AND i.exchange = 'NSE'
                LEFT JOIN sectors s ON s.id = i.sector_id
                WHERE ohlcv_base.trade_date = $1 AND ohlcv_base.prev_close > 0
                  AND {grp} = $2
                ORDER BY (ohlcv_base.close - ohlcv_base.prev_close) / ohlcv_base.prev_close ASC LIMIT 1
                """,
                latest, sector,
            )
            result.append({
                "sector":         sector,
                "avg_change_pct": avg,
                "stock_count":    int(r["stock_count"]),
                "advances":       int(r["advances"]),
                "declines":       int(r["declines"]),
                "top_gainer":     tg["symbol"] if tg else None,
                "top_loser":      tl["symbol"] if tl else None,
            })
        return result
    finally:
        await conn.close()


# ── Snapshot ──────────────────────────────────────────────────────────────────
@router.get("/snapshot")
async def get_snapshot():
    return await cached_snapshot()


# ── Quote ──────────────────────────────────────────────────────────────────────
@router.get("/quote/{symbol}", response_model=IndexQuote)
async def get_quote(symbol: str) -> IndexQuote:
    import yfinance as yf
    sym = symbol.upper().strip()
    ltp = change = change_pct = None
    source = "ohlcv_daily"
    try:
        info = yf.Ticker(f"{sym}.NS").fast_info
        ltp  = getattr(info, "last_price", None)
        prev = getattr(info, "previous_close", None)
        if ltp and prev and prev > 0:
            change     = round(ltp - prev, 2)
            change_pct = round((ltp - prev) / prev * 100, 4)
            source     = "yfinance"
    except Exception:
        pass

    if ltp is None:
        conn = await asyncpg.connect(DB)
        try:
            r = await conn.fetchrow(
                f"""
                SELECT ohlcv_base.close, ohlcv_base.prev_close FROM {OHLCV_WITH_PREV}
                WHERE ohlcv_base.symbol = $1
                ORDER BY ohlcv_base.trade_date DESC LIMIT 1
                """,
                sym,
            )
            if r:
                ltp  = _safe_float(r["close"]) or None
                prev = _safe_float(r["prev_close"]) or None
                if ltp and prev and prev > 0:
                    change     = round(ltp - prev, 2)
                    change_pct = round((ltp - prev) / prev * 100, 4)
        finally:
            await conn.close()

    if ltp is None:
        raise HTTPException(status_code=404, detail=f"No data for {sym}")

    return IndexQuote(symbol=sym, ltp=ltp, change=change,
                      change_pct=change_pct, source=source)


# ── Global Search ─────────────────────────────────────────────────────────────
@router.get("/search")
async def search_stocks(
    q:     str = Query(..., min_length=1),
    limit: int = Query(15, ge=1, le=50),
) -> list[dict]:
    """Search all NSE stocks by symbol or company name. Used by global search bar."""
    conn = await asyncpg.connect(DB)
    try:
        latest = await _latest_date(conn)
        rows = await conn.fetch(
            f"""
            SELECT DISTINCT ON (ohlcv_base.symbol)
                ohlcv_base.symbol,
                COALESCE(i.company_name, ohlcv_base.symbol) AS name,
                ohlcv_base.close,
                ROUND(CASE WHEN ohlcv_base.prev_close > 0
                    THEN ((ohlcv_base.close - ohlcv_base.prev_close) / ohlcv_base.prev_close * 100)
                    ELSE 0 END::numeric, 2) AS change_pct
            FROM {OHLCV_WITH_PREV}
            LEFT JOIN instruments i ON i.symbol = ohlcv_base.symbol AND i.exchange = 'NSE'
            WHERE ohlcv_base.trade_date = $1
              AND (
                UPPER(ohlcv_base.symbol) LIKE $2
                OR UPPER(COALESCE(i.company_name, '')) LIKE $2
              )
            ORDER BY ohlcv_base.symbol, ohlcv_base.trade_date DESC
            LIMIT $3
            """,
            latest, f"%{q.upper()}%", limit,
        )
        return [{
            "symbol":     r["symbol"],
            "name":       r["name"],
            "close":      _safe_float(r["close"]),
            "change_pct": _safe_float(r["change_pct"]),
        } for r in rows]
    finally:
        await conn.close()


# ── All Stocks ─────────────────────────────────────────────────────────────────
@router.get("/all-stocks")
async def get_all_stocks(
    page:    int        = Query(1, ge=1),
    size:    int        = Query(50, ge=1, le=200),
    search:  str | None = Query(None),
    sort_by: str        = Query("change_pct"),
    order:   str        = Query("desc"),
) -> dict:
    conn = await asyncpg.connect(DB)
    try:
        latest = await _latest_date(conn)

        search_sql = ""
        params: list = [latest]
        idx = 2
        if search:
            search_sql = (
                f" AND (UPPER(ohlcv_base.symbol) LIKE ${idx}"
                f" OR UPPER(COALESCE(i.company_name,'')) LIKE ${idx})"
            )
            params.append(f"%{search.upper()}%")
            idx += 1

        sort_map = {
            "change_pct": "change_pct",
            "close":      "close",
            "volume":     "volume",
            "symbol":     "symbol",
        }
        sort_col = sort_map.get(sort_by, "change_pct")
        sort_dir = "ASC" if order.lower() == "asc" else "DESC"

        base = f"""
            SELECT
                ohlcv_base.symbol,
                COALESCE(i.company_name, ohlcv_base.symbol) AS name,
                s.name AS sector,
                ohlcv_base.close,
                ohlcv_base.prev_close,
                (ohlcv_base.close - ohlcv_base.prev_close) AS change,
                ROUND(CASE WHEN ohlcv_base.prev_close > 0
                    THEN ((ohlcv_base.close - ohlcv_base.prev_close) / ohlcv_base.prev_close * 100)
                    ELSE 0 END::numeric, 2) AS change_pct,
                ohlcv_base.volume,
                ohlcv_base.high,
                ohlcv_base.low,
                ohlcv_base.open
            FROM {OHLCV_WITH_PREV}
            LEFT JOIN instruments i
              ON i.symbol = ohlcv_base.symbol AND i.exchange = 'NSE'
            LEFT JOIN sectors s ON s.id = i.sector_id
            WHERE ohlcv_base.trade_date = $1
              AND ohlcv_base.close > 0
              {search_sql}
        """

        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM ({base}) counted", *params
        )
        data = await conn.fetch(
            f"""
            SELECT * FROM ({base}) ranked
            ORDER BY {sort_col} {sort_dir} NULLS LAST
            LIMIT ${idx} OFFSET ${idx + 1}
            """,
            *params, size, (page - 1) * size,
        )

        return {
            "stocks": [{
                "symbol":     r["symbol"],
                "name":       r["name"],
                "sector":     r["sector"],
                "close":      _safe_float(r["close"]),
                "prev_close": _safe_float(r["prev_close"]),
                "change":     _safe_float(r["change"]),
                "change_pct": _safe_float(r["change_pct"]),
                "volume":     int(r["volume"]) if r["volume"] else 0,
                "high":       _safe_float(r["high"]) or None,
                "low":        _safe_float(r["low"]) or None,
                "open":       _safe_float(r["open"]) or None,
            } for r in data],
            "total":      total,
            "page":       page,
            "size":       size,
            "pages":      max(1, (total + size - 1) // size),
            "trade_date": str(latest),
        }
    finally:
        await conn.close()
