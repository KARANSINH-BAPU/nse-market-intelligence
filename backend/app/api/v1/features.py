"""
KP Backend — Features API
GET /api/v1/features/{symbol}?lookback=200
Returns RSI/MACD/EMA/SMA/Vol from ohlcv_daily — real data only.
"""
from __future__ import annotations

from typing import Any

import asyncpg
import structlog
from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import get_settings
from app.services.features import compute_features

log = structlog.get_logger(__name__)
router = APIRouter()


async def _get_pg_conn() -> asyncpg.Connection:
    settings = get_settings()
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return await asyncpg.connect(url)


@router.get("/{symbol}", summary="Technical features for an NSE equity")
async def get_features(
    symbol: str,
    lookback: int = Query(200, ge=10, le=1000, description="Max trading days"),
) -> dict[str, Any]:
    """
    Returns RSI(14), MACD(12,26,9), EMA(12), SMA(20), 20-day rolling vol,
    daily + 5-day log returns — all computed from ohlcv_daily.
    Requires prior ingestion via: python scripts/ingest_ohlcv.py --symbol {symbol}
    All values are real calculations — never fabricated.
    """
    sym = symbol.upper()
    conn = await _get_pg_conn()
    try:
        rows = await compute_features(conn, sym, lookback=lookback)
    finally:
        await conn.close()

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": f"No OHLCV data for {sym}",
                "remedy": f"python scripts/ingest_ohlcv.py --symbol {sym} --period 1y",
            },
        )

    return {
        "symbol":     sym,
        "exchange":   "NSE",
        "lookback":   lookback,
        "count":      len(rows),
        "source":     "ohlcv_daily",
        "indicators": [
            "returns_1d", "returns_5d", "vol_20d",
            "sma_20", "ema_12", "rsi_14",
            "macd_line", "macd_signal", "macd_hist",
        ],
        "features": rows,
    }
