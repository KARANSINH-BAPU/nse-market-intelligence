"""
KP Backend — Pydantic Schemas: User + Auth
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from app.schemas.base import KPBaseSchema, TimestampSchema, UUIDSchema


# ── Auth request/response ─────────────────────────────────────────
class LoginRequest(KPBaseSchema):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=128)


class TokenResponse(KPBaseSchema):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class TokenPayload(KPBaseSchema):
    sub: str  # user_id as string
    role: str
    type: str  # access | refresh
    jti: str
    exp: int
    iat: int


# ── User schemas ──────────────────────────────────────────────────
class UserBase(KPBaseSchema):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    display_name: str | None = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)


class UserRead(UUIDSchema, TimestampSchema, UserBase):
    role: str
    is_active: bool
    is_verified: bool
    last_login_at: datetime | None = None
    login_count: int = 0


class UserUpdate(KPBaseSchema):
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None


class UserPublic(KPBaseSchema):
    """Safe user profile — no email, no role details."""
    id: UUID
    username: str
    display_name: str | None = None
    avatar_url: str | None = None
