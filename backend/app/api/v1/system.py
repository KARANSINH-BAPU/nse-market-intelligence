"""
KP Backend — System Status API
Returns real-time state of all KP system components.
"""

from __future__ import annotations

import time
from typing import Any

import structlog
from fastapi import APIRouter
from fastapi.responses import ORJSONResponse

from app.core.config import settings
from app.db.redis import redis_client

log = structlog.get_logger(__name__)

router = APIRouter()


@router.get(
    "/status",
    summary="System component status",
    response_description="Real-time status of all KP components",
)
async def system_status() -> ORJSONResponse:
    """
    Returns real-time status of all KP platform components.
    Only reports what can be measured — never fabricates status.
    """
    status_report: dict[str, Any] = {
        "timestamp": time.time(),
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "components": {},
    }

    # ── Database ─────────────────────────────────────────────
    try:
        from app.db.session import engine
        from sqlalchemy import text
        t0 = time.perf_counter()
        async with engine.begin() as conn:
            result = await conn.execute(text("SELECT version()"))
            pg_version = result.scalar()
        latency = round((time.perf_counter() - t0) * 1000, 2)
        status_report["components"]["database"] = {
            "status": "online",
            "latency_ms": latency,
            "detail": str(pg_version)[:80] if pg_version else None,
        }
    except Exception as exc:
        status_report["components"]["database"] = {
            "status": "offline",
            "error": str(exc)[:200],
        }

    # ── Redis ────────────────────────────────────────────────
    try:
        t0 = time.perf_counter()
        info = await redis_client.client.info("server")
        latency = round((time.perf_counter() - t0) * 1000, 2)
        status_report["components"]["redis"] = {
            "status": "online",
            "latency_ms": latency,
            "version": info.get("redis_version"),
        }
    except Exception as exc:
        status_report["components"]["redis"] = {
            "status": "offline",
            "error": str(exc)[:200],
        }

    # ── Market Data Feed ─────────────────────────────────────
    status_report["components"]["market_feed"] = {
        "status": "not_configured" if not settings.ZERODHA_API_KEY else "configured",
        "provider": settings.DATA_PROVIDER,
        "detail": "Configure DATA_PROVIDER and credentials in .env for live feed",
    }

    # ── ML Engine ────────────────────────────────────────────
    status_report["components"]["ml_engine"] = {
        "status": "not_initialized",
        "detail": "ML pipeline initializes in Phase 10+",
    }

    # ── Feature Flags ────────────────────────────────────────
    status_report["features"] = {
        "fno": settings.FEATURE_FNO,
        "news": settings.FEATURE_NEWS,
        "sentiment": settings.FEATURE_SENTIMENT,
        "early_move": settings.FEATURE_EARLY_MOVE,
        "historical_similarity": settings.FEATURE_HISTORICAL_SIMILARITY,
        "ai_assistant": settings.FEATURE_AI_ASSISTANT,
        "paper_trading": settings.FEATURE_PAPER_TRADING,
        "backtesting": settings.FEATURE_BACKTESTING,
        "market_replay": settings.FEATURE_MARKET_REPLAY,
    }

    return ORJSONResponse(content=status_report)


@router.get(
    "/info",
    summary="Platform information",
)
async def system_info() -> dict[str, Any]:
    """Returns non-sensitive platform configuration information."""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "exchange": "NSE India",
        "exchange_timezone": settings.EXCHANGE_TIMEZONE,
        "data_provider": settings.DATA_PROVIDER,
        "features": {
            "fno": settings.FEATURE_FNO,
            "news": settings.FEATURE_NEWS,
            "paper_trading": settings.FEATURE_PAPER_TRADING,
            "backtesting": settings.FEATURE_BACKTESTING,
        },
    }
