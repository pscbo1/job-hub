"""Product transitions for Save, Reference, Application, and Dismiss.

Business rules live here, not in route handlers or UI components.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from job_sentinel.core.models import (
    Application,
    ApplicationEvent,
    ApplicationStage,
    ApplicationSubmission,
    CloseReason,
    Job,
    JobRaw,
    PacketSnapshot,
    PacketSnapshotItem,
    SubmissionMaterialRevision,
    compute_job_fingerprint,
)
from job_sentinel.ingestion.filters import (
    FILTER_STATE_EXCLUDED,
    REASON_MANUAL_DISMISS,
    dismiss_hub_job,
    undismiss_hub_job,
)
from job_sentinel.jobs.membership import OPEN_APPLICATION_STAGES

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository

PIPELINE_STAGES = frozenset(
    {
        ApplicationStage.APPLIED,
        ApplicationStage.INTERVIEW,
        ApplicationStage.OFFER,
        ApplicationStage.CLOSED,
    }
)


@dataclass(frozen=True)
class ManualApplicationOutcome:
    """Business outcome for Add application idempotency and duplicate handling."""

    status: str
    job: Job | None = None
    application: Application | None = None
    replayed: bool = False
    duplicate_job: Job | None = None
    duplicate_application: Application | None = None


class TrackingError(Exception):
    """User-facing tracking conflict or validation error."""

    def __init__(self, message: str, *, status_code: int = 409, code: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


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
    """Save / Reference while dismissed: restore first."""
    if job.dismissed_at is None:
        return job
    return restore_dismiss(repo, job.id)


def _assert_mutex(job: Job) -> None:
    if job.favorite and job.dismissed_at is not None:
        raise TrackingError("Save and Dismiss cannot both be set")
    if job.reference and job.dismissed_at is not None:
        raise TrackingError("Reference and Dismiss cannot both be set")


def save_job(repo: JobRepository, job_id: str, *, saved: bool = True) -> Job:
    """Product Save (favorite). Independent of Reference."""
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


def set_reference(repo: JobRepository, job_id: str, *, referenced: bool = True) -> Job:
    """Independent Reference flag. Can coexist with Save and Application."""
    job = _require_job(repo, job_id)
    if referenced:
        job = _clear_dismiss_if_needed(repo, job)
        updated = repo.update_hub_job_tracking(job.id, reference=True, engagement=None)
    else:
        updated = repo.update_hub_job_tracking(job_id, reference=False)
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
    """Discovery noise: clear Save + Reference, set dismissed_at."""
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
        reference=False,
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
    """Clear dismissed_at and auto-archive, then re-evaluate filters.

    The job returns to Current when eligible, otherwise Excluded with a reason.
    It must never vanish from both views. Applications and submissions stay put.
    """
    _require_job(repo, job_id)
    repo.update_hub_job_tracking(
        job_id,
        dismissed_at=None,
        dismissed_note="",
        archived_at=None,
        archive_reason="",
    )
    restored = undismiss_hub_job(repo, job_id)
    if restored is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    _touch(repo, job_id)
    stored = repo.get_hub_job(job_id)
    if stored is None:
        raise TrackingError(f"Job {job_id} not found", status_code=404)
    return stored


def application_was_submitted(app: Application) -> bool:
    """True once the application has been submitted at least once."""
    if app.submissions:
        return True
    return app.stage in PIPELINE_STAGES


def _is_normal_discover_job(job: Job) -> bool:
    if job.dismissed_at is not None:
        return False
    return (job.filter_state or "included").strip().lower() != "excluded"


def start_application(repo: JobRepository, job_id: str) -> tuple[Job, Application]:
    """Create the unique Application draft bound to a stable Job.

    Allowed from any normal Discover job (no Save / Under Study prerequisite).
    """
    job = _require_job(repo, job_id)
    if not _is_normal_discover_job(job):
        raise TrackingError(
            "Restore the job before starting an application.",
            status_code=409,
        )
    existing = repo.get_application_for_job(job_id, include_deleted=True)
    if existing is not None and existing.deleted_at is None:
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
        except ValueError as extra:
            raise TrackingError(str(extra), status_code=409) from extra
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


def create_manual_application(
    repo: JobRepository,
    *,
    request_id: str,
    title: str,
    company: str,
    job_url: str = "",
    location: str = "",
    source_note: str = "",
    market: str = "cn",
    create_separately: bool = False,
) -> ManualApplicationOutcome:
    """Atomically create a manual raw record, stable Job, and bound Draft."""
    from job_sentinel.ingestion.normalize import canonicalize_url

    clean_title = title.strip()
    clean_company = company.strip()
    clean_url = job_url.strip()
    clean_location = location.strip()
    clean_note = source_note.strip()
    now = _now()
    canonical = canonicalize_url(clean_url)
    source_job_id = f"manual:{request_id}"
    job = Job(
        source="manual",
        source_job_id=source_job_id,
        job_url=clean_url,
        canonical_url=canonical,
        source_note=clean_note,
        title=clean_title,
        company=clean_company,
        location=clean_location,
        discovered_at=now,
        last_seen_at=now,
        updated_at=now,
        last_activity_at=now,
        fingerprint=compute_job_fingerprint(clean_company, clean_title, clean_location),
        market=market,
        filter_state="included",
    )
    raw = JobRaw(
        source="manual",
        source_job_id=source_job_id,
        source_url=clean_url,
        raw_payload={
            "request_id": request_id,
            "title": clean_title,
            "company": clean_company,
            "job_url": clean_url,
            "location": clean_location,
            "source_note": clean_note,
            "market": market,
        },
        collected_at=now,
        processed_at=now,
        job_id=job.id,
        created_at=now,
    )
    application = Application(
        job_id=job.id,
        title=clean_title,
        employer=clean_company,
        location=clean_location,
        url=clean_url,
        source="manual",
        stage=ApplicationStage.DRAFT,
        created_at=now,
        updated_at=now,
    )
    event = ApplicationEvent(
        application_id=application.id,
        kind="created",
        payload={"stage": ApplicationStage.DRAFT.value},
        created_at=now,
    )
    result = repo.create_manual_application_bundle(
        request_id=request_id,
        raw=raw,
        job=job,
        application=application,
        event=event,
        create_separately=create_separately,
    )
    if result.status == "cancelled":
        return ManualApplicationOutcome(status="cancelled", replayed=True)
    if result.status == "duplicate":
        duplicate = (
            repo.get_hub_job(result.duplicate_job_id)
            if result.duplicate_job_id is not None
            else None
        )
        duplicate_app = (
            repo.get_application_for_job(duplicate.id, include_deleted=True)
            if duplicate is not None
            else None
        )
        return ManualApplicationOutcome(
            status="duplicate",
            duplicate_job=duplicate,
            duplicate_application=duplicate_app,
        )
    stored_job = repo.get_hub_job(result.job_id) if result.job_id is not None else None
    stored_app = (
        repo.get_application(result.application_id) if result.application_id is not None else None
    )
    if stored_job is None or stored_app is None:
        raise TrackingError("Manual application result is missing", status_code=500)
    return ManualApplicationOutcome(
        status=result.status,
        job=stored_job,
        application=stored_app,
        replayed=result.status == "replayed",
    )


def mark_submitted(
    repo: JobRepository,
    application_id: str,
    *,
    channel: str = "",
    notes: str = "",
    packet_snapshot: PacketSnapshot | None = None,
    materials_dir: Path | None = None,
    confirm_empty: bool = False,
    expected_version_ids: list[str] | None = None,
    idempotency_key: str = "",
) -> Application:
    """Record a submission from current server bindings.

    Draft or Closed → Applied. Interview / Offer / Applied keep their stage.
    Empty materials require ``confirm_empty``. Client snapshots are ignored.
    """
    _ = packet_snapshot
    app = repo.get_application(application_id)
    if app is None or app.deleted_at is not None:
        raise TrackingError(f"Application {application_id} not found", status_code=404)
    key = idempotency_key.strip()
    if key:
        existing = repo.find_submission_by_idempotency(app.id, key)
        if existing is not None:
            stored = repo.get_application(app.id)
            if stored is None:
                raise TrackingError("Application missing after submit", status_code=500)
            return stored
    from job_sentinel.materials.service import MaterialsError, MaterialsService
    from job_sentinel.materials.storage import MaterialStorage

    root = materials_dir if materials_dir is not None else Path("data") / "materials"
    service = MaterialsService(repo, MaterialStorage(root))
    try:
        snapshot = service.packet_snapshot(app.id)
    except MaterialsError as extra:
        raise TrackingError(extra.message, status_code=extra.status_code) from extra
    current_ids = list(snapshot.material_version_ids)
    if expected_version_ids is not None and set(expected_version_ids) != set(current_ids):
        raise TrackingError(
            "Materials changed while confirming. Review the current list and try again.",
            status_code=409,
            code="materials_changed",
        )
    if not snapshot.items and not confirm_empty:
        raise TrackingError(
            "本次未记录材料",
            status_code=409,
            code="empty_materials",
        )
    submission = ApplicationSubmission(
        application_id=app.id,
        channel=channel,
        notes=notes,
        idempotency_key=key,
    )
    try:
        snapshot = service.freeze_snapshot(submission.id, snapshot)
    except MaterialsError as extra:
        raise TrackingError(extra.message, status_code=extra.status_code) from extra
    submission.packet_snapshot = snapshot
    try:
        repo.append_application_submission(submission)
    except ValueError as extra:
        if key:
            stored = repo.get_application(app.id)
            if stored is not None and any(row.idempotency_key == key for row in stored.submissions):
                return stored
        raise TrackingError(str(extra), status_code=409) from extra
    except sqlite3.IntegrityError as extra:
        if key:
            stored = repo.get_application(app.id)
            if stored is not None and any(row.idempotency_key == key for row in stored.submissions):
                return stored
        raise TrackingError(str(extra), status_code=409) from extra
    previous = app.stage
    fields: dict[str, Any] = {}
    if previous in {ApplicationStage.DRAFT, ApplicationStage.CLOSED}:
        fields["stage"] = ApplicationStage.APPLIED
        fields["close_reason"] = None
        fields["close_note"] = ""
        if not app.applied_date:
            fields["applied_date"] = _now().date().isoformat()
    if fields:
        repo.update_application(app.id, **fields)
    repo.append_application_event(
        ApplicationEvent(
            application_id=app.id,
            kind="submitted",
            payload={
                "from_stage": previous.value,
                "to_stage": (
                    ApplicationStage.APPLIED.value
                    if previous in {ApplicationStage.DRAFT, ApplicationStage.CLOSED}
                    else previous.value
                ),
                "channel": channel,
                "reopened_from_closed": previous == ApplicationStage.CLOSED,
                "submission_id": submission.id,
            },
        )
    )
    if app.job_id:
        _touch(repo, app.job_id)
    stored = repo.get_application(app.id)
    if stored is None:
        raise TrackingError("Application missing after submit", status_code=500)
    return stored


def correct_submission_materials(
    repo: JobRepository,
    application_id: str,
    submission_id: str,
    *,
    expected_revision: int,
    items: list[dict[str, object]],
    confirm_empty: bool,
    note: str,
    idempotency_key: str,
    materials_dir: Path,
) -> SubmissionMaterialRevision:
    """Append an immutable material correction for one submission."""
    key = idempotency_key.strip()
    if not re.fullmatch(r"[\x21-\x7e]{8,128}", key):
        raise TrackingError("Invalid idempotency key", status_code=422, code="invalid_request")
    submission = repo.get_application_submission(application_id, submission_id)
    if submission is None:
        raise TrackingError("Submission not found", status_code=404, code="not_found")
    current = repo.latest_submission_material_revision(submission_id)
    current_revision = current.revision if current else 0
    effective = current.packet_snapshot if current else submission.packet_snapshot
    normalized_items: list[dict[str, object]] = []
    for item in items:
        if not isinstance(item, dict):
            raise TrackingError("Invalid correction item", status_code=422, code="invalid_item")
        has_retain = "retain_item_index" in item
        has_version = "material_version_id" in item
        if has_retain == has_version:
            raise TrackingError("Correction item must choose one source", status_code=422, code="invalid_item")
        if has_retain:
            index = item.get("retain_item_index")
            if not isinstance(index, int) or index < 0 or index >= len(effective.items):
                raise TrackingError("Retained item index is invalid", status_code=422, code="invalid_item")
            normalized_items.append({"retain_item_index": index})
        else:
            version_id = str(item.get("material_version_id") or "").strip()
            if not version_id:
                raise TrackingError("Material version is required", status_code=422, code="invalid_item")
            normalized_items.append({"material_version_id": version_id})
    canonical = {
        "contract": "material-revision-v1",
        "application_id": application_id,
        "submission_id": submission_id,
        "expected_revision": expected_revision,
        "items": normalized_items,
        "confirm_empty": bool(confirm_empty),
        "note": note.replace("\r\n", "\n").replace("\r", "\n").strip(),
    }
    request_hash = hashlib.sha256(
        json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    existing = repo.find_submission_revision_by_key(submission_id, key)
    if existing is not None:
        if existing.request_hash != request_hash:
            raise TrackingError("Idempotency key was used for another request", status_code=409, code="idempotency_conflict")
        return existing
    if expected_revision != current_revision:
        raise TrackingError("Materials were corrected in another window", status_code=409, code="revision_conflict")
    if not normalized_items and not confirm_empty:
        raise TrackingError("Confirm empty materials to save", status_code=409, code="empty_materials")

    from job_sentinel.materials.service import MaterialsService
    from job_sentinel.materials.storage import MaterialStorage

    storage = MaterialStorage(materials_dir)
    service = MaterialsService(repo, storage)
    snapshot_items: list[PacketSnapshotItem] = []
    seen_materials: set[str] = set()
    for item in normalized_items:
        if "retain_item_index" in item:
            retained = effective.items[int(item["retain_item_index"])]
            if retained.material_id and retained.material_id in seen_materials:
                raise TrackingError("Duplicate material", status_code=422, code="duplicate_material")
            if retained.material_id:
                seen_materials.add(retained.material_id)
            snapshot_items.append(retained.model_copy())
            continue
        version = repo.get_material_version(str(item["material_version_id"]))
        material = repo.get_material(version.material_id, include_archived=True) if version else None
        if version is None or material is None:
            raise TrackingError("Material version is unavailable", status_code=409, code="material_unavailable")
        if material.kind == "message_template":
            raise TrackingError("Message templates cannot be submission materials", status_code=422, code="invalid_item")
        if material.id in seen_materials:
            raise TrackingError("Duplicate material", status_code=422, code="duplicate_material")
        if version.file_ref and not storage.exists(version.file_ref):
            raise TrackingError("Material file is unavailable", status_code=409, code="material_unavailable")
        seen_materials.add(material.id)
        snapshot_items.append(
            PacketSnapshotItem(
                material_id=material.id,
                material_version_id=version.id,
                title=material.title,
                kind=material.kind,
                version_number=version.version_number,
                version_label=version.version_label,
                original_filename=version.original_filename,
                file_ref=version.file_ref,
                url=version.url,
                material_purpose=list(material.purpose),
                version_purpose=list(version.purpose),
                material_notes=material.notes,
                version_notes=version.notes,
            )
        )
    snapshot = PacketSnapshot(
        binding_ids=[item.binding_id for item in snapshot_items if item.binding_id],
        material_version_ids=[item.material_version_id for item in snapshot_items if item.material_version_id],
        items=snapshot_items,
        note=note.strip(),
    )
    if snapshot.model_dump(mode="json") == effective.model_dump(mode="json"):
        raise TrackingError("Materials did not change", status_code=422, code="no_material_changes")
    revision = SubmissionMaterialRevision(
        submission_id=submission_id,
        revision=expected_revision + 1,
        packet_snapshot=service.freeze_snapshot(
            f"{submission_id}/revisions/{uuid.uuid4().hex}", snapshot
        ),
        note=note.strip(),
        idempotency_key=key,
        request_hash=request_hash,
    )
    status, stored = repo.insert_submission_material_revision(revision, expected_revision)
    if status == "existing" and stored is not None:
        if stored.request_hash != request_hash:
            raise TrackingError("Idempotency key was used for another request", status_code=409, code="idempotency_conflict")
        return stored
    if status == "conflict":
        raise TrackingError("Materials were corrected in another window", status_code=409, code="revision_conflict")
    return revision


def abandon_draft(repo: JobRepository, application_id: str) -> Job | None:
    """Delete a never-submitted draft. Do not set Closed."""
    app = repo.get_application(application_id)
    if app is None or app.deleted_at is not None:
        raise TrackingError(f"Application {application_id} not found", status_code=404)
    if application_was_submitted(app) or app.stage != ApplicationStage.DRAFT:
        raise TrackingError(
            "Only a never-submitted draft can be abandoned. Close a submitted application instead.",
            status_code=409,
        )
    repo.clear_application_bindings(app.id)
    if app.job_id:
        repo.attach_comm_notes_to_job(app.id, app.job_id)
        repo.keep_application_contact_on_job(app.job_id, app.contact)
    repo.soft_delete_application(app.id)
    repo.mark_manual_application_request_cancelled(app.id)
    job: Job | None = None
    if app.job_id:
        job = repo.get_hub_job(app.job_id)
        _touch(repo, app.job_id)
    return job


def close_application(
    repo: JobRepository,
    application_id: str,
    *,
    reason: CloseReason | None = None,
    note: str = "",
) -> Application:
    """Close a submitted application. close_reason is optional. Closed is history."""
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
                "close_reason": reason.value if reason is not None else None,
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
    """Direct Applied/Interview/Offer/Closed changes. Draft→Applied needs Mark Submitted."""
    app = repo.get_application(application_id)
    if app is None or app.deleted_at is not None:
        raise TrackingError(f"Application {application_id} not found", status_code=404)
    if stage == ApplicationStage.DRAFT:
        raise TrackingError("Cannot move a submitted application back to draft", status_code=409)
    if stage == ApplicationStage.CLOSED:
        return close_application(repo, application_id, reason=close_reason, note=close_note)
    if stage == ApplicationStage.APPLIED and not application_was_submitted(app):
        raise TrackingError(
            "Mark Submitted before moving from draft to applied.",
            status_code=409,
        )
    if not application_was_submitted(app) and app.stage == ApplicationStage.DRAFT:
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
    """Job-level stow used by excluded auto-archive. Orthogonal to Application Closed."""
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


def is_manual_dismiss(job: Job) -> bool:
    return job.dismissed_at is not None or REASON_MANUAL_DISMISS in job.filter_reasons


def filter_state_after_dismiss(job: Job) -> str:
    return job.filter_state if job.filter_state else FILTER_STATE_EXCLUDED
