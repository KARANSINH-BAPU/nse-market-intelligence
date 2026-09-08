"""
KP Backend — FastAPI Application Entry Point
"""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import engine
from app.db.redis import redis_client
from app.api.v1.health import router as health_router
from app.api.v1.system import router as system_router
from app.api.v1.instruments import router as instruments_router
from app.api.v1.market import router as market_router
from app.api.v1.auth import router as auth_router
from app.api.v1.watchlist import router as watchlist_router
from app.api.v1.features import router as features_router
from app.api.v1.alerts import router as alerts_router
from app.websockets.manager import ws_manager
from app.websockets.broadcaster import market_ticker_loop
# Import all models to register with SQLAlchemy metadata
import app.models  # noqa: F401

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
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        log.info("database_connected")
    except Exception as exc:
        log.warning("database_unavailable", error=str(exc))

    # Verify Redis connectivity
    try:
        await redis_client.ping()
        log.info("redis_connected")
    except Exception as exc:
        log.warning("redis_unavailable", error=str(exc))

    # Start background market ticker
    ticker_task = asyncio.create_task(market_ticker_loop(), name="market_ticker")
    log.info("market_ticker_started")

    yield

    # Shutdown
    ticker_task.cancel()
    try:
        await ticker_task
    except asyncio.CancelledError:
        pass
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
        default_response_class=JSONResponse,
        lifespan=lifespan,
    )

    # ── Middleware ──────────────────────────────────────────
    # Parse origins — stored as comma-separated string in env
    origins: list[str] = (
        [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
        if isinstance(settings.ALLOWED_ORIGINS, str)
        else list(settings.ALLOWED_ORIGINS)
    )
    # In dev/test allow all origins so WebSocket connections from the browser work
    if settings.ENVIRONMENT in ("development", "test"):
        origins = ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=origins != ["*"],   # credentials incompatible with wildcard
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Process-Time"],
    )

    # ── Request timing + correlation ID middleware ──────────
    @app.middleware("http")
    async def add_process_time_and_request_id(
        request: Request, call_next: object
    ) -> Response:
        # WebSocket upgrades arrive via HTTP middleware too — pass them through
        if request.scope.get("type") == "websocket":
            return await call_next(request)   # type: ignore[operator]
        import uuid
        request_id = str(uuid.uuid4())
        start = time.perf_counter()
        response = await call_next(request)  # type: ignore[operator]
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = f"{duration_ms}ms"
        return response

    # ── Include Routers ─────────────────────────────────────
    app.include_router(health_router, prefix="", tags=["Health"])
    app.include_router(system_router, prefix="/api/v1/system", tags=["System"])
    app.include_router(instruments_router, prefix="/api/v1/instruments", tags=["Instruments"])
    app.include_router(market_router, prefix="/api/v1/market", tags=["Market"])
    app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
    app.include_router(watchlist_router, prefix="/api/v1/watchlist", tags=["Watchlist"])
    app.include_router(features_router, prefix="/api/v1/features", tags=["Features"])
    app.include_router(alerts_router, prefix="/api/v1/alerts", tags=["Alerts"])

    # ── WebSocket Endpoint ──────────────────────────────────
    # NOTE: Registered directly on app — NOT via APIRouter — so it is processed
    # after Starlette middleware but the WS upgrade is handled natively by uvicorn.
    # The @app.websocket decorator bypasses the HTTP middleware stack for WS frames.
    from fastapi import WebSocket, WebSocketDisconnect

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket) -> None:
        """
        KP real-time WebSocket.
        Protocol (JSON frames):
          Client → { type: "subscribe",   channels: ["market", "stock:RELIANCE"] }
          Client → { type: "unsubscribe", channels: [...] }
          Client → { type: "ping" }
          Server → { type: "connected", client_id: "...", ... }
          Server → { type: "subscribed", channels: [...] }
          Server → { type: "tick",  channel: "market", indices: {...}, is_open: bool }
          Server → { type: "pong" }
        """
        client_id = await ws_manager.connect(websocket)
        try:
            await ws_manager.handle(client_id, websocket)
        except WebSocketDisconnect:
            ws_manager.disconnect(client_id)
            log.info("ws_disconnected", client_id=client_id)
        except Exception as exc:
            log.warning("ws_error", client_id=client_id, error=str(exc)[:200])
            ws_manager.disconnect(client_id)
    return app


# ── Root ASGI app: WS mounted BEFORE FastAPI/CORSMiddleware ──
# This is the entry point uvicorn uses.  The /ws path is handled
# by a raw ASGI callable that accepts ALL origins — it never goes
# through CORSMiddleware, permanently fixing the HTTP 403 on WS upgrade.
from starlette.routing import Router, Route, Mount, WebSocketRoute

def _make_root_app() -> Router:
    from app.websockets.ws_asgi import ws_endpoint
    fastapi_app = create_app()
    return Router(routes=[
        # WS first — bypasses all FastAPI/CORSMiddleware
        WebSocketRoute("/ws", ws_endpoint),
        # Everything else goes to FastAPI
        Mount("/", app=fastapi_app),
    ])


app = _make_root_app()
