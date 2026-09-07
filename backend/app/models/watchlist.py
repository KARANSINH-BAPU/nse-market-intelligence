"""
KP Backend — Watchlist ORM Model
"""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Watchlist(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    User-defined watchlist of NSE symbols.
    Symbols stored as an ordered ARRAY for fast retrieval.
    """
    __tablename__ = "watchlists"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    symbols: Mapped[list] = mapped_column(ARRAY(String(30)), nullable=False, default=list)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<Watchlist '{self.name}' ({len(self.symbols or [])} symbols)>"
