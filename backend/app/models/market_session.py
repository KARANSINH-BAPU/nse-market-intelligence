"""
KP Backend — MarketSession ORM Model
Matches actual DB schema from migration 001.
id: integer, NO updated_at, session_type column exists.
"""
from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import Date, DateTime, Float, Integer, String, Text, Time, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MarketSession(Base):
    """
    NSE trading session record.
    Integer PK (not UUID). Only has created_at (no updated_at).
    """
    __tablename__ = "market_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exchange: Mapped[str] = mapped_column(String(10), nullable=False, default="NSE")
    session_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    session_type: Mapped[str] = mapped_column(String(20), nullable=False, default="regular")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")

    pre_open_start: Mapped[time | None] = mapped_column(Time(timezone=True), nullable=True)
    open_time: Mapped[time | None] = mapped_column(Time(timezone=True), nullable=True)
    close_time: Mapped[time | None] = mapped_column(Time(timezone=True), nullable=True)

    data_quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=True
    )

    def __repr__(self) -> str:
        return f"<MarketSession {self.session_date} {self.status}>"
