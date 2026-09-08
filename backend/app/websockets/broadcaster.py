"""
KP Backend — Market Ticker Broadcaster

Background asyncio task that runs while the server is up.
Every TICK_INTERVAL seconds (15s in market hours, 60s otherwise):
  1. Fetches NIFTY50 + BANKNIFTY via cached_snapshot()
  2. Broadcasts to all clients subscribed to channel "market"

Message format (type=tick):
  {
    "type": "tick",
    "channel": "market",
    "ts": "2026-09-08T08:30:00Z",
    "phase": "market_hours",
    "is_open": true,
    "indices": {
      "NIFTY50":   {"ltp": 23645.8, "change": -133.35, "change_pct": -0.5608, ...},
      "BANKNIFTY": {"ltp": 56826.15, ...}
    }
  }

All values sourced from yfinance via quote_cache — never fabricated.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog

from app.services.quote_cache import cached_snapshot
from app.websockets.manager import ws_manager

log = structlog.get_logger(__name__)

TICK_INTERVAL_OPEN   = 15   # seconds — during market hours
TICK_INTERVAL_CLOSED = 60   # seconds — pre/post market


def _is_market_open() -> bool:
    """Quick IST open check — Mon-Fri 09:15–15:30."""
    from zoneinfo import ZoneInfo
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    if now.weekday() >= 5:
        return False
    open_t  = now.replace(hour=9,  minute=15, second=0, microsecond=0)
    close_t = now.replace(hour=15, minute=30, second=0, microsecond=0)
    return open_t <= now <= close_t


async def market_ticker_loop() -> None:
    """
    Runs forever as a background task (started in FastAPI lifespan).
    Broadcasts NIFTY + BANKNIFTY ticks to 'market' channel subscribers.
    """
    log.info("market_ticker_started")
    consecutive_errors = 0

    while True:
        interval = TICK_INTERVAL_OPEN if _is_market_open() else TICK_INTERVAL_CLOSED
        await asyncio.sleep(interval)

        # Skip if no one is listening
        if ws_manager.subscription_count("market") == 0:
            continue

        try:
            snap = await cached_snapshot()
            is_open = _is_market_open()
            indices = snap.get("indices", {})
            msg = {
                "type":    "tick",
                "channel": "market",
                "ts":      datetime.now(timezone.utc).isoformat(),
                "phase":   snap.get("cache", ""),   # HIT or MISS
                "is_open": is_open,
                "indices": indices,
            }
            n = await ws_manager.broadcast_to_channel("market", msg)
            log.debug("market_tick_broadcast", clients=n,
                      nifty=indices.get("NIFTY 50", {}).get("ltp"))
            consecutive_errors = 0

            # ── Alert checking ──────────────────────────────────────────
            # Check each index LTP against any active alerts
            try:
                from app.api.v1.alerts import check_alerts
                for sym, quote in indices.items():
                    ltp = quote.get("ltp")
                    if ltp is None:
                        continue
                    triggered = await check_alerts(sym, ltp)
                    for alert_msg in triggered:
                        # Push to ALL connected clients (alerts are global in dev mode)
                        await ws_manager.broadcast_to_channel("market", alert_msg)
                        log.info("alert_triggered", symbol=sym, alert_type=alert_msg.get("alert_type"),
                                 threshold=alert_msg.get("threshold"), ltp=ltp)
            except Exception as alert_exc:
                log.warning("alert_check_error", error=str(alert_exc)[:100])

        except asyncio.CancelledError:
            log.info("market_ticker_cancelled")
            return
        except Exception as exc:
            consecutive_errors += 1
            log.warning("market_ticker_error", error=str(exc),
                        consecutive=consecutive_errors)
            # Back off exponentially if repeatedly failing
            if consecutive_errors >= 5:
                await asyncio.sleep(min(interval * consecutive_errors, 300))
