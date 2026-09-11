"""
KP — Technical Signals API

Scans all stocks with OHLCV data and generates technical signals based on:
  - RSI(14): Oversold < 30, Overbought > 70
  - MACD: Bullish/Bearish crossover
  - Price vs SMA20: Golden cross / Death cross

ALL signals derived exclusively from real yfinance OHLCV data stored in PostgreSQL.
These are TECHNICAL INDICATORS only — NOT financial advice, NOT predictions of future price.

Endpoints:
  GET /api/v1/signals            — scan all stocks, return signals list
  GET /api/v1/signals/{symbol}   — signals for single stock
"""
from __future__ import annotations

import asyncpg
import structlog
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

log = structlog.get_logger(__name__)
router = APIRouter()

DB_DSN = "postgresql://kp_user:kp_dev_password@localhost:5432/kp_db"


# ── Models ─────────────────────────────────────────────────────────────────
class Signal(BaseModel):
    symbol:      str
    name:        str | None
    sector:      str | None
    signal_type: str     # RSI_OVERSOLD | RSI_OVERBOUGHT | MACD_BULL | MACD_BEAR | SMA_BULL | SMA_BEAR
    strength:    str     # STRONG | MODERATE | WEAK
    rsi:         float | None
    macd:        float | None
    macd_signal: float | None
    close:       float
    sma20:       float | None
    change_pct:  float
    trade_date:  str
    description: str
    # Price action fields
    buy_price:   float | None = None   # Recommended entry price (BUY signals)
    sell_price:  float | None = None   # Recommended entry price (SELL signals)
    target:      float | None = None   # Target / take-profit price
    stop_loss:   float | None = None   # Stop-loss price
    disclaimer:  str = "Technical indicator only — not financial advice"


# ── Helpers ─────────────────────────────────────────────────────────────────
def _compute_rsi(closes: list[float], period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [d if d > 0 else 0.0 for d in deltas[-period:]]
    losses = [-d if d < 0 else 0.0 for d in deltas[-period:]]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def _compute_ema(closes: list[float], period: int) -> list[float]:
    if len(closes) < period:
        return []
    k = 2 / (period + 1)
    ema = [sum(closes[:period]) / period]
    for price in closes[period:]:
        ema.append(price * k + ema[-1] * (1 - k))
    return ema


def _compute_macd(closes: list[float]) -> tuple[float | None, float | None]:
    """Returns (macd_line, signal_line) using EMA12/EMA26/signal9."""
    if len(closes) < 35:
        return None, None
    ema12 = _compute_ema(closes, 12)
    ema26 = _compute_ema(closes, 26)
    if not ema12 or not ema26:
        return None, None
    # Align: ema26 starts 26 bars in, ema12 starts 12 bars in
    offset = 26 - 12
    macd_line = [ema12[i + offset] - ema26[i] for i in range(len(ema26))]
    if len(macd_line) < 9:
        return None, None
    signal_ema = _compute_ema(macd_line, 9)
    if not signal_ema:
        return None, None
    return round(macd_line[-1], 4), round(signal_ema[-1], 4)


def _compute_levels(signal_type: str, close: float, sma20: float | None, recent_high: float | None, recent_low: float | None) -> dict:
    """
    Compute actionable price levels for a signal:
    - BUY signals: buy_price near support, target ~5-10% above, stop_loss ~3-4% below
    - SELL signals: sell_price near resistance, target ~5-10% below, stop_loss ~3% above
    """
    support    = sma20 or close
    resistance = recent_high or close * 1.07

    if signal_type in ("RSI_OVERSOLD", "MACD_BULL", "SMA_BULL"):
        # BUY setup
        buy_price  = round(support * 0.995, 2)           # Just below SMA20 support
        target     = round(close * 1.07, 2)              # 7% upside target
        stop_loss  = round(support * 0.965, 2)           # 3.5% below support
        return {"buy_price": buy_price, "sell_price": None, "target": target, "stop_loss": stop_loss}
    else:
        # SELL setup
        sell_price = round((resistance or close * 1.02), 2)
        target     = round(close * 0.93, 2)              # 7% downside target
        stop_loss  = round((resistance or close) * 1.03, 2)  # 3% above resistance
        return {"buy_price": None, "sell_price": sell_price, "target": target, "stop_loss": stop_loss}


def _classify_signal(rsi, macd, macd_sig, close, sma20, recent_high=None, recent_low=None) -> list[dict]:
    """Return list of signals for a stock, including price levels. May have 0-3 signals."""
    signals = []

    if rsi is not None:
        if rsi < 30:
            strength = "STRONG" if rsi < 20 else "MODERATE"
            levels = _compute_levels("RSI_OVERSOLD", close, sma20, recent_high, recent_low)
            signals.append({
                "signal_type": "RSI_OVERSOLD",
                "strength":    strength,
                "description": f"RSI({rsi:.1f}) below 30 — stock is oversold, potential bounce",
                **levels,
            })
        elif rsi > 70:
            strength = "STRONG" if rsi > 80 else "MODERATE"
            levels = _compute_levels("RSI_OVERBOUGHT", close, sma20, recent_high, recent_low)
            signals.append({
                "signal_type": "RSI_OVERBOUGHT",
                "strength":    strength,
                "description": f"RSI({rsi:.1f}) above 70 — stock is overbought, potential pullback",
                **levels,
            })

    if macd is not None and macd_sig is not None:
        if macd > macd_sig and macd > 0:
            levels = _compute_levels("MACD_BULL", close, sma20, recent_high, recent_low)
            signals.append({
                "signal_type": "MACD_BULL",
                "strength":    "STRONG" if macd - macd_sig > abs(macd_sig) * 0.1 else "MODERATE",
                "description": f"MACD({macd:.3f}) > Signal({macd_sig:.3f}) — bullish momentum",
                **levels,
            })
        elif macd < macd_sig and macd < 0:
            levels = _compute_levels("MACD_BEAR", close, sma20, recent_high, recent_low)
            signals.append({
                "signal_type": "MACD_BEAR",
                "strength":    "STRONG" if macd_sig - macd > abs(macd_sig) * 0.1 else "MODERATE",
                "description": f"MACD({macd:.3f}) < Signal({macd_sig:.3f}) — bearish momentum",
                **levels,
            })

    if sma20 is not None and close is not None:
        pct_above = (close - sma20) / sma20 * 100
        if pct_above > 2:
            levels = _compute_levels("SMA_BULL", close, sma20, recent_high, recent_low)
            signals.append({
                "signal_type": "SMA_BULL",
                "strength":    "STRONG" if pct_above > 5 else "WEAK",
                "description": f"Price {pct_above:.1f}% above SMA20 — uptrend confirmed",
                **levels,
            })
        elif pct_above < -2:
            levels = _compute_levels("SMA_BEAR", close, sma20, recent_high, recent_low)
            signals.append({
                "signal_type": "SMA_BEAR",
                "strength":    "STRONG" if pct_above < -5 else "WEAK",
                "description": f"Price {abs(pct_above):.1f}% below SMA20 — downtrend pressure",
                **levels,
            })

    return signals


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
async def get_all_signals(
    signal_type: str | None = Query(None, description="Filter: RSI_OVERSOLD|RSI_OVERBOUGHT|MACD_BULL|MACD_BEAR"),
    sector:      str | None = Query(None),
    strength:    str | None = Query(None, description="STRONG|MODERATE|WEAK"),
    limit:       int        = Query(100, ge=1, le=500),
) -> dict:
    """
    Scan all stocks and return technical signals.
    Only stocks with at least 30 bars of OHLCV data are scanned.
    Disclaimer: Technical signals only — not financial advice.
    """
    conn = await asyncpg.connect(DB_DSN)
    try:
        # Get all symbols with enough data + their sector
        candidate_rows = await conn.fetch(
            """
            SELECT o.symbol, COALESCE(i.company_name, o.symbol) AS name,
                   s.name AS sector, COUNT(*) AS bar_count
            FROM ohlcv_daily o
            LEFT JOIN instruments i ON i.symbol = o.symbol AND i.exchange = 'NSE'
            LEFT JOIN sectors s ON s.id = i.sector_id
            GROUP BY o.symbol, i.company_name, s.name
            HAVING COUNT(*) >= 35
            ORDER BY o.symbol
            """
        )

        # Get latest date
        latest_dt = await conn.fetchval("SELECT MAX(trade_date) FROM ohlcv_daily")

        all_signals: list[dict] = []

        for meta in candidate_rows:
            sym = meta["symbol"]
            if sector and meta["sector"] != sector:
                continue

            # Get last 60 bars for this symbol
            bars = await conn.fetch(
                "SELECT close, prev_close, high, low FROM ohlcv_daily "
                "WHERE symbol = $1 ORDER BY trade_date DESC LIMIT 60",
                sym,
            )
            if len(bars) < 15:
                continue

            closes      = [float(r["close"]) for r in reversed(bars)]
            recent_high = max(float(r["high"]) for r in bars[:20] if r["high"])
            recent_low  = min(float(r["low"])  for r in bars[:20] if r["low"])
            last_bar = bars[0]
            close = float(last_bar["close"])
            prev  = float(last_bar["prev_close"]) if last_bar["prev_close"] else close
            chg_pct = round((close - prev) / prev * 100, 2) if prev > 0 else 0.0

            rsi          = _compute_rsi(closes)
            macd, macd_s = _compute_macd(closes)
            sma20        = round(sum(closes[-20:]) / 20, 2) if len(closes) >= 20 else None

            sigs = _classify_signal(rsi, macd, macd_s, close, sma20, recent_high, recent_low)

            for s in sigs:
                if signal_type and s["signal_type"] != signal_type:
                    continue
                if strength and s["strength"] != strength:
                    continue
                all_signals.append({
                    "symbol":      sym,
                    "name":        meta["name"] or sym,
                    "sector":      meta["sector"],
                    "signal_type": s["signal_type"],
                    "strength":    s["strength"],
                    "description": s["description"],
                    "rsi":         rsi,
                    "macd":        macd,
                    "macd_signal": macd_s,
                    "close":       close,
                    "sma20":       sma20,
                    "change_pct":  chg_pct,
                    "trade_date":  str(latest_dt),
                    "buy_price":   s.get("buy_price"),
                    "sell_price":  s.get("sell_price"),
                    "target":      s.get("target"),
                    "stop_loss":   s.get("stop_loss"),
                    "disclaimer":  "Technical indicator only — not financial advice",
                })

        # Sort: STRONG first, then by RSI extremity
        strength_order = {"STRONG": 0, "MODERATE": 1, "WEAK": 2}
        all_signals.sort(key=lambda x: (strength_order.get(x["strength"], 3), abs(x.get("rsi", 50) - 50) * -1))

        return {
            "signals":      all_signals[:limit],
            "total":        len(all_signals),
            "scanned":      len(candidate_rows),
            "trade_date":   str(latest_dt),
            "disclaimer":   "All signals are derived from technical indicators (RSI/MACD/SMA). "
                            "They are NOT predictions of future prices and NOT financial advice.",
        }
    finally:
        await conn.close()


@router.get("/{symbol}", response_model=dict)
async def get_symbol_signals(symbol: str) -> dict:
    """Get all technical signals for a specific symbol, including buy/sell price levels."""
    conn = await asyncpg.connect(DB_DSN)
    try:
        sym = symbol.upper().strip()
        bars = await conn.fetch(
            "SELECT close, prev_close, high, low, trade_date FROM ohlcv_daily "
            "WHERE symbol = $1 ORDER BY trade_date DESC LIMIT 60",
            sym,
        )
        if not bars:
            raise HTTPException(status_code=404, detail=f"No data for {sym}")

        meta = await conn.fetchrow(
            "SELECT company_name, sector_id FROM instruments WHERE symbol = $1 AND exchange = 'NSE'",
            sym,
        )
        sec_name = None
        if meta and meta["sector_id"]:
            sec_row = await conn.fetchrow("SELECT name FROM sectors WHERE id = $1", meta["sector_id"])
            sec_name = sec_row["name"] if sec_row else None

        closes      = [float(r["close"]) for r in reversed(bars)]
        recent_high = max(float(r["high"]) for r in bars[:20] if r["high"])
        recent_low  = min(float(r["low"])  for r in bars[:20] if r["low"])
        last = bars[0]
        close = float(last["close"])
        prev  = float(last["prev_close"]) if last["prev_close"] else close
        chg_pct = round((close - prev) / prev * 100, 2) if prev > 0 else 0.0

        rsi          = _compute_rsi(closes)
        macd, macd_s = _compute_macd(closes)
        sma20        = round(sum(closes[-20:]) / 20, 2) if len(closes) >= 20 else None
        ema12_list   = _compute_ema(closes, 12)
        ema12        = round(ema12_list[-1], 2) if ema12_list else None

        sigs = _classify_signal(rsi, macd, macd_s, close, sma20, recent_high, recent_low)

        return {
            "symbol":     sym,
            "name":       meta["company_name"] if meta else sym,
            "sector":     sec_name,
            "close":      close,
            "change_pct": chg_pct,
            "rsi":        rsi,
            "macd":       macd,
            "macd_signal": macd_s,
            "sma20":      sma20,
            "ema12":      ema12,
            "signals":    sigs,
            "bars_used":  len(bars),
            "trade_date": str(last["trade_date"]),
            "disclaimer": "Technical indicators only — not financial advice",
        }
    finally:
        await conn.close()
