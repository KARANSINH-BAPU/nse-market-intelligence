"""
KP Backend — All Pydantic schemas exported from a single namespace.
"""

from app.schemas.base import (
    KPBaseSchema,
    PaginatedResponse,
    TimestampSchema,
    UUIDSchema,
)
from app.schemas.instrument import (
    InstrumentBase,
    InstrumentCreate,
    InstrumentRead,
    InstrumentSummary,
)
from app.schemas.market import (
    DataQuality,
    IndexQuoteSchema,
    MarketBreadthSchema,
    QuoteSchema,
)
from app.schemas.user import (
    LoginRequest,
    TokenPayload,
    TokenResponse,
    UserCreate,
    UserPublic,
    UserRead,
    UserUpdate,
)

__all__ = [
    "DataQuality",
    "IndexQuoteSchema",
    "InstrumentBase",
    "InstrumentCreate",
    "InstrumentRead",
    "InstrumentSummary",
    "KPBaseSchema",
    "LoginRequest",
    "MarketBreadthSchema",
    "PaginatedResponse",
    "QuoteSchema",
    "TimestampSchema",
    "TokenPayload",
    "TokenResponse",
    "UUIDSchema",
    "UserCreate",
    "UserPublic",
    "UserRead",
    "UserUpdate",
]
