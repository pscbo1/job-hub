"""PRD02 sealed tracking transitions: Save, dismiss mutex, application 1:1."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.core.models import CloseReason, Job, JobEngagement
from job_sentinel.db.repository import JobRepository
from job_sentinel.jobs.actions import (
    TrackingError,
    abandon_draft,
    close_application,
    dismiss_job,
    mark_submitted,
    restore_dismiss,
    save_job,
    start_application,
    start_review,
)

if TYPE_CHECKING:
    from pathlib import Path


def _repo(tmp_path: Path) -> JobRepository:
    return JobRepository(tmp_path / "j.db")


def _job(**kwargs: object) -> Job:
    base: dict[str, object] = {
        "source": "zhaopin",
        "source_job_id": "j1",
        "title": "SWE",
        "company": "Acme",
    }
    base.update(kwargs)
    return Job(**base)  # type: ignore[arg-type]


def test_new_job_engagement_is_null(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    repo.close()
    assert stored.engagement is None
    assert stored.favorite is False
    assert stored.dismissed_at is None
    assert stored.archived_at is None


def test_save_and_dismiss_mutex(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    saved = save_job(repo, stored.id)
    assert saved.favorite is True
    assert saved.dismissed_at is None
    dismissed = dismiss_job(repo, stored.id)
    assert dismissed.favorite is False
    assert dismissed.engagement is None
    assert dismissed.dismissed_at is not None
    restored = restore_dismiss(repo, stored.id)
    assert restored.dismissed_at is None
    assert restored.favorite is False
    assert restored.engagement is None
    repo.close()


def test_save_while_dismissed_clears_dismiss(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    dismiss_job(repo, stored.id)
    saved = save_job(repo, stored.id)
    assert saved.favorite is True
    assert saved.dismissed_at is None
    repo.close()


def test_start_review_sets_under_study(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    reviewed = start_review(repo, stored.id)
    assert reviewed.engagement == JobEngagement.UNDER_STUDY
    repo.close()


def test_start_application_creates_draft_and_todo(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    save_job(repo, stored.id)
    job, app = start_application(repo, stored.id)
    assert job.engagement == JobEngagement.TO_DO
    assert app.stage.value == "draft"
    assert app.job_id == stored.id
    again_job, again_app = start_application(repo, stored.id)
    assert again_app.id == app.id
    assert again_job.engagement == JobEngagement.TO_DO
    repo.close()


def test_abandon_draft_does_not_close(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job(favorite=True))
    job, app = start_application(repo, stored.id)
    assert job.engagement == JobEngagement.TO_DO
    leftover = abandon_draft(repo, app.id)
    assert leftover is not None
    assert leftover.engagement == JobEngagement.UNDER_STUDY
    assert leftover.favorite is True
    gone = repo.get_application(app.id)
    assert gone is None or gone.deleted_at is not None
    listed = repo.list_applications()
    assert listed == []
    stats = repo.application_stats()
    assert stats["draft"] == 0
    assert stats["closed"] == 0
    assert stats["total"] == 0
    repo.close()


def test_mark_submitted_and_reapply_after_close(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    _job_row, app = start_application(repo, stored.id)
    submitted = mark_submitted(repo, app.id, channel="liepin")
    assert submitted.stage.value == "applied"
    assert len(submitted.submissions) == 1
    closed = close_application(repo, app.id, reason=CloseReason.NOT_SELECTED, note="未录用")
    assert closed.stage.value == "closed"
    assert closed.close_reason == CloseReason.NOT_SELECTED
    reopened = mark_submitted(repo, app.id, channel="email")
    assert reopened.stage.value == "applied"
    assert reopened.close_reason is None
    assert reopened.close_note == ""
    assert len(reopened.submissions) == 2
    events = repo.list_application_events(app.id)
    assert any(e.kind == "closed" for e in events)
    assert any(e.kind == "submitted" for e in events)
    repo.close()


def test_cannot_close_unsubmitted_draft(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    _job_row, app = start_application(repo, stored.id)
    with pytest.raises(TrackingError):
        close_application(repo, app.id, reason=CloseReason.WITHDREW)
    repo.close()


def test_cannot_dismiss_with_open_application(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    start_application(repo, stored.id)
    with pytest.raises(TrackingError):
        dismiss_job(repo, stored.id)
    repo.close()


def test_archive_is_job_level_not_closed(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    from job_sentinel.jobs.actions import archive_job, restore_archive

    archived = archive_job(repo, stored.id, reason="later")
    assert archived.archived_at is not None
    assert archived.engagement is None
    restored = restore_archive(repo, stored.id)
    assert restored.archived_at is None
    repo.close()


def test_api_transitions(tmp_path: Path) -> None:
    db = tmp_path / "j.db"
    repo = JobRepository(db)
    stored = repo.upsert_job(_job())
    repo.close()
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=db))

    saved = client.post(f"/api/jobs/{stored.id}/save")
    assert saved.status_code == 200
    assert saved.json()["favorite"] is True
    assert saved.json()["engagement"] is None

    review = client.post(f"/api/jobs/{stored.id}/start-review")
    assert review.json()["engagement"] == "under_study"

    started = client.post(f"/api/jobs/{stored.id}/start-application")
    assert started.status_code == 200
    app = started.json()["application"]
    assert app["stage"] == "draft"
    assert started.json()["job"]["engagement"] == "to_do"

    submitted = client.post(f"/api/applications/{app['id']}/submit", json={"channel": "web"})
    assert submitted.json()["stage"] == "applied"
    assert submitted.json()["submissions"]

    closed = client.post(
        f"/api/applications/{app['id']}/close",
        json={"close_reason": "no_response", "close_note": "无回复"},
    )
    assert closed.json()["stage"] == "closed"
    assert closed.json()["close_reason"] == "no_response"

    reapply = client.post(f"/api/applications/{app['id']}/submit", json={"channel": "email"})
    assert reapply.json()["stage"] == "applied"
    assert reapply.json()["close_reason"] is None
    assert len(reapply.json()["submissions"]) == 2

    mine = client.get("/api/jobs", params={"view": "my_jobs"}).json()
    assert any(j["id"] == stored.id for j in mine)

    archived = client.post(f"/api/jobs/{stored.id}/archive", json={"reason": "idle"})
    assert archived.json()["archived_at"]
    hidden = client.get("/api/jobs", params={"view": "my_jobs"}).json()
    assert hidden == []


def test_my_jobs_membership(tmp_path: Path) -> None:
    from job_sentinel.jobs.actions import archive_job

    repo = _repo(tmp_path)
    plain = repo.upsert_job(_job(source_job_id="plain"))
    saved = repo.upsert_job(_job(source_job_id="saved"))
    save_job(repo, saved.id)
    reviewed = repo.upsert_job(_job(source_job_id="reviewed"))
    start_review(repo, reviewed.id)
    dismissed = repo.upsert_job(_job(source_job_id="dismissed"))
    dismiss_job(repo, dismissed.id)
    stowed = repo.upsert_job(_job(source_job_id="stowed", favorite=True))
    archive_job(repo, stowed.id)

    mine = {j.source_job_id for j in repo.list_hub_jobs(view="my_jobs")}
    assert mine == {"saved", "reviewed"}
    discover = {j.source_job_id for j in repo.list_hub_jobs(view="discover")}
    assert "plain" in discover
    assert "dismissed" not in discover
    assert "stowed" not in discover
    assert plain.engagement is None
    repo.close()
