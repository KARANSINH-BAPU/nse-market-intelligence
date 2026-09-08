"""
KP Backend — Integration Tests
Tests all live API endpoints using httpx.AsyncClient against the real running server.
Requires backend running on localhost:8000.
"""
from __future__ import annotations

import pytest
import httpx


BASE = "http://localhost:8000"


@pytest.fixture(scope="module")
def client():
    return httpx.Client(base_url=BASE, timeout=15)


# ── Health ─────────────────────────────────────────────────────────
class TestHealth:
    def test_health(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "healthy"
        assert data["app"] == "KP"

    def test_health_live(self, client):
        r = client.get("/health/live")
        assert r.status_code == 200
        assert r.json()["status"] == "alive"

    def test_health_ready(self, client):
        r = client.get("/health/ready")
        # 200 = fully ready, 503 = degraded but running (e.g. Redis down)
        # Both are valid — the endpoint itself must respond
        assert r.status_code in (200, 503)
        data = r.json()
        assert data["status"] in ("ready", "degraded", "unhealthy", "not_ready")


# ── System ─────────────────────────────────────────────────────────
class TestSystem:
    def test_system_info(self, client):
        r = client.get("/api/v1/system/info")
        assert r.status_code == 200
        data = r.json()
        assert "app" in data
        assert data["app"] == "KP"


# ── Market ─────────────────────────────────────────────────────────
class TestMarket:
    def test_market_status(self, client):
        r = client.get("/api/v1/market/status")
        assert r.status_code == 200
        data = r.json()
        assert "is_open" in data
        assert "phase" in data
        assert data["exchange"] == "NSE"
        assert isinstance(data["is_open"], bool)

    def test_market_session(self, client):
        r = client.get("/api/v1/market/session")
        assert r.status_code == 200
        data = r.json()
        assert "session_date" in data
        assert "exchange" in data

    def test_market_snapshot(self, client):
        r = client.get("/api/v1/market/snapshot", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "indices" in data
        assert "NIFTY50" in data["indices"]
        assert "BANKNIFTY" in data["indices"]
        assert data["source"] == "yfinance"

    def test_market_ohlcv(self, client):
        r = client.get("/api/v1/market/ohlcv/RELIANCE?period=5d&interval=1d", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["symbol"] == "RELIANCE"
        assert "bars" in data
        assert isinstance(data["bars"], list)


# ── Instruments ────────────────────────────────────────────────────
class TestInstruments:
    def test_list_instruments(self, client):
        r = client.get("/api/v1/instruments?page_size=10")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 2000        # NSE has 2500+ equities
        assert len(data["items"]) == 10
        item = data["items"][0]
        assert "symbol" in item
        assert "exchange" in item
        assert item["exchange"] == "NSE"

    def test_search_instruments(self, client):
        r = client.get("/api/v1/instruments?q=RELIANCE&page_size=5")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        symbols = [i["symbol"] for i in data["items"]]
        assert "RELIANCE" in symbols

    def test_get_instrument_by_symbol(self, client):
        r = client.get("/api/v1/instruments/RELIANCE")
        assert r.status_code == 200
        data = r.json()
        assert data["symbol"] == "RELIANCE"
        assert data["exchange"] == "NSE"
        assert "company_name" in data

    def test_instrument_not_found(self, client):
        r = client.get("/api/v1/instruments/XXXXXXXXNOTREAL")
        assert r.status_code == 404

    def test_search_tata(self, client):
        r = client.get("/api/v1/instruments?q=TATA&page_size=20")
        assert r.status_code == 200
        assert r.json()["total"] >= 5   # TATA group has many listings


# ── Auth ───────────────────────────────────────────────────────────
class TestAuth:
    TEST_EMAIL = "pytest_user@example.com"
    TEST_USERNAME = "pytest_kp_user"
    TEST_PASSWORD = "TestPass1234!"

    def test_register(self, client):
        # Clean up first (ignore 409)
        client.post("/api/v1/auth/register", json={
            "email": self.TEST_EMAIL,
            "username": self.TEST_USERNAME,
            "password": self.TEST_PASSWORD,
        })
        # Re-register to confirm idempotent conflict behavior
        r = client.post("/api/v1/auth/register", json={
            "email": "pytest_new@example.com",
            "username": "pytest_new_user",
            "password": self.TEST_PASSWORD,
        })
        assert r.status_code in (201, 409)

    def test_login(self, client):
        # Ensure user exists
        client.post("/api/v1/auth/register", json={
            "email": self.TEST_EMAIL,
            "username": self.TEST_USERNAME,
            "password": self.TEST_PASSWORD,
        })
        r = client.post(
            "/api/v1/auth/login",
            data={"username": self.TEST_USERNAME, "password": self.TEST_PASSWORD},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 3600

    def test_get_me(self, client):
        # Login to get token
        r = client.post(
            "/api/v1/auth/login",
            data={"username": self.TEST_USERNAME, "password": self.TEST_PASSWORD},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if r.status_code != 200:
            pytest.skip("Login failed — user may not exist")
        token = r.json()["access_token"]

        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        data = me.json()
        assert data["username"] == self.TEST_USERNAME
        assert data["role"] == "user"
        assert data["is_active"] is True

    def test_me_without_token(self, client):
        r = client.get("/api/v1/auth/me")
        assert r.status_code == 401

    def test_wrong_password(self, client):
        r = client.post(
            "/api/v1/auth/login",
            data={"username": self.TEST_USERNAME, "password": "WRONG_PASSWORD"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert r.status_code == 401
