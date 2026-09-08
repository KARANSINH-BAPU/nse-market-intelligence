"""
KP — Price & RSI Alerts API

Alerts are stored per-user in Redis (fast, ephemeral — appropriate for real-time alerts).
Each alert has: symbol, type (price_above/price_below/rsi_above/rsi_below), threshold,
created_at, triggered_at.

The broadcaster checks alerts every tick and pushes triggered ones via WebSocket.

Endpoints:
  POST   /api/v1/alerts           — create alert
  GET    /api/v1/alerts           — list all alerts for user
  DELETE /api/v1/alerts/{id}      — remove alert
  GET    /api/v1/alerts/triggered — list triggered alerts

No auth required (dev mode — stored by session key from WS client_id or anon).
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.db.redis import redis_client

router = APIRouter()

AlertType = Literal["price_above", "price_below", "rsi_above", "rsi_below", "macd_cross_up", "macd_cross_dn"]

ALERTS_KEY = "kp:alerts:all"          # Redis set of alert IDs
ALERT_KEY  = "kp:alert:{id}"          # Redis hash per alert
TRIGGERED  = "kp:alerts:triggered"    # Redis sorted-set of triggered alert IDs (score=timestamp)
TTL_DAYS   = 7                         # Alerts expire after 7 days


class AlertIn(BaseModel):
    symbol:    str                   = Field(..., min_length=1, max_length=30)
    type:      AlertType
    threshold: float                 = Field(..., description="Price in ₹, or RSI value 0-100")
    note:      str | None            = Field(None, max_length=200)


class AlertOut(BaseModel):
    id:           str
    symbol:       str
    type:         AlertType
    threshold:    float
    note:         str | None
    created_at:   str
    triggered_at: str | None
    active:       bool


def _key(alert_id: str) -> str:
    return ALERT_KEY.format(id=alert_id)


async def _get_redis():
    return redis_client


@router.post("", status_code=status.HTTP_201_CREATED, response_model=AlertOut)
async def create_alert(body: AlertIn) -> AlertOut:
    """Create a new price/RSI alert."""
    alert_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    data = {
        "id":           alert_id,
        "symbol":       body.symbol.upper().strip(),
        "type":         body.type,
        "threshold":    str(body.threshold),
        "note":         body.note or "",
        "created_at":   now,
        "triggered_at": "",
        "active":       "1",
    }

    rc = redis_client
    async with rc.pipeline() as pipe:
        pipe.hset(_key(alert_id), mapping=data)
        pipe.expire(_key(alert_id), TTL_DAYS * 86400)
        pipe.sadd(ALERTS_KEY, alert_id)
        pipe.expire(ALERTS_KEY, TTL_DAYS * 86400)
        await pipe.execute()

    return AlertOut(
        id=alert_id, symbol=data["symbol"], type=body.type,
        threshold=body.threshold, note=body.note,
        created_at=now, triggered_at=None, active=True,
    )


@router.get("", response_model=list[AlertOut])
async def list_alerts(
    symbol: str | None = Query(None),
    active_only: bool  = Query(False),
) -> list[AlertOut]:
    """List all alerts, optionally filtered by symbol or active status."""
    rc = redis_client
    ids = await rc.smembers(ALERTS_KEY)
    out: list[AlertOut] = []
    for aid in ids:
        raw = await rc.hgetall(_key(aid))
        if not raw:
            continue
        a = AlertOut(
            id=raw.get("id", aid),
            symbol=raw.get("symbol", ""),
            type=raw.get("type", "price_above"),  # type: ignore[arg-type]
            threshold=float(raw.get("threshold", 0)),
            note=raw.get("note") or None,
            created_at=raw.get("created_at", ""),
            triggered_at=raw.get("triggered_at") or None,
            active=raw.get("active", "0") == "1",
        )
        if symbol and a.symbol != symbol.upper():
            continue
        if active_only and not a.active:
            continue
        out.append(a)
    out.sort(key=lambda x: x.created_at, reverse=True)
    return out


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(alert_id: str) -> None:
    """Remove an alert by ID."""
    rc = redis_client
    exists = await rc.exists(_key(alert_id))
    if not exists:
        raise HTTPException(status_code=404, detail="Alert not found")
    async with rc.pipeline() as pipe:
        pipe.delete(_key(alert_id))
        pipe.srem(ALERTS_KEY, alert_id)
        await pipe.execute()


@router.get("/triggered", response_model=list[AlertOut])
async def list_triggered() -> list[AlertOut]:
    """List recently triggered alerts (last 7 days)."""
    rc = redis_client
    ids = await rc.smembers(ALERTS_KEY)
    out: list[AlertOut] = []
    for aid in ids:
        raw = await rc.hgetall(_key(aid))
        if not raw or not raw.get("triggered_at"):
            continue
        out.append(AlertOut(
            id=raw.get("id", aid),
            symbol=raw.get("symbol", ""),
            type=raw.get("type", "price_above"),   # type: ignore[arg-type]
            threshold=float(raw.get("threshold", 0)),
            note=raw.get("note") or None,
            created_at=raw.get("created_at", ""),
            triggered_at=raw.get("triggered_at") or None,
            active=raw.get("active", "0") == "1",
        ))
    out.sort(key=lambda x: x.triggered_at or "", reverse=True)
    return out


# ── Alert Checker (called from broadcaster) ────────────────────────────────
async def check_alerts(symbol: str, ltp: float, rsi: float | None = None) -> list[dict]:
    """
    Check all active alerts for `symbol` against current LTP and RSI.
    Returns list of triggered alert dicts (caller pushes via WebSocket).
    """
    rc = redis_client
    ids = await rc.smembers(ALERTS_KEY)
    triggered: list[dict] = []

    for aid in ids:
        raw = await rc.hgetall(_key(aid))
        if not raw or raw.get("active") != "1":
            continue
        if raw.get("symbol", "") != symbol:
            continue

        t     = raw.get("type", "")
        thresh = float(raw.get("threshold", 0))
        fired  = False

        if   t == "price_above" and ltp >= thresh:  fired = True
        elif t == "price_below" and ltp <= thresh:  fired = True
        elif t == "rsi_above"   and rsi is not None and rsi >= thresh: fired = True
        elif t == "rsi_below"   and rsi is not None and rsi <= thresh: fired = True

        if fired:
            now = datetime.now(timezone.utc).isoformat()
            await rc.hset(_key(aid), mapping={"triggered_at": now, "active": "0"})
            triggered.append({
                "type": "alert_triggered",
                "alert_id": aid,
                "symbol":   symbol,
                "alert_type": t,
                "threshold": thresh,
                "ltp":       ltp,
                "rsi":       rsi,
                "triggered_at": now,
                "note": raw.get("note", ""),
            })

    return triggered
