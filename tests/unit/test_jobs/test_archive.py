"""Idle auto-archive sets Job.archived_at, never Closed."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from job_sentinel.core.models import Job
from job_sentinel.db.repository import JobRepository
from job_sentinel.jobs.archive import (
    ArchiveSettings,
    run_idle_archive,
    save_archive_settings,
    should_auto_archive,
)

if TYPE_CHECKING:
    from pathlib import Path


def test_idle_archive_default_off(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    old = datetime.now(tz=UTC) - timedelta(days=30)
    job = repo.upsert_job(
        Job(source="zhaopin", source_job_id="old", title="SWE", discovered_at=old)
    )
    result = run_idle_archive(repo)
    assert result.archived == 0
    stored = repo.get_hub_job(job.id)
    assert stored is not None
    assert stored.archived_at is None
    repo.close()


def test_idle_archive_sets_archived_at_when_forced(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    old = datetime.now(tz=UTC) - timedelta(days=30)
    job = repo.upsert_job(
        Job(source="zhaopin", source_job_id="old", title="SWE", discovered_at=old)
    )
    save_archive_settings(repo, ArchiveSettings(enabled=False, idle_days=14))
    result = run_idle_archive(repo, force=True)
    assert result.archived == 1
    stored = repo.get_hub_job(job.id)
    assert stored is not None
    assert stored.archived_at is not None
    assert stored.engagement is None
    repo.close()


def test_should_not_archive_with_next_step() -> None:
    job = Job(
        source="x",
        source_job_id="1",
        next_step="follow up Friday",
        discovered_at=datetime(2020, 1, 1, tzinfo=UTC),
    )
    assert should_auto_archive(job, ArchiveSettings(enabled=True, idle_days=14)) is False


def test_should_not_archive_with_open_task() -> None:
    from job_sentinel.core.models import JobTask

    job = Job(
        source="x",
        source_job_id="1",
        discovered_at=datetime(2020, 1, 1, tzinfo=UTC),
        tasks=[JobTask(job_id="1", title="OA", done=False)],
    )
    assert should_auto_archive(job, ArchiveSettings(enabled=True, idle_days=14)) is False


def test_should_not_archive_reference() -> None:
    from job_sentinel.core.models import JobEngagement

    job = Job(
        source="x",
        source_job_id="1",
        engagement=JobEngagement.REFERENCE,
        discovered_at=datetime(2020, 1, 1, tzinfo=UTC),
    )
    assert should_auto_archive(job, ArchiveSettings(enabled=True, idle_days=14)) is False


def test_open_task_blocks_forced_archive(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    old = datetime.now(tz=UTC) - timedelta(days=30)
    job = repo.upsert_job(
        Job(source="zhaopin", source_job_id="old", title="SWE", discovered_at=old)
    )
    repo.create_job_task(job.id, title="OA")
    result = run_idle_archive(repo, force=True)
    assert result.archived == 0
    stored = repo.get_hub_job(job.id)
    assert stored is not None
    assert stored.archived_at is None
    repo.close()
