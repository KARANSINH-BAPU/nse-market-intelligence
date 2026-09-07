"""
KP Backend — Security Utilities
JWT, password hashing, RBAC roles.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# ── Password hashing ─────────────────────────────────────────
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Hash a plain-text password using bcrypt."""
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain-text password against bcrypt hash."""
    return _pwd_context.verify(plain, hashed)


# ── User Roles (RBAC) ────────────────────────────────────────
class UserRole(str, Enum):
    USER = "user"
    RESEARCHER = "researcher"
    ADMIN = "admin"


# ── JWT Tokens ───────────────────────────────────────────────
def create_access_token(
    subject: str,
    role: UserRole = UserRole.USER,
    extra: dict[str, Any] | None = None,
    expires_minutes: int | None = None,
) -> str:
    """Create a signed JWT access token."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.JWT_EXPIRY_MINUTES
    )
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role.value,
        "jti": str(uuid.uuid4()),
        "iat": datetime.now(timezone.utc),
        "exp": expire,
        "type": "access",
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str) -> str:
    """Create a signed JWT refresh token."""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_EXPIRY_DAYS)
    payload = {
        "sub": subject,
        "jti": str(uuid.uuid4()),
        "iat": datetime.now(timezone.utc),
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT token.
    Raises JWTError on invalid/expired token.
    """
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
