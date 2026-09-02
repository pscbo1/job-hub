"""Pytest fixtures shared across unit and integration tests."""

from __future__ import annotations

import pytest

from job_sentinel.config.settings import get_settings

# Test-only placeholders so get_settings() can load without a developer .env.
# Production TelegramSettings / PortalSettings remain required Field(...) models.
_PLACEHOLDER_ENV = {
    "TELEGRAM_BOT_TOKEN": "test:placeholder-token",
    "TELEGRAM_CHAT_ID": "0",
    "PORTAL_USERNAME": "test-user",
    "PORTAL_PASSWORD": "test-password",
    "PORTAL_JOBS_URL": "https://example.test/jobs",
}


@pytest.fixture(autouse=True)
def _placeholder_settings_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in _PLACEHOLDER_ENV.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
