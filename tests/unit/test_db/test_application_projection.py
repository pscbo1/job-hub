"""Application list/detail projections from Job fields (not stored on applications)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest

from job_sentinel.core.models import Application, Job, JobRaw
from job_sentinel.db.repository import JobRepository

if TYPE_CHECKING:
    from pathlib import Path


@pytest.fixture()
def repo(tmp_path: Path) -> JobRepository:
    db = JobRepository(tmp_path / "app_projection.db")
    yield db
    db.close()


def _job(**kwargs: object) -> Job:
    base: dict[str, object] = {
        "source": "remoteok",
        "source_job_id": "src-1",
        "title": "Software Engineer",
        "company": "Acme",
        "location": "Remote",
        "job_url": "https://example.com/jobs/acme",
        "canonical_url": "https://example.com/jobs/acme",
    }
    base.update(kwargs)
    return Job(**base)  # type: ignore[arg-type]


def _app(**kwargs: object) -> Application:
    merged: dict[str, object] = {"title": "SWE Intern", "employer": "Acme"}
    merged.update(kwargs)
    return Application(**merged)  # type: ignore[arg-type]


def test_application_projects_job_next_step_deadline_and_jd(repo: JobRepository) -> None:
    job = repo.upsert_job(
        _job(
            next_step="email recruiter",
            deadline=datetime(2026, 9, 12, tzinfo=UTC),
            description="Full JD text",
            comment="Ask about on-call",
        )
    )
    created = repo.create_application(_app(job_id=job.id, title="SWE"))
    fetched = repo.get_application(created.id)
    assert fetched is not None
    assert fetched.next_step == "email recruiter"
    assert fetched.job_deadline == "2026-09-12"
    assert fetched.job_description == "Full JD text"
    assert fetched.job_comment == "Ask about on-call"
    assert fetched.job_url == "https://example.com/jobs/acme"


def test_apply_url_only_from_stored_http_payload(repo: JobRepository) -> None:
    job = repo.upsert_job(_job(source_job_id="apply-http"))
    repo.insert_job_raw(
        JobRaw(
            source="remoteok",
            source_job_id="apply-http",
            job_id=job.id,
            raw_payload={
                "apply_url": "https://acme.com/apply",
                "chat": "https://linkedin.com/in/x",
            },
        )
    )
    created = repo.create_application(_app(job_id=job.id))
    fetched = repo.get_application(created.id)
    assert fetched is not None
    assert fetched.apply_url == "https://acme.com/apply"


def test_apply_url_from_application_url_key(repo: JobRepository) -> None:
    job = repo.upsert_job(_job(source_job_id="apply-app-url"))
    repo.insert_job_raw(
        JobRaw(
            source="remoteok",
            source_job_id="apply-app-url",
            job_id=job.id,
            raw_payload={"application_url": "https://boards.example.com/jobs/1"},
        )
    )
    created = repo.create_application(_app(job_id=job.id))
    fetched = repo.get_application(created.id)
    assert fetched is not None
    assert fetched.apply_url == "https://boards.example.com/jobs/1"


def test_apply_url_ignores_mailto_and_scheme_less_values(repo: JobRepository) -> None:
    job = repo.upsert_job(_job(source_job_id="apply-bad"))
    repo.insert_job_raw(
        JobRaw(
            source="remoteok",
            source_job_id="apply-bad",
            job_id=job.id,
            raw_payload={
                "apply_url": "mailto:hr@acme.com",
                "application_url": "acme.com/apply",
                "conversation_url": "https://linkedin.com/messaging/thread/1",
            },
        )
    )
    created = repo.create_application(_app(job_id=job.id))
    fetched = repo.get_application(created.id)
    assert fetched is not None
    assert fetched.apply_url == ""


def test_update_application_does_not_persist_projection_fields(repo: JobRepository) -> None:
    job = repo.upsert_job(_job(source_job_id="proj-write", next_step="old step"))
    created = repo.create_application(_app(job_id=job.id, notes="start"))
    assert repo.update_application(
        created.id,
        next_step="hacked",
        apply_url="https://evil.example/apply",
        job_url="https://evil.example/job",
        job_description="nope",
        job_comment="nope",
        job_deadline="1999-01-01",
        notes="kept",
    )
    row = dict(repo._db["applications"].get(created.id))
    assert "next_step" not in row
    assert "apply_url" not in row
    assert "job_url" not in row
    assert "job_description" not in row
    fetched = repo.get_application(created.id)
    assert fetched is not None
    assert fetched.notes == "kept"
    assert fetched.next_step == "old step"
    assert fetched.apply_url == ""
