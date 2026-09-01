"""Task board membership, Discover filters, and stale-applied rules.

Business rules live here, not in route handlers or UI components.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from job_sentinel.core.models import Application, ApplicationStage, Job

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository

STALE_APPLIED_DAYS = 14
OPEN_APPLICATION_STAGES = frozenset(
    {
        ApplicationStage.DRAFT,
        ApplicationStage.APPLIED,
        ApplicationStage.INTERVIEW,
        ApplicationStage.OFFER,
    }
)

# Tasks: next_step OR deadline OR unfinished job_task OR Application.stage=draft.
# Save-only / Reference-only / plain Discover jobs do not qualify.
TASKS_PREDICATE_SQL = """(
        TRIM(COALESCE(next_step, '')) != ''
        OR (deadline IS NOT NULL AND deadline != '')
        OR EXISTS (
            SELECT 1 FROM job_tasks t
            WHERE t.job_id = jobs.id AND COALESCE(t.done, 0) = 0
        )
        OR EXISTS (
            SELECT 1 FROM applications a
            WHERE a.job_id = jobs.id
              AND (a.deleted_at IS NULL OR a.deleted_at = '')
              AND a.stage = 'draft'
        )
    )"""

TASKS_SEARCH_SQL = """(
        lower(title) LIKE ?
        OR lower(company) LIKE ?
        OR lower(COALESCE(next_step, '')) LIKE ?
        OR EXISTS (
            SELECT 1 FROM job_tasks t
            WHERE t.job_id = jobs.id AND lower(t.title) LIKE ?
        )
        OR EXISTS (
            SELECT 1 FROM applications a
            WHERE a.job_id = jobs.id
              AND (a.deleted_at IS NULL OR a.deleted_at = '')
              AND lower(COALESCE(a.notes, '')) LIKE ?
        )
    )"""

HAS_DRAFT_SQL = """EXISTS (
        SELECT 1 FROM applications a
        WHERE a.job_id = jobs.id
          AND (a.deleted_at IS NULL OR a.deleted_at = '')
          AND a.stage = 'draft'
    )"""


def job_belongs_on_tasks(job: Job, *, has_draft_application: bool = False) -> bool:
    """True when the job has a real follow-up action (not Save/Reference/plain)."""
    if (job.next_step or "").strip():
        return True
    if job.deadline is not None:
        return True
    if any(not task.done for task in job.tasks):
        return True
    return has_draft_application


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def last_meaningful_activity(app: Application, job: Job | None) -> datetime:
    """Latest user-meaningful stamp. Collector bumps to ``jobs.updated_at`` do not count."""
    stamps: list[datetime] = [_as_utc(app.updated_at), _as_utc(app.created_at)]
    if job is not None and job.last_activity_at is not None:
        stamps.append(_as_utc(job.last_activity_at))
    for submission in app.submissions:
        stamps.append(_as_utc(submission.submitted_at))
    return max(stamps)


def is_stale_applied(
    app: Application,
    job: Job | None,
    *,
    now: datetime | None = None,
    idle_days: int = STALE_APPLIED_DAYS,
) -> bool:
    """Open-view smart filter: Applied with no update for ``idle_days``.

    Interview / Offer never qualify. Never auto-closes.
    """
    if app.stage != ApplicationStage.APPLIED:
        return False
    if job is not None:
        if (job.next_step or "").strip():
            return False
        if any(not task.done for task in job.tasks):
            return False
        moment = now or datetime.now(tz=UTC)
        if job.follow_up_at is not None and _as_utc(job.follow_up_at).date() >= moment.date():
            return False
    moment = now or datetime.now(tz=UTC)
    cutoff = moment - timedelta(days=idle_days)
    return last_meaningful_activity(app, job) <= cutoff


def is_excluded_or_dismissed(job: Job) -> bool:
    if job.dismissed_at is not None:
        return True
    return (job.filter_state or "").strip().lower() == "excluded"


def enrich_application_stale(repo: JobRepository, app: Application) -> Application:
    job = repo.get_hub_job(app.job_id) if app.job_id else None
    app.stale_applied = is_stale_applied(app, job)
    return app
