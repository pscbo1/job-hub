"""Settings validation must stay required in production; tests only stub env."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from job_sentinel.config.settings import PortalSettings, TelegramSettings


def test_telegram_and_portal_settings_still_require_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for key in (
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID",
        "PORTAL_USERNAME",
        "PORTAL_PASSWORD",
        "PORTAL_JOBS_URL",
    ):
        monkeypatch.delenv(key, raising=False)

    with pytest.raises(ValidationError):
        TelegramSettings()
    with pytest.raises(ValidationError):
        PortalSettings()
