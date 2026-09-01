"""Idle auto-archive skip rules and sweep."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

from job_sentinel.core.models import CloseReason, Job, JobStatus, JobTask
from job_sentinel.db.repository import JobRepository
from job_sentinel.jobs.archive import (
    ArchiveSettings,
    load_archive_settings,
    run_auto_archive,
    save_archive_settings,
    should_auto_archive,
)

if TYPE_CHECKING:
    from pathlib import Path


def _job(**kwargs: object) -> Job:
    past = datetime(2026, 8, 1, tzinfo=UTC)
    base: dict[str, object] = {
        "source": "zhaopin",
        "source_job_id": "idle-1",
        "title": "PM",
        "company": "Acme",
        "status": JobStatus.UNDER_STUDY,
        "discovered_at": past,
        "last_activity_at": past,
    }
    base.update(kwargs)
    return Job(**base)  # type: ignore[arg-type]


def test_skips_in_progress_and_reference() -> None:
    now = datetime(2026, 9, 1, tzinfo=UTC)
    for status in (JobStatus.APPLIED, JobStatus.INTERVIEW, JobStatus.OFFER, JobStatus.REFERENCE):
        assert should_auto_archive(_job(status=status), idle_days=14, now=now) is False


def test_skips_future_follow_up() -> None:
    now = datetime(2026, 9, 1, tzinfo=UTC)
    job = _job(follow_up_at=date(2026, 9, 10))
    assert should_auto_archive(job, idle_days=14, now=now) is False


def test_skips_nonempty_next_step() -> None:
    now = datetime(2026, 9, 1, tzinfo=UTC)
    assert should_auto_archive(_job(next_step="email recruiter"), idle_days=14, now=now) is False
    assert should_auto_archive(_job(next_step="  "), idle_days=14, now=now) is True


def test_skips_incomplete_tasks() -> None:
    now = datetime(2026, 9, 1, tzinfo=UTC)
    open_task = JobTask(job_id="idle-1", title="Finish OA")
    assert should_auto_archive(_job(tasks=[open_task]), idle_days=14, now=now) is False
    done = JobTask(job_id="idle-1", title="Finish OA", done=True)
    assert should_auto_archive(_job(tasks=[done]), idle_days=14, now=now) is True


def test_task_activity_prevents_idle_archive(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "tasks.db")
    try:
        stored = repo.upsert_job(_job())
        created = repo.create_job_task(stored.id, title="Prep interview")
        assert created is not None
        now = datetime(2026, 9, 1, tzinfo=UTC)
        fresh = repo.get_hub_job(stored.id)
        assert fresh is not None
        assert fresh.last_activity_at is not None
        assert should_auto_archive(fresh, idle_days=14, now=now) is False
        repo.update_job_task(stored.id, created.id, {"done": True})
        done_job = repo.get_hub_job(stored.id)
        assert done_job is not None
        assert should_auto_archive(done_job, idle_days=14, now=now) is False
        idle = done_job.model_copy(update={"last_activity_at": datetime(2026, 8, 1, tzinfo=UTC)})
        assert should_auto_archive(idle, idle_days=14, now=now) is True
    finally:
        repo.close()
    now = datetime(2026, 9, 1, tzinfo=UTC)
    assert should_auto_archive(_job(), idle_days=14, now=now) is True
    recent = _job(last_activity_at=datetime(2026, 8, 25, tzinfo=UTC))
    assert should_auto_archive(recent, idle_days=14, now=now) is False


def test_run_respects_enabled_flag(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "a.db")
    try:
        stored = repo.upsert_job(_job())
        off = run_auto_archive(repo, force=False)
        assert off.disabled is True
        assert off.archived == 0
        save_archive_settings(repo, ArchiveSettings(enabled=True, idle_days=14))
        loaded = load_archive_settings(repo)
        assert loaded.enabled is True
        now = datetime(2026, 9, 1, tzinfo=UTC)
        dry = run_auto_archive(repo, now=now, dry_run=True, force=True)
        assert dry.archived == 1
        assert repo.get_hub_job(stored.id).status == JobStatus.UNDER_STUDY  # type: ignore[union-attr]
        done = run_auto_archive(repo, now=now, force=True)
        assert done.archived == 1
        closed = repo.get_hub_job(stored.id)
        assert closed is not None
        assert closed.status == JobStatus.CLOSED
        assert closed.close_reason == CloseReason.AUTO_ARCHIVED
    finally:
        repo.close()
