"""
KP Backend — Redis Client
Async Redis connection with connection pooling.
"""

from __future__ import annotations

from typing import Any

import redis.asyncio as aioredis

from app.core.config import settings


class RedisClient:
    """
    Async Redis client wrapper with helper methods for KP's hot state.
    Uses a connection pool for efficiency.
    """

    def __init__(self) -> None:
        self._pool: aioredis.ConnectionPool = aioredis.ConnectionPool.from_url(
            settings.REDIS_URL,
            password=settings.REDIS_PASSWORD or None,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            decode_responses=True,
            encoding="utf-8",
        )
        self._client: aioredis.Redis = aioredis.Redis(connection_pool=self._pool)

    async def ping(self) -> bool:
        """Check Redis connectivity."""
        return await self._client.ping()

    async def get(self, key: str) -> str | None:
        return await self._client.get(key)

    async def set(
        self, key: str, value: str, ex: int | None = None
    ) -> None:
        await self._client.set(key, value, ex=ex)

    async def delete(self, *keys: str) -> int:
        return await self._client.delete(*keys)

    async def publish(self, channel: str, message: str) -> int:
        """Publish a message to a Redis Pub/Sub channel."""
        return await self._client.publish(channel, message)

    async def hset(self, name: str, mapping: dict[str, Any]) -> int:
        return await self._client.hset(name, mapping=mapping)  # type: ignore[arg-type]

    async def hgetall(self, name: str) -> dict[str, str]:
        return await self._client.hgetall(name)

    async def sadd(self, name: str, *values: str) -> int:
        return await self._client.sadd(name, *values)  # type: ignore[arg-type]

    async def srem(self, name: str, *values: str) -> int:
        return await self._client.srem(name, *values)  # type: ignore[arg-type]

    async def smembers(self, name: str) -> set[str]:
        return await self._client.smembers(name)  # type: ignore[return-value]

    async def expire(self, name: str, seconds: int) -> bool:
        return await self._client.expire(name, seconds)  # type: ignore[return-value]

    async def exists(self, *names: str) -> int:
        return await self._client.exists(*names)  # type: ignore[arg-type]

    def pipeline(self) -> Any:
        """Return a Redis pipeline for atomic multi-command operations."""
        return self._client.pipeline()

    async def zadd(self, name: str, mapping: dict[str, float]) -> int:
        return await self._client.zadd(name, mapping)

    async def keys(self, pattern: str) -> list[str]:
        return await self._client.keys(pattern)

    async def close(self) -> None:
        await self._client.aclose()

    @property
    def client(self) -> aioredis.Redis:
        return self._client


# ── Module-level singleton ───────────────────────────────────
redis_client = RedisClient()
