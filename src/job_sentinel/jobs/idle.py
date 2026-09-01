"""Idle / no-update cleanup settings for Applied applications.

Discover auto-archive (excluded jobs) stays in ``jobs.archive``. This module
only gates the Applications ``No update Nd+`` list. Close selected is always
human; nothing auto-closes.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository

_META_KEY = "hub_idle_cleanup_settings"


class IdleCleanupSettings(BaseModel):
    enabled: bool = False
    idle_days: int = Field(default=14, ge=1, le=365)


def load_idle_cleanup_settings(repo: JobRepository) -> IdleCleanupSettings:
    raw = repo.get_meta(_META_KEY)
    if not raw:
        return IdleCleanupSettings()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return IdleCleanupSettings()
    if not isinstance(data, dict):
        return IdleCleanupSettings()
    return IdleCleanupSettings.model_validate(data)


def save_idle_cleanup_settings(
    repo: JobRepository, settings: IdleCleanupSettings
) -> IdleCleanupSettings:
    repo.set_meta(_META_KEY, settings.model_dump_json())
    return settings
