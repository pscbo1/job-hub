"""Optional idle auto-archive: sets Job.archived_at. Never Closed / auto_archived."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from job_sentinel.jobs.actions import archive_job

if TYPE_CHECKING:
    from job_sentinel.core.models import Job
    from job_sentinel.db.repository import JobRepository

_META_KEY = "hub_archive_settings"


class ArchiveSettings(BaseModel):
    enabled: bool = False
    idle_days: int = Field(default=14, ge=1, le=365)


class ArchiveRunResult(BaseModel):
    scanned: int = 0
    archived: int = 0
    skipped: int = 0
    dry_run: bool = False


def load_archive_settings(repo: JobRepository) -> ArchiveSettings:
    raw = repo.get_meta(_META_KEY)
    if not raw:
        return ArchiveSettings()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return ArchiveSettings()
    if not isinstance(data, dict):
        return ArchiveSettings()
    return ArchiveSettings.model_validate(data)


def save_archive_settings(repo: JobRepository, settings: ArchiveSettings) -> ArchiveSettings:
    repo.set_meta(_META_KEY, settings.model_dump_json())
    return settings


def _idle_since(job: Job) -> datetime:
    return job.last_activity_at or job.discovered_at


def should_auto_archive(
    job: Job, settings: ArchiveSettings, *, now: datetime | None = None
) -> bool:
    if job.archived_at is not None:
        return False
    if job.dismissed_at is not None:
        return False
    if (job.next_step or "").strip():
        return False
    if job.follow_up_at is not None:
        today = (now or datetime.now(tz=UTC)).date()
        follow = job.follow_up_at.date()
        if follow >= today:
            return False
    cutoff = (now or datetime.now(tz=UTC)) - timedelta(days=settings.idle_days)
    activity = _idle_since(job)
    if activity.tzinfo is None:
        activity = activity.replace(tzinfo=UTC)
    return activity <= cutoff


def run_idle_archive(
    repo: JobRepository,
    *,
    force: bool = False,
    dry_run: bool = False,
    now: datetime | None = None,
) -> ArchiveRunResult:
    settings = load_archive_settings(repo)
    result = ArchiveRunResult(dry_run=dry_run)
    if not settings.enabled and not force:
        return result
    moment = now or datetime.now(tz=UTC)
    for job in repo.list_all_hub_jobs():
        result.scanned += 1
        if not should_auto_archive(job, settings, now=moment):
            result.skipped += 1
            continue
        if not dry_run:
            archive_job(repo, job.id, reason="idle")
        result.archived += 1
    return result
