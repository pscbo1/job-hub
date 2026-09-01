"""Idle / no-update cleanup for Applied applications."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from job_sentinel.core.models import Application, ApplicationStage, Job, JobTask
from job_sentinel.db.repository import JobRepository
from job_sentinel.jobs.actions import mark_submitted, set_application_stage, start_application
from job_sentinel.jobs.idle import IdleCleanupSettings, save_idle_cleanup_settings
from job_sentinel.jobs.membership import enrich_application_stale, is_stale_applied

if TYPE_CHECKING:
    from pathlib import Path


def _old() -> datetime:
    return datetime.now(tz=UTC) - timedelta(days=20)


def test_stale_applied_requires_applied_stage() -> None:
    old = _old()
    app = Application(stage=ApplicationStage.INTERVIEW, updated_at=old, created_at=old)
    job = Job(source="x", source_job_id="1", last_activity_at=old)
    assert is_stale_applied(app, job) is False
    offer = Application(stage=ApplicationStage.OFFER, updated_at=old, created_at=old)
    assert is_stale_applied(offer, job) is False


def test_stale_applied_honors_idle_days() -> None:
    old = datetime.now(tz=UTC) - timedelta(days=10)
    app = Application(stage=ApplicationStage.APPLIED, updated_at=old, created_at=old)
    job = Job(source="x", source_job_id="1", last_activity_at=old)
    assert is_stale_applied(app, job, idle_days=14) is False
    assert is_stale_applied(app, job, idle_days=7) is True


def test_stale_applied_skips_manual_exemption() -> None:
    old = _old()
    app = Application(
        stage=ApplicationStage.APPLIED,
        updated_at=old,
        created_at=old,
        exclude_from_idle=True,
    )
    job = Job(source="x", source_job_id="1", last_activity_at=old)
    assert is_stale_applied(app, job) is False


def test_stale_applied_all_applied_when_cleanup_on() -> None:
    old = _old()
    app = Application(stage=ApplicationStage.APPLIED, updated_at=old, created_at=old)
    with_next = Job(source="x", source_job_id="1", next_step="ping", last_activity_at=old)
    assert is_stale_applied(app, with_next) is True
    with_task = Job(
        source="x",
        source_job_id="2",
        last_activity_at=old,
        tasks=[JobTask(job_id="2", title="OA", done=False)],
    )
    assert is_stale_applied(app, with_task) is True


def test_stale_applied_off_when_cleanup_disabled() -> None:
    old = _old()
    app = Application(stage=ApplicationStage.APPLIED, updated_at=old, created_at=old)
    job = Job(source="x", source_job_id="1", last_activity_at=old)
    assert is_stale_applied(app, job, cleanup_enabled=False) is False


def test_stale_applied_ignores_collector_job_updated_at() -> None:
    old = _old()
    app = Application(stage=ApplicationStage.APPLIED, updated_at=old, created_at=old)
    job = Job(
        source="x",
        source_job_id="1",
        last_activity_at=old,
        updated_at=datetime.now(tz=UTC),
    )
    assert is_stale_applied(app, job) is True


def test_stale_applied_true_when_idle(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    job = repo.upsert_job(Job(source="zhaopin", source_job_id="idle", title="SWE"))
    _row, app = start_application(repo, job.id)
    submitted = mark_submitted(repo, app.id, materials_dir=tmp_path / "materials")
    old = _old()
    repo.update_application(submitted.id, updated_at=old.isoformat())
    repo.update_hub_job_tracking(job.id)
    repo._db["jobs"].update(
        job.id, {"last_activity_at": old.isoformat(), "updated_at": old.isoformat()}
    )
    repo._db["applications"].update(
        submitted.id,
        {"updated_at": old.isoformat(), "created_at": old.isoformat()},
    )
    repo._db["application_submissions"].update(
        submitted.submissions[0].id,
        {"submitted_at": old.isoformat()},
    )
    stored_app = repo.get_application(submitted.id)
    stored_job = repo.get_hub_job(job.id)
    assert stored_app is not None and stored_job is not None
    assert is_stale_applied(stored_app, stored_job) is True
    interview = set_application_stage(repo, stored_app.id, ApplicationStage.INTERVIEW)
    repo._db["jobs"].update(job.id, {"last_activity_at": old.isoformat()})
    repo._db["applications"].update(interview.id, {"updated_at": old.isoformat()})
    again = repo.get_application(interview.id)
    assert again is not None
    assert is_stale_applied(again, repo.get_hub_job(job.id)) is False
    repo.close()


def test_enrich_respects_idle_cleanup_settings(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    old = _old()
    app = repo.create_application(
        Application(stage=ApplicationStage.APPLIED, updated_at=old, created_at=old, title="Idle")
    )
    save_idle_cleanup_settings(repo, IdleCleanupSettings(enabled=False, idle_days=14))
    frozen = enrich_application_stale(repo, app)
    assert frozen.stale_applied is False
    save_idle_cleanup_settings(repo, IdleCleanupSettings(enabled=True, idle_days=14))
    live = enrich_application_stale(repo, repo.get_application(app.id) or app)
    assert live.stale_applied is True
    repo.update_application(app.id, exclude_from_idle=True)
    exempt = enrich_application_stale(repo, repo.get_application(app.id) or app)
    assert exempt.exclude_from_idle is True
    assert exempt.stale_applied is False
    repo.close()
