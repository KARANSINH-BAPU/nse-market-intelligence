"""
KP Backend — Authentication API
POST /api/v1/auth/register  — create new user account
POST /api/v1/auth/login     — get JWT access token
POST /api/v1/auth/refresh   — refresh access token
GET  /api/v1/auth/me        — get current user profile
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    UserRole,
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_session
from app.models.user import User
from app.schemas.user import (
    TokenResponse,
    UserCreate,
    UserRead,
)

log = structlog.get_logger(__name__)
router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


# ── Dependency: get current authenticated user ────────────────────
async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    from jose import JWTError, jwt

    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise credentials_exc
    except Exception:
        raise credentials_exc

    stmt = select(User).where(User.id == user_id)
    user = (await session.execute(stmt)).scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exc
    return user


# ── Register ──────────────────────────────────────────────────────
@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new KP account",
)
async def register(
    payload: UserCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserRead:
    # Check email uniqueness
    existing = (
        await session.execute(
            select(User).where(
                func.lower(User.email) == payload.email.lower()
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Check username uniqueness
    existing_un = (
        await session.execute(
            select(User).where(
                func.lower(User.username) == payload.username.lower()
            )
        )
    ).scalar_one_or_none()
    if existing_un:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    user = User(
        id=str(uuid.uuid4()),
        email=payload.email.lower(),
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role="user",
        is_active=True,
        is_verified=False,
    )
    session.add(user)
    await session.flush()

    log.info("user_registered", username=user.username, user_id=user.id)

    return UserRead(
        id=uuid.UUID(user.id),
        email=user.email,
        username=user.username,
        display_name=None,
        role=user.role,
        is_active=user.is_active,
        is_verified=user.is_verified,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


# ── Login ─────────────────────────────────────────────────────────
@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login and get JWT access token",
)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenResponse:
    # Find user by username or email
    stmt = select(User).where(
        (func.lower(User.username) == form_data.username.lower()) |
        (func.lower(User.email) == form_data.username.lower())
    )
    user = (await session.execute(stmt)).scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)

    token = create_access_token(
        subject=user.id,
        role=UserRole(user.role),
        extra={"username": user.username},
    )
    expires_in = settings.JWT_EXPIRY_MINUTES * 60

    log.info("user_login", username=user.username, user_id=user.id)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
    )


# ── Current user ──────────────────────────────────────────────────
@router.get(
    "/me",
    response_model=UserRead,
    summary="Get current authenticated user profile",
)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserRead:
    return UserRead(
        id=uuid.UUID(current_user.id),
        email=current_user.email,
        username=current_user.username,
        display_name=None,
        role=current_user.role,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        last_login_at=current_user.last_login_at,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
    )
