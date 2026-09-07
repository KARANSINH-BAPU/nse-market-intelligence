"""
KP Backend — WebSocket Connection Manager
Manages all active WebSocket connections with channel subscriptions.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import WebSocket, WebSocketDisconnect

log = structlog.get_logger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections for KP real-time updates.
    
    Supports channel-based subscriptions:
    - market       : Market-wide events (breadth, regime)
    - stock:{sym}  : Per-symbol price/signal updates
    - watchlist    : User watchlist updates
    - signals      : AI signals
    - predictions  : Prediction updates
    - alerts       : User alerts
    - portfolio    : Portfolio updates
    - system       : System status
    """

    def __init__(self) -> None:
        # client_id -> WebSocket
        self._connections: dict[str, WebSocket] = {}
        # channel -> set of client_ids
        self._subscriptions: dict[str, set[str]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> str:
        """Accept a new connection and return its client ID."""
        await websocket.accept()
        client_id = str(uuid.uuid4())
        async with self._lock:
            self._connections[client_id] = websocket
        log.info("ws_connected", client_id=client_id, total=len(self._connections))
        # Send welcome message
        await self._send_to(client_id, {
            "type": "connected",
            "client_id": client_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": "KP WebSocket connected. Send {type: subscribe, channels: [...]} to subscribe.",
        })
        return client_id

    def disconnect(self, client_id: str) -> None:
        """Remove a disconnected client from all subscriptions."""
        self._connections.pop(client_id, None)
        for subscribers in self._subscriptions.values():
            subscribers.discard(client_id)
        log.info("ws_disconnected", client_id=client_id, total=len(self._connections))

    async def handle(self, client_id: str, websocket: WebSocket) -> None:
        """Main message loop for a connected client."""
        try:
            while True:
                raw = await websocket.receive_text()
                await self._process_message(client_id, raw)
        except WebSocketDisconnect:
            self.disconnect(client_id)

    async def _process_message(self, client_id: str, raw: str) -> None:
        """Process an incoming message from a client."""
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await self._send_to(client_id, {"type": "error", "message": "Invalid JSON"})
            return

        msg_type = msg.get("type", "")

        if msg_type == "subscribe":
            channels = msg.get("channels", [])
            await self._subscribe(client_id, channels)

        elif msg_type == "unsubscribe":
            channels = msg.get("channels", [])
            await self._unsubscribe(client_id, channels)

        elif msg_type == "ping":
            await self._send_to(client_id, {
                "type": "pong",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        else:
            await self._send_to(client_id, {
                "type": "error",
                "message": f"Unknown message type: {msg_type}",
            })

    async def _subscribe(self, client_id: str, channels: list[str]) -> None:
        """Subscribe a client to channels."""
        async with self._lock:
            for channel in channels:
                if channel not in self._subscriptions:
                    self._subscriptions[channel] = set()
                self._subscriptions[channel].add(client_id)
        await self._send_to(client_id, {
            "type": "subscribed",
            "channels": channels,
        })
        log.debug("ws_subscribed", client_id=client_id, channels=channels)

    async def _unsubscribe(self, client_id: str, channels: list[str]) -> None:
        """Unsubscribe a client from channels."""
        async with self._lock:
            for channel in channels:
                if channel in self._subscriptions:
                    self._subscriptions[channel].discard(client_id)

    async def _send_to(self, client_id: str, data: dict[str, Any]) -> None:
        """Send a message to a specific client."""
        ws = self._connections.get(client_id)
        if ws is None:
            return
        try:
            await ws.send_text(json.dumps(data, default=str))
        except Exception as exc:
            log.warning("ws_send_error", client_id=client_id, error=str(exc))
            self.disconnect(client_id)

    async def broadcast_to_channel(self, channel: str, data: dict[str, Any]) -> int:
        """
        Broadcast a message to all clients subscribed to a channel.
        Returns the number of clients reached.
        """
        subscribers = self._subscriptions.get(channel, set()).copy()
        sent = 0
        payload = json.dumps(data, default=str)
        for client_id in subscribers:
            ws = self._connections.get(client_id)
            if ws:
                try:
                    await ws.send_text(payload)
                    sent += 1
                except Exception:
                    self.disconnect(client_id)
        return sent

    async def broadcast_to_all(self, data: dict[str, Any]) -> int:
        """Broadcast to every connected client."""
        payload = json.dumps(data, default=str)
        sent = 0
        for client_id, ws in list(self._connections.items()):
            try:
                await ws.send_text(payload)
                sent += 1
            except Exception:
                self.disconnect(client_id)
        return sent

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    def subscription_count(self, channel: str) -> int:
        return len(self._subscriptions.get(channel, set()))


# ── Module-level singleton ───────────────────────────────────
ws_manager = ConnectionManager()
