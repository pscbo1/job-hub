"""Optional idle auto-archive for Job Pool rows.

Settings live in ``sentinel_meta`` (``hub_archive_settings``). Default is
**off**. When enabled, a job with no user tracking activity for ``idle_days``
is moved to Closed with reason ``auto_archived``.

Skip when any of these hold:

* Stage is Closed (already done).
* Stage is Applied, Interview, or Offer (in-progress pipeline).
* Stage is Reference (explicit keep-aside).
* ``follow_up_at`` is **after today** (a future reminder is a scheduled action,
  even if it sits outside the idle window).
* ``next_step`` is non-blank after strip (any recorded next action counts as
  active work).
* The job has **incomplete checklist tasks** (OA / interview prep still open).
  Creating, editing, completing, or deleting a task also bumps
  ``last_activity_at``.

Idle clock uses ``last_activity_at`` (user PATCH and task CRUD). Collector
upserts do not bump it. Missing ``last_activity_at`` falls back to
``discovered_at``.

How to run (there is no OS/email push and no boot-time scheduler hook):

* ``POST /api/jobs/archive-run`` — UI / API; always executes the sweep.
* ``job-sentinel archive`` — for cron; no-ops unless settings.enabled, or pass
  ``--force``.
* ``job-sentinel archive --dry-run`` — report without writing.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from job_sentinel.core.models import CloseReason, Job, JobStatus

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository

_META_KEY = "hub_archive_settings"

_IN_PROGRESS = frozenset({JobStatus.APPLIED, JobStatus.INTERVIEW, JobStatus.OFFER})
_PROTECTED = _IN_PROGRESS | {JobStatus.CLOSED, JobStatus.REFERENCE}


class ArchiveSettings(BaseModel):
    """User-controlled auto-archive. Default off, idle window 14 days."""

    enabled: bool = False
    idle_days: int = Field(default=14, ge=1, le=365)


class ArchiveRunResult(BaseModel):
    scanned: int = 0
    archived: int = 0
    skipped: int = 0
    disabled: bool = False
    dry_run: bool = False
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


def should_auto_archive(
    job: Job,
    *,
    idle_days: int,
    now: datetime | None = None,
) -> bool:
    """Return True when this job is idle enough to close."""
    moment = now or datetime.now(tz=UTC)
    if job.status in _PROTECTED:
        return False
    if (job.next_step or "").strip():
        return False
    if any(not task.done for task in job.tasks):
        return False
    if job.follow_up_at is not None and job.follow_up_at > moment.date():
        return False
    activity = job.last_activity_at or job.discovered_at
    if activity.tzinfo is None:
        activity = activity.replace(tzinfo=UTC)
    return (moment - activity) >= timedelta(days=idle_days)


def run_auto_archive(
    repo: JobRepository,
    *,
    settings: ArchiveSettings | None = None,
    now: datetime | None = None,
    dry_run: bool = False,
    force: bool = False,
) -> ArchiveRunResult:
    """Sweep the pool. ``force`` runs even when settings.enabled is False."""
    rules = settings if settings is not None else load_archive_settings(repo)
    result = ArchiveRunResult(dry_run=dry_run)
    if not rules.enabled and not force:
        result.disabled = True
        return result
    moment = now or datetime.now(tz=UTC)
    for job in repo.list_all_hub_jobs():
        result.scanned += 1
        if not should_auto_archive(job, idle_days=rules.idle_days, now=moment):
            result.skipped += 1
            continue
        result.job_ids.append(job.id)
        result.archived += 1
        if dry_run:
            continue
        repo.update_hub_job(
            job.id,
            {
                "status": JobStatus.CLOSED,
                "close_reason": CloseReason.AUTO_ARCHIVED,
            },
        )
    return result
