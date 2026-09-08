"""
KP Backend — Technical Feature Engineering

Computes technical indicators from OHLCV data stored in ohlcv_daily.
ALL values derived from real historical data — never fabricated.

Supported indicators:
  returns_1d    — daily log return
  returns_5d    — 5-day rolling return
  vol_20d       — 20-day rolling volatility (annualized)
  rsi_14        — RSI(14)
  macd_line     — MACD line (EMA12 - EMA26)
  macd_signal   — Signal line (EMA9 of MACD)
  macd_hist     — MACD histogram
  sma_20        — 20-day simple moving average
  ema_12        — 12-day exponential moving average

Usage:
    from app.services.features import compute_features
    df = await compute_features(conn, "RELIANCE", lookback=200)
"""
from __future__ import annotations

import math
from datetime import date
from typing import Any

import structlog

log = structlog.get_logger(__name__)


# ── Pure maths helpers ─────────────────────────────────────────────────────────

def _ema(values: list[float], period: int) -> list[float | None]:
    """Exponential moving average. Returns list aligned with input."""
    result: list[float | None] = [None] * len(values)
    if len(values) < period:
        return result
    k = 2.0 / (period + 1)
    # Seed with SMA of first `period` values
    sma = sum(values[:period]) / period
    result[period - 1] = sma
    prev = sma
    for i in range(period, len(values)):
        cur = values[i] * k + prev * (1 - k)
        result[i] = cur
        prev = cur
    return result


def _sma(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    for i in range(period - 1, len(values)):
        result[i] = sum(values[i - period + 1 : i + 1]) / period
    return result


def _rsi(closes: list[float], period: int = 14) -> list[float | None]:
    result: list[float | None] = [None] * len(closes)
    if len(closes) < period + 1:
        return result

    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))

    # Wilder's smoothing
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(closes)):
        idx = i  # maps to closes[i]
        g = gains[i - 1]
        l_ = losses[i - 1]
        avg_gain = (avg_gain * (period - 1) + g) / period
        avg_loss = (avg_loss * (period - 1) + l_) / period
        if avg_loss == 0:
            result[idx] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[idx] = round(100 - 100 / (1 + rs), 4)

    return result


def _log_return(closes: list[float]) -> list[float | None]:
    result: list[float | None] = [None]
    for i in range(1, len(closes)):
        if closes[i - 1] > 0 and closes[i] > 0:
            result.append(round(math.log(closes[i] / closes[i - 1]) * 100, 6))
        else:
            result.append(None)
    return result


def _rolling_vol(log_returns: list[float | None], window: int = 20) -> list[float | None]:
    """Annualized rolling volatility (std of log returns × sqrt(252))."""
    result: list[float | None] = [None] * len(log_returns)
    for i in range(window - 1, len(log_returns)):
        chunk = [r for r in log_returns[i - window + 1 : i + 1] if r is not None]
        if len(chunk) < window // 2:
            continue
        mean = sum(chunk) / len(chunk)
        var = sum((x - mean) ** 2 for x in chunk) / len(chunk)
        result[i] = round(math.sqrt(var) * math.sqrt(252), 6)
    return result


# ── Main feature computation ───────────────────────────────────────────────────

async def compute_features(
    conn: Any,  # asyncpg.Connection
    symbol: str,
    lookback: int = 300,
) -> list[dict[str, Any]]:
    """
    Fetch OHLCV from DB and compute technical features.
    Returns list of dicts (one per trading day), latest last.
    Returns [] if no OHLCV data available.
    """
    rows = await conn.fetch(
        """
        SELECT trade_date, open, high, low, close, volume
        FROM ohlcv_daily
        WHERE symbol = $1 AND exchange = 'NSE'
        ORDER BY trade_date ASC
        LIMIT $2
        """,
        symbol.upper(),
        lookback,
    )

    if not rows:
        log.warning("features_no_data", symbol=symbol)
        return []

    dates   = [r["trade_date"] for r in rows]
    closes  = [float(r["close"]) for r in rows]
    opens   = [float(r["open"]) if r["open"] else None for r in rows]
    highs   = [float(r["high"]) if r["high"] else None for r in rows]
    lows    = [float(r["low"]) if r["low"] else None for r in rows]
    volumes = [int(r["volume"]) if r["volume"] else 0 for r in rows]

    n = len(closes)
    log_rets = _log_return(closes)
    sma20    = _sma(closes, 20)
    ema12    = _ema(closes, 12)
    ema26    = _ema(closes, 26)
    rsi14    = _rsi(closes, 14)
    vol20    = _rolling_vol(log_rets, 20)

    # MACD
    macd_line   = [
        round(ema12[i] - ema26[i], 4) if (ema12[i] and ema26[i]) else None
        for i in range(n)
    ]
    macd_nums  = [v if v is not None else 0.0 for v in macd_line]
    macd_sig   = _ema(macd_nums, 9)
    macd_hist  = [
        round(macd_line[i] - macd_sig[i], 4)
        if (macd_line[i] is not None and macd_sig[i] is not None)
        else None
        for i in range(n)
    ]

    # 5-day return
    ret5 = [None] * n
    for i in range(5, n):
        if closes[i - 5] > 0:
            ret5[i] = round((closes[i] - closes[i - 5]) / closes[i - 5] * 100, 4)

    result = []
    for i in range(n):
        result.append({
            "date":        dates[i].isoformat() if hasattr(dates[i], "isoformat") else str(dates[i]),
            "open":        opens[i],
            "high":        highs[i],
            "low":         lows[i],
            "close":       closes[i],
            "volume":      volumes[i],
            "returns_1d":  log_rets[i],
            "returns_5d":  ret5[i],
            "vol_20d":     vol20[i],
            "sma_20":      round(sma20[i], 4) if sma20[i] else None,
            "ema_12":      round(ema12[i], 4) if ema12[i] else None,
            "rsi_14":      rsi14[i],
            "macd_line":   macd_line[i],
            "macd_signal": round(macd_sig[i], 4) if macd_sig[i] else None,
            "macd_hist":   macd_hist[i],
        })

    log.info("features_computed", symbol=symbol, bars=n, source="ohlcv_daily")
    return result
