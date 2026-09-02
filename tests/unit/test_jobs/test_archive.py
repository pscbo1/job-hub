"""Idle auto-archive only for Excluded/Dismissed jobs."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from job_sentinel.core.models import Job
from job_sentinel.db.repository import JobRepository
from job_sentinel.jobs.actions import dismiss_job, save_job, set_reference, start_application
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
    dismiss_job(repo, job.id)
    result = run_idle_archive(repo)
    assert result.archived == 0
    stored = repo.get_hub_job(job.id)
    assert stored is not None
    assert stored.archived_at is None
    repo.close()


def test_idle_archive_skips_plain_included_even_when_forced(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    old = datetime.now(tz=UTC) - timedelta(days=30)
    job = repo.upsert_job(
        Job(source="zhaopin", source_job_id="old", title="SWE", discovered_at=old)
    )
    result = run_idle_archive(repo, force=True)
    assert result.archived == 0
    stored = repo.get_hub_job(job.id)
    assert stored is not None
    assert stored.archived_at is None
    repo.close()


def test_idle_archive_excluded_when_forced(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    old = datetime.now(tz=UTC) - timedelta(days=30)
    job = repo.upsert_job(
        Job(source="zhaopin", source_job_id="old", title="SWE", discovered_at=old)
    )
    dismiss_job(repo, job.id)
    repo.update_hub_job_tracking(job.id, dismissed_at=old)
    result = run_idle_archive(repo, force=True)
    assert result.archived == 1
    stored = repo.get_hub_job(job.id)
    assert stored is not None
    assert stored.archived_at is not None
    still = repo.list_hub_jobs(filter_state="excluded")
    assert any(row.id == job.id for row in still)
    repo.close()


def test_idle_archive_on_setting_archives_only_excluded(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    old = datetime.now(tz=UTC) - timedelta(days=30)
    included = repo.upsert_job(
        Job(source="zhaopin", source_job_id="keep", title="SWE", discovered_at=old)
    )
    excluded = repo.upsert_job(
        Job(source="zhaopin", source_job_id="gone", title="SWE", discovered_at=old)
    )
    dismiss_job(repo, excluded.id)
    repo.update_hub_job_tracking(excluded.id, dismissed_at=old)
    save_archive_settings(repo, ArchiveSettings(enabled=True, idle_days=14))
    result = run_idle_archive(repo)
    assert result.archived == 1
    assert excluded.id in result.job_ids
    keep = repo.get_hub_job(included.id)
    assert keep is not None and keep.archived_at is None
    repo.close()


def test_should_not_archive_saved_or_reference() -> None:
    old = datetime(2020, 1, 1, tzinfo=UTC)
    saved = Job(
        source="x",
        source_job_id="1",
        favorite=True,
        filter_state="excluded",
        discovered_at=old,
    )
    referenced = Job(
        source="x",
        source_job_id="2",
        reference=True,
        filter_state="excluded",
        discovered_at=old,
    )
    rules = ArchiveSettings(enabled=True, idle_days=14)
    assert should_auto_archive(saved, rules) is False
    assert should_auto_archive(referenced, rules) is False


def test_should_archive_old_dismissed() -> None:
    job = Job(
        source="x",
        source_job_id="1",
        dismissed_at=datetime(2020, 1, 1, tzinfo=UTC),
        filter_state="excluded",
        discovered_at=datetime(2020, 1, 1, tzinfo=UTC),
    )
    assert should_auto_archive(job, ArchiveSettings(enabled=True, idle_days=14)) is True


def test_open_application_blocks_excluded_archive(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    old = datetime.now(tz=UTC) - timedelta(days=30)
    job = repo.upsert_job(
        Job(source="zhaopin", source_job_id="old", title="SWE", discovered_at=old)
    )
    start_application(repo, job.id)
    save_job(repo, job.id)
    set_reference(repo, job.id, referenced=True)
    result = run_idle_archive(repo, force=True)
    assert result.archived == 0
    repo.close()


def test_restore_after_auto_archive_returns_to_current_or_excluded(tmp_path: Path) -> None:
    from job_sentinel.jobs.actions import restore_dismiss
    from job_sentinel.jobs.archive import ArchiveSettings, run_idle_archive, save_archive_settings

    repo = JobRepository(tmp_path / "j.db")
    old = datetime.now(tz=UTC) - timedelta(days=30)
    eligible = repo.upsert_job(
        Job(source="zhaopin", source_job_id="ok", title="SWE", discovered_at=old)
    )
    intern = repo.upsert_job(
        Job(
            source="zhaopin",
            source_job_id="intern",
            title="实习 SWE",
            discovered_at=old,
        )
    )
    dismiss_job(repo, eligible.id)
    dismiss_job(repo, intern.id)
    repo.update_hub_job_tracking(eligible.id, dismissed_at=old)
    repo.update_hub_job_tracking(intern.id, dismissed_at=old)
    save_archive_settings(repo, ArchiveSettings(enabled=True, idle_days=14))
    result = run_idle_archive(repo)
    assert result.archived == 2
    restored_ok = restore_dismiss(repo, eligible.id)
    restored_intern = restore_dismiss(repo, intern.id)
    assert restored_ok.dismissed_at is None
    assert restored_ok.archived_at is None
    assert restored_ok.filter_state != "excluded"
    assert restored_intern.dismissed_at is None
    assert restored_intern.archived_at is None
    assert restored_intern.filter_state == "excluded"
    assert restored_intern.filter_reasons
    current = {row.id for row in repo.list_hub_jobs(filter_state="included")}
    excluded = {row.id for row in repo.list_hub_jobs(filter_state="excluded")}
    assert eligible.id in current
    assert eligible.id not in excluded
    assert intern.id in excluded
    assert intern.id not in current
    repo.close()
