"""
KP Backend — Instruments API
GET /api/v1/instruments         — list/search NSE instruments
GET /api/v1/instruments/{symbol} — single instrument detail
"""
from __future__ import annotations

from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.instrument import Instrument

log = structlog.get_logger(__name__)
router = APIRouter()


@router.get("", summary="List NSE instruments")
async def list_instruments(
    session: Annotated[AsyncSession, Depends(get_session)],
    q: str | None = Query(None, description="Search by symbol or company name"),
    instrument_type: str | None = Query(None, description="EQ | ETF | INDEX | FUT | OPT"),
    exchange: str = Query("NSE"),
    active: bool = Query(True),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    stmt = select(Instrument).where(
        Instrument.exchange == exchange,
        Instrument.active == active,
    )
    if q:
        q_lower = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Instrument.symbol).like(q_lower),
                func.lower(Instrument.company_name).like(q_lower),
            )
        )
    if instrument_type:
        stmt = stmt.where(Instrument.instrument_type == instrument_type.upper())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total: int = (await session.execute(count_stmt)).scalar_one()

    offset = (page - 1) * page_size
    stmt = stmt.order_by(Instrument.symbol).offset(offset).limit(page_size)
    rows = (await session.execute(stmt)).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": str(r.id),
                "symbol": r.symbol,
                "company_name": r.company_name,
                "exchange": r.exchange,
                "instrument_type": r.instrument_type,
                "active": r.active,
                "market_cap_category": r.market_cap_category,
                "fno_eligible": r.fno_eligible,
                "isin": r.isin,
            }
            for r in rows
        ],
    }


@router.get("/{symbol}", summary="Get instrument by symbol")
async def get_instrument(
    symbol: str,
    session: Annotated[AsyncSession, Depends(get_session)],
    exchange: str = Query("NSE"),
) -> dict[str, Any]:
    stmt = select(Instrument).where(
        func.upper(Instrument.symbol) == symbol.upper(),
        Instrument.exchange == exchange,
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Instrument '{symbol}' not found on {exchange}",
        )
    return {
        "id": str(row.id),
        "symbol": row.symbol,
        "company_name": row.company_name,
        "isin": row.isin,
        "exchange": row.exchange,
        "instrument_type": row.instrument_type,
        "active": row.active,
        "listed_at": str(row.listed_at) if row.listed_at else None,
        "delisted_at": str(row.delisted_at) if row.delisted_at else None,
        "market_cap_category": row.market_cap_category,
        "fno_eligible": row.fno_eligible,
        "meta": row.meta,
    }
