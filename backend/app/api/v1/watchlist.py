"""
KP Backend — Watchlist API
Named watchlists with JSONB symbol arrays.

POST   /api/v1/watchlist/                      — create named watchlist
GET    /api/v1/watchlist/                      — list my watchlists
GET    /api/v1/watchlist/{wid}                 — get one watchlist
PATCH  /api/v1/watchlist/{wid}/add/{symbol}    — add symbol to list
PATCH  /api/v1/watchlist/{wid}/remove/{symbol} — remove symbol from list
DELETE /api/v1/watchlist/{wid}                 — delete watchlist
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_user
from app.db.session import get_session
from app.models.user import User
from app.models.watchlist import Watchlist

log = structlog.get_logger(__name__)
router = APIRouter()


class WatchlistCreate(BaseModel):
    name: str
    is_default: bool = False
    symbols: list[str] = []


def _wl_dict(w: Watchlist) -> dict[str, Any]:
    return {
        "id": str(w.id),
        "name": w.name,
        "is_default": w.is_default,
        "symbols": w.symbols or [],
        "count": len(w.symbols or []),
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "updated_at": w.updated_at.isoformat() if w.updated_at else None,
    }


def _get_user_uuid(user_id: str) -> uuid.UUID:
    """Convert string user ID to UUID safely."""
    return uuid.UUID(user_id)


# ── Create watchlist ──────────────────────────────────────────────
@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a named watchlist")
async def create_watchlist(
    payload: WatchlistCreate,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    symbols = [s.upper().strip() for s in payload.symbols if s.strip()]

    wl = Watchlist(
        id=uuid.uuid4(),
        user_id=_get_user_uuid(user.id),
        name=payload.name.strip(),
        is_default=payload.is_default,
        symbols=symbols,
    )
    db.add(wl)
    await db.flush()

    log.info("watchlist_created", user=user.username, name=wl.name)
    return _wl_dict(wl)


# ── List watchlists ───────────────────────────────────────────────
@router.get("", summary="List all my watchlists")
async def list_watchlists(
    db: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    rows = (await db.execute(
        select(Watchlist)
        .where(Watchlist.user_id == _get_user_uuid(user.id))
        .order_by(Watchlist.is_default.desc(), Watchlist.name)
    )).scalars().all()

    return {"count": len(rows), "items": [_wl_dict(r) for r in rows]}


# ── Get one watchlist ─────────────────────────────────────────────
@router.get("/{wid}", summary="Get a watchlist by ID")
async def get_watchlist(
    wid: str,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    wl = await _get_owned(wid, user, db)
    return _wl_dict(wl)


# ── Add symbol ────────────────────────────────────────────────────
@router.patch("/{wid}/add/{symbol}", summary="Add symbol to watchlist")
async def add_symbol(
    wid: str,
    symbol: str,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    wl = await _get_owned(wid, user, db)
    sym = symbol.upper().strip()

    current: list[str] = list(wl.symbols or [])
    if sym in current:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{sym} is already in this watchlist",
        )
    current.append(sym)
    wl.symbols = current
    await db.flush()

    log.info("watchlist_symbol_added", user=user.username, symbol=sym)
    return _wl_dict(wl)


# ── Remove symbol ─────────────────────────────────────────────────
@router.patch("/{wid}/remove/{symbol}", summary="Remove symbol from watchlist")
async def remove_symbol(
    wid: str,
    symbol: str,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    wl = await _get_owned(wid, user, db)
    sym = symbol.upper().strip()

    current: list[str] = list(wl.symbols or [])
    if sym not in current:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{sym} not found in this watchlist",
        )
    current.remove(sym)
    wl.symbols = current
    await db.flush()

    log.info("watchlist_symbol_removed", user=user.username, symbol=sym)
    return _wl_dict(wl)


# ── Delete watchlist ──────────────────────────────────────────────
@router.delete("/{wid}", summary="Delete a watchlist")
async def delete_watchlist(
    wid: str,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    wl = await _get_owned(wid, user, db)
    await db.delete(wl)
    log.info("watchlist_deleted", user=user.username, wid=wid)
    return {"deleted": wid, "name": wl.name, "ok": True}


# ── Helper ────────────────────────────────────────────────────────
async def _get_owned(wid: str, user: User, db: AsyncSession) -> Watchlist:
    try:
        wid_uuid = uuid.UUID(wid)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid watchlist ID")

    wl = (await db.execute(
        select(Watchlist).where(
            Watchlist.id == wid_uuid,
            Watchlist.user_id == _get_user_uuid(user.id),
        )
    )).scalar_one_or_none()

    if wl is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Watchlist not found or not yours",
        )
    return wl
