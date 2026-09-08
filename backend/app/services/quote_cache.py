"""
KP Backend — Quote Cache (Redis)

Wraps market_data service with Redis TTL caching.
  - Single quote:  TTL 30s
  - Index snapshot: TTL 15s
  - OHLCV bars:    TTL 5min (daily), 60s (intraday)

All cache misses fall through to yfinance — never fabricates data.
Cache keys: kp:quote:{symbol}  kp:snapshot  kp:ohlcv:{symbol}:{period}:{interval}
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

import structlog

from app.services.market_data import fetch_index_quotes, fetch_ohlcv, fetch_quote

log = structlog.get_logger(__name__)

_REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

# TTLs in seconds
_TTL_QUOTE    = 30
_TTL_SNAPSHOT = 15
_TTL_OHLCV_INTRADAY = 60
_TTL_OHLCV_DAILY    = 300


async def _get_redis():
    """Lazy Redis connection — returns None if Redis unavailable."""
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(_REDIS_URL, decode_responses=True, socket_connect_timeout=2)
        await r.ping()
        return r
    except Exception:
        return None


async def cached_quote(symbol: str) -> dict[str, Any] | None:
    """Quote with Redis cache (TTL 30s). Falls through to yfinance on miss."""
    key = f"kp:quote:{symbol.upper()}"
    redis = await _get_redis()

    if redis:
        try:
            cached = await redis.get(key)
            if cached:
                data = json.loads(cached)
                data["cache"] = "HIT"
                return data
        except Exception as e:
            log.warning("redis_get_failed", key=key, error=str(e))

    # Cache miss — fetch live
    data = await fetch_quote(symbol)
    if data and redis:
        try:
            data["cache"] = "MISS"
            await redis.setex(key, _TTL_QUOTE, json.dumps(data))
        except Exception as e:
            log.warning("redis_set_failed", key=key, error=str(e))
    return data


async def cached_snapshot() -> dict[str, Any]:
    """Index snapshot with Redis cache (TTL 15s)."""
    key = "kp:snapshot"
    redis = await _get_redis()

    if redis:
        try:
            cached = await redis.get(key)
            if cached:
                data = json.loads(cached)
                data["cache"] = "HIT"
                return data
        except Exception as e:
            log.warning("redis_get_failed", key=key, error=str(e))

    data = await fetch_index_quotes()
    result = {
        "indices":    data,
        "source":     "yfinance",
        "cache":      "MISS",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    if redis:
        try:
            await redis.setex(key, _TTL_SNAPSHOT, json.dumps(result))
        except Exception as e:
            log.warning("redis_set_failed", key=key, error=str(e))
    return result


async def cached_ohlcv(symbol: str, period: str, interval: str) -> list[dict]:
    """OHLCV with Redis cache. TTL depends on interval."""
    key = f"kp:ohlcv:{symbol.upper()}:{period}:{interval}"
    ttl = _TTL_OHLCV_DAILY if interval in ("1d", "1wk", "1mo") else _TTL_OHLCV_INTRADAY
    redis = await _get_redis()

    if redis:
        try:
            cached = await redis.get(key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            log.warning("redis_get_failed", key=key, error=str(e))

    bars = await fetch_ohlcv(symbol, period=period, interval=interval)
    if bars and redis:
        try:
            await redis.setex(key, ttl, json.dumps(bars))
        except Exception as e:
            log.warning("redis_set_failed", key=key, error=str(e))
    return bars
