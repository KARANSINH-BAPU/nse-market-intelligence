# ============================================================
# KP — Unit Tests for Health Endpoints
# ============================================================

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client():
    """Create async test client for KP backend."""
    # Import here to avoid startup effects before test env is set
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

    # Set minimal test env vars before importing app
    import os
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test_db")
    os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
    os.environ.setdefault("SECRET_KEY", "test_secret_key_for_testing_only_32chars")
    os.environ.setdefault("JWT_SECRET", "test_jwt_secret_for_testing_only_32chars")
    os.environ.setdefault("ENVIRONMENT", "test")

    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


class TestHealthEndpoints:
    """Tests for /health, /health/live, /health/ready."""

    async def test_health_returns_200(self, client: AsyncClient) -> None:
        response = await client.get("/health")
        assert response.status_code == 200

    async def test_health_response_structure(self, client: AsyncClient) -> None:
        response = await client.get("/health")
        data = response.json()
        assert "status" in data
        assert "app" in data
        assert "version" in data
        assert "environment" in data
        assert "uptime_seconds" in data

    async def test_health_status_is_healthy(self, client: AsyncClient) -> None:
        response = await client.get("/health")
        assert response.json()["status"] == "healthy"

    async def test_health_app_name(self, client: AsyncClient) -> None:
        response = await client.get("/health")
        assert response.json()["app"] == "KP"

    async def test_liveness_returns_200(self, client: AsyncClient) -> None:
        response = await client.get("/health/live")
        assert response.status_code == 200

    async def test_liveness_response(self, client: AsyncClient) -> None:
        response = await client.get("/health/live")
        assert response.json()["status"] == "alive"

    async def test_readiness_returns_response(self, client: AsyncClient) -> None:
        # Readiness can be 200 or 503 depending on DB/Redis state
        response = await client.get("/health/ready")
        assert response.status_code in (200, 503)

    async def test_readiness_response_structure(self, client: AsyncClient) -> None:
        response = await client.get("/health/ready")
        data = response.json()
        assert "status" in data
        assert "checks" in data
        assert "database" in data["checks"]
        assert "redis" in data["checks"]
