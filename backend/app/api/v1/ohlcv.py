"""
KP — OHLCV History API
GET /api/v1/ohlcv/{symbol}?period=1y
Returns raw OHLCV bars + RSI/MACD/SMA from ohlcv_daily.
This feeds: Backtesting, Market Replay, Instruments chart, AI Radar.
"""
from __future__ import annotations

import asyncpg
import structlog
from fastapi import APIRouter, HTTPException, Query
from datetime import date, timedelta

log = structlog.get_logger(__name__)
router = APIRouter()
DB = "postgresql://kp_user:kp_dev_password@localhost:5432/kp_db"


def _ema(values: list[float], n: int) -> list[float]:
    out, k = [], 2 / (n + 1)
    for i, v in enumerate(values):
        if i == 0:
            out.append(v)
        else:
            out.append(v * k + out[-1] * (1 - k))
    return out


def _rsi(closes: list[float], n: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * (n)
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
        if i >= n:
            ag = sum(gains[-n:]) / n
            al = sum(losses[-n:]) / n
            rs = ag / al if al > 0 else float("inf")
            out.append(round(100 - 100 / (1 + rs), 2))
    return out


def _macd(closes: list[float]):
    ema12 = _ema(closes, 12)
    ema26 = _ema(closes, 26)
    line  = [a - b for a, b in zip(ema12, ema26)]
    signal = _ema(line, 9)
    hist   = [l - s for l, s in zip(line, signal)]
    return (
        [round(v, 4) for v in line],
        [round(v, 4) for v in signal],
        [round(v, 4) for v in hist],
    )


def _sma(closes: list[float], n: int) -> list[float | None]:
    out: list[float | None] = []
    for i in range(len(closes)):
        if i < n - 1:
            out.append(None)
        else:
            out.append(round(sum(closes[i - n + 1: i + 1]) / n, 2))
    return out


@router.get("/{symbol}")
async def get_ohlcv(
    symbol: str,
    period: str = Query("1y", pattern="^(1m|3m|6m|1y)$"),
) -> dict:
    """
    Returns full OHLCV bar history + computed indicators.
    period: 1m=30days, 3m=90days, 6m=180days, 1y=365days
    """
    sym = symbol.upper().strip()
    days = {"1m": 35, "3m": 92, "6m": 185, "1y": 375}[period]
    since = date.today() - timedelta(days=days)

    conn = await asyncpg.connect(DB)
    try:
        rows = await conn.fetch(
            """
            SELECT trade_date, open, high, low, close, volume,
                   COALESCE(prev_close,
                       LAG(close) OVER (PARTITION BY symbol ORDER BY trade_date)
                   ) AS prev_close
            FROM ohlcv_daily
            WHERE symbol = $1 AND trade_date >= $2
            ORDER BY trade_date ASC
            """,
            sym, since,
        )
    finally:
        await conn.close()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail={
                "error": f"No OHLCV data for {sym} (period={period})",
                "remedy": f"python scripts/ingest_ohlcv.py --symbol {sym} --period 1y",
            },
        )

    closes  = [float(r["close"]) for r in rows]
    rsi_arr = _rsi(closes)
    macd_l, macd_s, macd_h = _macd(closes)
    sma20   = _sma(closes, 20)
    sma50   = _sma(closes, 50)
    ema12   = [round(v, 2) for v in _ema(closes, 12)]

    bars = []
    for i, r in enumerate(rows):
        pc = float(r["prev_close"]) if r["prev_close"] else (closes[i-1] if i > 0 else closes[i])
        bars.append({
            "trade_date": str(r["trade_date"]),
            "open":       round(float(r["open"]),  2),
            "high":       round(float(r["high"]),  2),
            "low":        round(float(r["low"]),   2),
            "close":      round(float(r["close"]), 2),
            "volume":     int(r["volume"]) if r["volume"] else 0,
            "prev_close": round(pc, 2),
            "change_pct": round((float(r["close"]) - pc) / pc * 100, 2) if pc > 0 else 0.0,
            "rsi":        rsi_arr[i],
            "macd":       macd_l[i],
            "macd_signal":macd_s[i],
            "macd_hist":  macd_h[i],
            "sma20":      sma20[i],
            "sma50":      sma50[i],
            "ema12":      ema12[i],
        })

    latest = bars[-1] if bars else {}
    return {
        "symbol":   sym,
        "exchange": "NSE",
        "period":   period,
        "count":    len(bars),
        "source":   "ohlcv_daily",
        "bars":     bars,
        # Convenience: latest values for AI assistant / instruments header
        "close":    latest.get("close"),
        "change_pct": latest.get("change_pct"),
        "rsi":      latest.get("rsi"),
        "macd":     latest.get("macd"),
        "sma20":    latest.get("sma20"),
        "ema12":    latest.get("ema12"),
    }
