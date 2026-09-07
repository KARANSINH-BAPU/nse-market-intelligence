"""
KP — pytest configuration and shared fixtures
"""

import os
import sys
from pathlib import Path

import pytest

# ── Paths ─────────────────────────────────────────────────
ROOT = Path(__file__).parent
BACKEND = ROOT / "backend"

sys.path.insert(0, str(BACKEND))

# ── Set test environment ──────────────────────────────────
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://kp_user:kp_dev_password@localhost:5432/kp_db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SECRET_KEY", "test_secret_key_for_testing_only_at_least_32chars_ok")
os.environ.setdefault("JWT_SECRET", "test_jwt_secret_for_testing_only_at_least_32chars_ok")
os.environ.setdefault("DATA_PROVIDER", "mock")
os.environ.setdefault("LOG_LEVEL", "ERROR")   # Suppress logs during tests
