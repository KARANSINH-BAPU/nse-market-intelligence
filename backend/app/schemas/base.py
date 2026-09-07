"""
KP Backend — Pydantic Schemas: Base + Shared Types
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class KPBaseSchema(BaseModel):
    """Base for all KP Pydantic schemas. Enables ORM mode."""
    model_config = ConfigDict(from_attributes=True)


class UUIDSchema(KPBaseSchema):
    """Schema with UUID primary key."""
    id: UUID


class TimestampSchema(KPBaseSchema):
    """Schema with created_at / updated_at."""
    created_at: datetime
    updated_at: datetime


class PaginatedResponse(KPBaseSchema):
    """Generic paginated list wrapper."""
    total: int
    page: int
    page_size: int
    items: list
