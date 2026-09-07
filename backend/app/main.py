"""
KP Backend — FastAPI Application Entry Point
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import ORJSONResponse

from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import engine
from app.db.redis import redis_client
from app.api.v1 import health, system
from app.websockets.manager import ws_manager

# ── Logging must be configured before first use ─────────────
setup_logging()
log = structlog.get_logger(__name__)


# ── Application Lifespan ────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown event handler."""
    log.info(
        "kp_startup",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
    )

    # Verify database connectivity
    try:
        async with engine.begin() as conn:
            await conn.execute("SELECT 1")  # type: ignore[arg-type]
        log.info("database_connected")
    except Exception as exc:
        log.warning("database_unavailable", error=str(exc))

    # Verify Redis connectivity
    try:
        await redis_client.ping()
        log.info("redis_connected")
    except Exception as exc:
        log.warning("redis_unavailable", error=str(exc))

    yield

    # Shutdown
    log.info("kp_shutdown")
    await redis_client.close()
    await engine.dispose()


# ── FastAPI Application ──────────────────────────────────────
def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="KP — NSE Market Intelligence Platform",
        description=(
            "Production-grade real-time NSE market intelligence, "
            "AI predictions, and analytics platform."
        ),
        version=settings.APP_VERSION,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        openapi_url="/openapi.json" if settings.DEBUG else None,
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
    )

    # ── Middleware ──────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Process-Time"],
    )

    # ── Request timing + correlation ID middleware ──────────
    @app.middleware("http")
    async def add_process_time_and_request_id(
        request: Request, call_next: object
    ) -> Response:
        import uuid
        request_id = str(uuid.uuid4())
        start = time.perf_counter()
        response = await call_next(request)  # type: ignore[operator]
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = f"{duration_ms}ms"
        return response

    # ── Include Routers ─────────────────────────────────────
    app.include_router(health.router, prefix="", tags=["Health"])
    app.include_router(system.router, prefix="/api/v1/system", tags=["System"])

    # ── WebSocket Endpoint ──────────────────────────────────
    from fastapi import WebSocket, WebSocketDisconnect

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket) -> None:
        client_id = await ws_manager.connect(websocket)
        try:
            await ws_manager.handle(client_id, websocket)
        except WebSocketDisconnect:
            ws_manager.disconnect(client_id)
            log.info("ws_disconnected", client_id=client_id)

    return app


app = create_app()
