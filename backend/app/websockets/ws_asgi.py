"""
KP Backend — WebSocket ASGI Route Handler

Registered via WebSocketRoute("/ws", ws_endpoint) in the root Starlette Router,
which mounts BEFORE FastAPI's CORSMiddleware.

Starlette's WebSocketRoute calls the handler with a single WebSocket argument.
"""
from __future__ import annotations

import structlog
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.websockets.manager import ws_manager

log = structlog.get_logger(__name__)


async def ws_endpoint(websocket: WebSocket) -> None:
    """
    Starlette WebSocketRoute handler — receives a single WebSocket argument.
    Accepts all origins (origin checking bypassed by mounting before CORS).
    """
    client_id: str | None = None
    try:
        client_id = await ws_manager.connect(websocket)
        await ws_manager.handle(client_id, websocket)
    except WebSocketDisconnect:
        if client_id:
            ws_manager.disconnect(client_id)
    except Exception as exc:
        log.warning("ws_error", client_id=client_id, error=str(exc)[:200])
        if client_id:
            ws_manager.disconnect(client_id)
