"""Product transitions for Job engagement and the 1:1 Application.

Business rules live here, not in route handlers or UI components.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from job_sentinel.core.models import (
    Application,
    ApplicationEvent,
    ApplicationStage,
    ApplicationSubmission,
    CloseReason,
    Job,
    JobEngagement,
    PacketSnapshot,
)
from job_sentinel.ingestion.filters import (
    FILTER_STATE_EXCLUDED,
    REASON_MANUAL_DISMISS,
    dismiss_hub_job,
    undismiss_hub_job,
)

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository

OPEN_APPLICATION_STAGES = frozenset(
    {
        ApplicationStage.DRAFT,
        ApplicationStage.APPLIED,
        ApplicationStage.INTERVIEW,
        ApplicationStage.OFFER,
    }
)
PIPELINE_STAGES = frozenset(
    {
        ApplicationStage.APPLIED,
        ApplicationStage.INTERVIEW,
        ApplicationStage.OFFER,
        ApplicationStage.CLOSED,
    }
)
MY_JOBS_ENGAGEMENT = frozenset(
    {JobEngagement.REFERENCE, JobEngagement.UNDER_STUDY, JobEngagement.TO_DO}
)


class TrackingError(Exception):
    """User-facing tracking conflict or validation error."""

    def __init__(self, message: str, *, status_code: int = 409) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _require_job(repo: JobRepository, job_id: str) -> Job:
    job = repo.get_hub_job(job_id)
    if job is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    return job


def _touch(repo: JobRepository, job_id: str) -> None:
    repo.touch_hub_job_activity(job_id)


def _clear_dismiss_if_needed(repo: JobRepository, job: Job) -> Job:
    """Save / Start Review / Reference while dismissed: clear dismiss first."""
    if job.dismissed_at is None:
        return job
    restored = restore_dismiss(repo, job.id)
    return restored


def _assert_mutex(job: Job) -> None:
    if job.favorite and job.dismissed_at is not None:
        raise TrackingError("Save and Dismiss cannot both be set")
    if job.engagement is not None and job.dismissed_at is not None:
        raise TrackingError("Engagement and Dismiss cannot both be set")


def save_job(repo: JobRepository, job_id: str, *, saved: bool = True) -> Job:
    """Product Save (favorite). Independent of engagement."""
    job = _require_job(repo, job_id)
    if saved:
        job = _clear_dismiss_if_needed(repo, job)
        updated = repo.update_hub_job_tracking(job_id, favorite=True)
    else:
        updated = repo.update_hub_job_tracking(job_id, favorite=False)
    if updated is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    _assert_mutex(updated)
    _touch(repo, job_id)
    stored = repo.get_hub_job(job_id)
    if stored is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    return stored


def start_review(repo: JobRepository, job_id: str) -> Job:
    """Set engagement=under_study. Clears dismiss first if needed."""
    job = _clear_dismiss_if_needed(repo, _require_job(repo, job_id))
    updated = repo.update_hub_job_tracking(job.id, engagement=JobEngagement.UNDER_STUDY)
    if updated is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    _assert_mutex(updated)
    _touch(repo, job_id)
    stored = repo.get_hub_job(job_id)
    if stored is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    return stored


def set_reference(repo: JobRepository, job_id: str) -> Job:
    """Mark the job as a reference sample."""
    job = _clear_dismiss_if_needed(repo, _require_job(repo, job_id))
    updated = repo.update_hub_job_tracking(job.id, engagement=JobEngagement.REFERENCE)
    if updated is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    _assert_mutex(updated)
    _touch(repo, job_id)
    stored = repo.get_hub_job(job_id)
    if stored is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    return stored


def set_engagement(repo: JobRepository, job_id: str, engagement: JobEngagement | None) -> Job:
    """Explicit engagement change (including clearing)."""
    job = _require_job(repo, job_id)
    if engagement is not None:
        job = _clear_dismiss_if_needed(repo, job)
    updated = repo.update_hub_job_tracking(job.id, engagement=engagement)
    if updated is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    _assert_mutex(updated)
    _touch(repo, job_id)
    stored = repo.get_hub_job(job_id)
    if stored is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    return stored


def _active_application(repo: JobRepository, job_id: str) -> Application | None:
    return repo.get_application_for_job(job_id, include_deleted=False)


def dismiss_job(repo: JobRepository, job_id: str, *, note: str = "") -> Job:
    """Discovery noise: clear Save + engagement, set dismissed_at."""
    _require_job(repo, job_id)
    app = _active_application(repo, job_id)
    if app is not None and app.stage in OPEN_APPLICATION_STAGES:
        raise TrackingError(
            "Close or abandon the application before dismissing this job.",
            status_code=409,
        )
    repo.update_hub_job_tracking(
        job_id,
        favorite=False,
        engagement=None,
        dismissed_at=_now(),
        dismissed_note=note,
    )
    filtered = dismiss_hub_job(repo, job_id)
    if filtered is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    _assert_mutex(filtered)
    _touch(repo, job_id)
    stored = repo.get_hub_job(job_id)
    if stored is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    return stored


def restore_dismiss(repo: JobRepository, job_id: str) -> Job:
    """Clear dismissed_at only. Do not restore favorite or engagement."""
    _require_job(repo, job_id)
    repo.update_hub_job_tracking(job_id, dismissed_at=None, dismissed_note="")
    restored = undismiss_hub_job(repo, job_id)
    if restored is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    _touch(repo, job_id)
    stored = repo.get_hub_job(job_id)
    if stored is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    return stored


def start_application(repo: JobRepository, job_id: str) -> tuple[Job, Application]:
    """Create the unique Application draft and set Job engagement=to_do."""
    job = _clear_dismiss_if_needed(repo, _require_job(repo, job_id))
    existing = repo.get_application_for_job(job_id, include_deleted=True)
    if existing is not None and existing.deleted_at is None:
        if job.engagement != JobEngagement.TO_DO:
            job = repo.update_hub_job_tracking(job_id, engagement=JobEngagement.TO_DO) or job
        _touch(repo, job_id)
        stored = repo.get_hub_job(job_id)
        if stored is None:
            raise TrackingError(f"Job {job_id} not found", status_code=404)
        return stored, existing
    if existing is not None and existing.deleted_at is not None:
        repo.restore_deleted_application(existing.id)
        app = repo.get_application(existing.id)
        if app is None:
            raise TrackingError("Failed to restore application", status_code=500)
    else:
        app = Application(
            job_id=job.id,
            title=job.title,
            employer=job.company,
            location=job.location,
            url=job.job_url,
            source=job.source,
            stage=ApplicationStage.DRAFT,
        )
        try:
            app = repo.create_application(app)
        except ValueError as exc:
            raise TrackingError(str(exc), status_code=409) from exc
    updated = repo.update_hub_job_tracking(job_id, engagement=JobEngagement.TO_DO)
    if updated is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    job = updated
    repo.append_application_event(
        ApplicationEvent(
            application_id=app.id,
            kind="created",
            payload={"stage": ApplicationStage.DRAFT.value},
        )
    )
    _touch(repo, job_id)
    stored = repo.get_hub_job(job_id)
    if stored is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    refreshed = repo.get_application(app.id)
    if refreshed is None:
        raise TrackingError("Application missing after create", status_code=500)
    return stored, refreshed


def mark_submitted(
    repo: JobRepository,
    application_id: str,
    *,
    channel: str = "",
    notes: str = "",
    packet_snapshot: PacketSnapshot | None = None,
) -> Application:
    """Mark Submitted: stage=applied + submission event. Closed re-opens same Application."""
    app = repo.get_application(application_id)
    if app is None or app.deleted_at is not None:
        raise TrackingError(f"Application {application_id} not found", status_code=404)
    snapshot = packet_snapshot or PacketSnapshot()
    submission = ApplicationSubmission(
        application_id=app.id,
        channel=channel,
        notes=notes,
        packet_snapshot=snapshot,
    )
    repo.append_application_submission(submission)
    previous = app.stage
    fields: dict[str, Any] = {
        "stage": ApplicationStage.APPLIED,
        "close_reason": None,
        "close_note": "",
    }
    if not app.applied_date:
        fields["applied_date"] = _now().date().isoformat()
    repo.update_application(app.id, **fields)
    repo.append_application_event(
        ApplicationEvent(
            application_id=app.id,
            kind="submitted",
            payload={
                "from_stage": previous.value,
                "to_stage": ApplicationStage.APPLIED.value,
                "channel": channel,
                "reopened_from_closed": previous == ApplicationStage.CLOSED,
            },
        )
    )
    if app.job_id:
        repo.update_hub_job_tracking(app.job_id, engagement=JobEngagement.TO_DO)
        _touch(repo, app.job_id)
    stored = repo.get_application(app.id)
    if stored is None:
        raise TrackingError("Application missing after submit", status_code=500)
    return stored


def abandon_draft(repo: JobRepository, application_id: str) -> Job | None:
    """Delete a never-submitted draft. Do not set Closed. Job to_do → under_study."""
    app = repo.get_application(application_id)
    if app is None or app.deleted_at is not None:
        raise TrackingError(f"Application {application_id} not found", status_code=404)
    if app.stage != ApplicationStage.DRAFT or app.submissions:
        raise TrackingError(
            "Only a never-submitted draft can be abandoned. Close a submitted application instead.",
            status_code=409,
        )
    repo.soft_delete_application(app.id)
    job: Job | None = None
    if app.job_id:
        current = repo.get_hub_job(app.job_id)
        if current is not None and current.engagement == JobEngagement.TO_DO:
            job = repo.update_hub_job_tracking(app.job_id, engagement=JobEngagement.UNDER_STUDY)
        else:
            job = current
        if app.job_id:
            _touch(repo, app.job_id)
    return job


def close_application(
    repo: JobRepository,
    application_id: str,
    *,
    reason: CloseReason,
    note: str = "",
) -> Application:
    """Close a submitted application. Closed is not used for never-submitted drafts."""
    app = repo.get_application(application_id)
    if app is None or app.deleted_at is not None:
        raise TrackingError(f"Application {application_id} not found", status_code=404)
    if app.stage == ApplicationStage.DRAFT and not app.submissions:
        raise TrackingError(
            "Abandon a never-submitted draft instead of closing it.",
            status_code=409,
        )
    if app.stage not in PIPELINE_STAGES and not app.submissions:
        raise TrackingError("Application has not been submitted", status_code=409)
    previous = app.stage
    repo.update_application(
        app.id,
        stage=ApplicationStage.CLOSED,
        close_reason=reason,
        close_note=note,
    )
    repo.append_application_event(
        ApplicationEvent(
            application_id=app.id,
            kind="closed",
            payload={
                "from_stage": previous.value,
                "close_reason": reason.value,
                "close_note": note,
            },
        )
    )
    if app.job_id:
        _touch(repo, app.job_id)
    stored = repo.get_application(app.id)
    if stored is None:
        raise TrackingError("Application missing after close", status_code=500)
    return stored


def set_application_stage(
    repo: JobRepository,
    application_id: str,
    stage: ApplicationStage,
    *,
    close_reason: CloseReason | None = None,
    close_note: str = "",
) -> Application:
    """Advance interview/offer, or close with a reason. Draft is not a user-set target."""
    app = repo.get_application(application_id)
    if app is None or app.deleted_at is not None:
        raise TrackingError(f"Application {application_id} not found", status_code=404)
    if stage == ApplicationStage.DRAFT:
        raise TrackingError("Cannot move a submitted application back to draft", status_code=409)
    if stage == ApplicationStage.CLOSED:
        if close_reason is None:
            raise TrackingError("close_reason is required when closing", status_code=422)
        return close_application(repo, application_id, reason=close_reason, note=close_note)
    if stage == ApplicationStage.APPLIED:
        return mark_submitted(repo, application_id)
    if not app.submissions and app.stage == ApplicationStage.DRAFT:
        raise TrackingError("Mark Submitted before moving to interview or offer", status_code=409)
    previous = app.stage
    repo.update_application(app.id, stage=stage, close_reason=None, close_note="")
    repo.append_application_event(
        ApplicationEvent(
            application_id=app.id,
            kind="stage",
            payload={"from_stage": previous.value, "to_stage": stage.value},
        )
    )
    if app.job_id:
        _touch(repo, app.job_id)
    stored = repo.get_application(app.id)
    if stored is None:
        raise TrackingError("Application missing after stage change", status_code=500)
    return stored


def archive_job(repo: JobRepository, job_id: str, *, reason: str = "") -> Job:
    """Job-level long-term stow. Orthogonal to Application Closed."""
    _require_job(repo, job_id)
    updated = repo.update_hub_job_tracking(
        job_id,
        archived_at=_now(),
        archive_reason=reason,
    )
    if updated is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    _touch(repo, job_id)
    stored = repo.get_hub_job(job_id)
    if stored is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    return stored


def restore_archive(repo: JobRepository, job_id: str) -> Job:
    _require_job(repo, job_id)
    updated = repo.update_hub_job_tracking(job_id, archived_at=None, archive_reason="")
    if updated is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    _touch(repo, job_id)
    stored = repo.get_hub_job(job_id)
    if stored is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    return stored


def my_jobs_predicate_sql() -> str:
    """SQL fragment: favorite OR engagement in My Jobs set OR has Application."""
    return """(
        COALESCE(favorite, 0) = 1
        OR engagement IN ('reference', 'under_study', 'to_do')
        OR EXISTS (
            SELECT 1 FROM applications a
            WHERE a.job_id = jobs.id
              AND (a.deleted_at IS NULL OR a.deleted_at = '')
        )
    )"""


def default_stow_sql(*, include_dismissed: bool, include_archived: bool) -> str:
    clauses: list[str] = []
    if not include_dismissed:
        clauses.append("(dismissed_at IS NULL OR dismissed_at = '')")
    if not include_archived:
        clauses.append("(archived_at IS NULL OR archived_at = '')")
    return " AND ".join(clauses) if clauses else "1=1"


def is_manual_dismiss(job: Job) -> bool:
    return job.dismissed_at is not None or REASON_MANUAL_DISMISS in job.filter_reasons


def filter_state_after_dismiss(job: Job) -> str:
    return job.filter_state if job.filter_state else FILTER_STATE_EXCLUDED
