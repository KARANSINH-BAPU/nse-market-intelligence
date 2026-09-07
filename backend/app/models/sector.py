"""
KP Backend — Sector and Industry ORM Models
Matches actual DB schema from migration 001.
sectors: id(int), name, nse_sector_name, created_at, updated_at
industries: id(int), sector_id(int), name, created_at
"""
from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Sector(Base, TimestampMixin):
    """NSE market sector. Integer PK (not UUID) per migration 001."""
    __tablename__ = "sectors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    nse_sector_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    def __repr__(self) -> str:
        return f"<Sector {self.name}>"


class Industry(Base):
    """NSE industry sub-group. Integer PK, only created_at (no updated_at in DB)."""
    __tablename__ = "industries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sector_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # DB only has created_at for industries
    from sqlalchemy import DateTime, func
    created_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    def __repr__(self) -> str:
        return f"<Industry {self.name}>"
