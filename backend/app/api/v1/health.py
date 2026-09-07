"""
KP Backend — Health Check API Endpoints
/health          — basic alive check
/health/live     — liveness probe (K8s compatible)
/health/ready    — readiness probe (checks DB + Redis)
"""

from __future__ import annotations

import time
from typing import Any

import structlog
from fastapi import APIRouter, status
from fastapi.responses import ORJSONResponse

from app.core.config import settings
from app.db.redis import redis_client

log = structlog.get_logger(__name__)

router = APIRouter()

# ── Track server start time ───────────────────────────────────
_SERVER_START = time.time()


@router.get(
    "/health",
    summary="Health check",
    response_description="Basic application liveness",
    status_code=status.HTTP_200_OK,
)
async def health_check() -> dict[str, Any]:
    """
    Basic health check. Returns 200 if the application process is alive.
    Does NOT check external dependencies.
    """
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "uptime_seconds": round(time.time() - _SERVER_START, 1),
    }


@router.get(
    "/health/live",
    summary="Liveness probe",
    status_code=status.HTTP_200_OK,
)
async def liveness() -> dict[str, str]:
    """
    Kubernetes-compatible liveness probe.
    Returns 200 if the process is alive and not stuck.
    """
    return {"status": "alive"}


@router.get(
    "/health/ready",
    summary="Readiness probe",
    status_code=status.HTTP_200_OK,
)
async def readiness() -> ORJSONResponse:
    """
    Kubernetes-compatible readiness probe.
    Checks: PostgreSQL connectivity + Redis connectivity.
    Returns 200 if ALL required dependencies are reachable.
    Returns 503 if any required dependency is unavailable.
    """
    checks: dict[str, Any] = {
        "database": {"status": "unknown", "latency_ms": None},
        "redis": {"status": "unknown", "latency_ms": None},
    }
    overall_ready = True

    # ── Database check ───────────────────────────────────────
    try:
        from app.db.session import engine
        from sqlalchemy import text
        t0 = time.perf_counter()
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        latency = round((time.perf_counter() - t0) * 1000, 2)
        checks["database"] = {"status": "ok", "latency_ms": latency}
    except Exception as exc:
        checks["database"] = {"status": "unavailable", "error": str(exc)[:200]}
        overall_ready = False
        log.warning("readiness_db_fail", error=str(exc)[:200])

    # ── Redis check ──────────────────────────────────────────
    try:
        t0 = time.perf_counter()
        await redis_client.ping()
        latency = round((time.perf_counter() - t0) * 1000, 2)
        checks["redis"] = {"status": "ok", "latency_ms": latency}
    except Exception as exc:
        checks["redis"] = {"status": "unavailable", "error": str(exc)[:200]}
        overall_ready = False
        log.warning("readiness_redis_fail", error=str(exc)[:200])

    response_body = {
        "status": "ready" if overall_ready else "not_ready",
        "checks": checks,
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }

    status_code = status.HTTP_200_OK if overall_ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return ORJSONResponse(content=response_body, status_code=status_code)
