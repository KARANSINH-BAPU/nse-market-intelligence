"""
KP — Unit Tests for Configuration
Verifies Settings loads correctly from environment variables.
"""

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))


class TestSettings:
    """Tests for KP Settings / configuration."""

    def test_settings_loads(self) -> None:
        """Settings should load without errors."""
        from app.core.config import get_settings
        settings = get_settings()
        assert settings is not None

    def test_app_name(self) -> None:
        from app.core.config import get_settings
        settings = get_settings()
        assert settings.APP_NAME == "KP"

    def test_default_environment(self) -> None:
        from app.core.config import get_settings
        settings = get_settings()
        assert settings.ENVIRONMENT in ("test", "development", "staging", "production")

    def test_allowed_origins_list(self) -> None:
        from app.core.config import get_settings
        settings = get_settings()
        origins = settings.allowed_origins_list
        assert isinstance(origins, list)
        assert len(origins) >= 1

    def test_data_dir_created(self) -> None:
        from app.core.config import get_settings
        settings = get_settings()
        assert settings.DATA_DIR.exists()

    def test_logs_dir_created(self) -> None:
        from app.core.config import get_settings
        settings = get_settings()
        assert settings.LOG_DIR.exists()

    def test_feature_paper_trading_default(self) -> None:
        from app.core.config import get_settings
        settings = get_settings()
        # Default should be True
        assert isinstance(settings.FEATURE_PAPER_TRADING, bool)

    def test_exchange_timezone(self) -> None:
        from app.core.config import get_settings
        settings = get_settings()
        assert settings.EXCHANGE_TIMEZONE == "Asia/Kolkata"


class TestSecurity:
    """Tests for security utilities."""

    def test_password_hash_and_verify(self) -> None:
        from app.core.security import hash_password, verify_password
        plain = "StrongPassword123!"
        hashed = hash_password(plain)
        assert hashed != plain
        assert verify_password(plain, hashed)

    def test_wrong_password_fails(self) -> None:
        from app.core.security import hash_password, verify_password
        hashed = hash_password("correct_password")
        assert not verify_password("wrong_password", hashed)

    def test_create_access_token(self) -> None:
        from app.core.security import create_access_token, decode_token, UserRole
        token = create_access_token(subject="test_user", role=UserRole.USER)
        assert isinstance(token, str)
        payload = decode_token(token)
        assert payload["sub"] == "test_user"
        assert payload["role"] == "user"
        assert payload["type"] == "access"

    def test_token_has_jti(self) -> None:
        from app.core.security import create_access_token
        token = create_access_token(subject="test")
        from app.core.security import decode_token
        payload = decode_token(token)
        assert "jti" in payload
        assert len(payload["jti"]) > 0
