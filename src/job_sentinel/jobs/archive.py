"""Optional idle auto-archive: sets Job.archived_at. Never Closed / auto_archived.

Settings live in ``sentinel_meta`` (``hub_archive_settings``). Default is **off**.
When enabled, an idle job is stowed with ``archived_at``; engagement and
Application stage are left unchanged.

Skip when any of these hold:

* Already archived or dismissed.
* Engagement is Reference (explicit keep-aside).
* Application is in Applied / Interview / Offer (in-progress pipeline).
* ``follow_up_at`` is on or after today.
* ``next_step`` is non-blank after strip.
* The job has incomplete checklist tasks. Task CRUD also bumps
  ``last_activity_at``.

Idle clock uses ``last_activity_at`` (user PATCH and task CRUD). Collector
upserts leave it NULL. Missing ``last_activity_at`` falls back to
``discovered_at``.

How to run (no OS/email push and no boot-time scheduler hook):

* ``POST /api/jobs/archive-run`` — UI / API; pass ``force`` to run while off.
* ``job-sentinel archive`` — for cron; no-ops unless settings.enabled, or pass
  ``--force``.
* ``job-sentinel archive --dry-run`` — report without writing.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from job_sentinel.core.models import ApplicationStage, JobEngagement
from job_sentinel.jobs.actions import archive_job

if TYPE_CHECKING:
    from job_sentinel.core.models import Job
    from job_sentinel.db.repository import JobRepository

_META_KEY = "hub_archive_settings"
_IN_PROGRESS_APP = frozenset(
    {
        ApplicationStage.APPLIED,
        ApplicationStage.INTERVIEW,
        ApplicationStage.OFFER,
    }
)


class ArchiveSettings(BaseModel):
    enabled: bool = False
    idle_days: int = Field(default=14, ge=1, le=365)


class ArchiveRunResult(BaseModel):
    scanned: int = 0
    archived: int = 0
    skipped: int = 0
    dry_run: bool = False
    disabled: bool = False
    job_ids: list[str] = Field(default_factory=list)


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
    job: Job,
    settings: ArchiveSettings,
    *,
    now: datetime | None = None,
    in_progress_application: bool = False,
) -> bool:
    if job.archived_at is not None:
        return False
    if job.dismissed_at is not None:
        return False
    if job.engagement == JobEngagement.REFERENCE:
        return False
    if in_progress_application:
        return False
    if (job.next_step or "").strip():
        return False
    if any(not task.done for task in job.tasks):
        return False
    moment = now or datetime.now(tz=UTC)
    if job.follow_up_at is not None:
        follow = job.follow_up_at.date()
        if follow >= moment.date():
            return False
    cutoff = moment - timedelta(days=settings.idle_days)
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
    settings: ArchiveSettings | None = None,
) -> ArchiveRunResult:
    rules = settings if settings is not None else load_archive_settings(repo)
    result = ArchiveRunResult(dry_run=dry_run)
    if not rules.enabled and not force:
        result.disabled = True
        return result
    moment = now or datetime.now(tz=UTC)
    for job in repo.list_all_hub_jobs():
        result.scanned += 1
        app = repo.get_application_for_job(job.id)
        in_progress = app is not None and app.stage in _IN_PROGRESS_APP
        if not should_auto_archive(
            job, rules, now=moment, in_progress_application=in_progress
        ):
            result.skipped += 1
            continue
        result.job_ids.append(job.id)
        if not dry_run:
            archive_job(repo, job.id, reason="idle")
        result.archived += 1
    return result
