"""Sealed Part 1 tracking: Save, Reference, Tasks membership, Application."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.core.models import ApplicationCommNote, ApplicationStage, CloseReason, Job
from job_sentinel.db.repository import JobRepository
from job_sentinel.jobs.actions import (
    TrackingError,
    abandon_draft,
    close_application,
    dismiss_job,
    mark_submitted,
    restore_dismiss,
    save_job,
    set_application_stage,
    set_reference,
    start_application,
)
from job_sentinel.jobs.membership import job_belongs_on_tasks

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


def test_new_job_flags_are_off(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    repo.close()
    assert stored.engagement is None
    assert stored.favorite is False
    assert stored.reference is False
    assert stored.dismissed_at is None
    assert stored.archived_at is None


def test_save_and_reference_coexist(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    saved = save_job(repo, stored.id)
    referenced = set_reference(repo, stored.id, referenced=True)
    assert referenced.favorite is True
    assert referenced.reference is True
    assert referenced.engagement is None
    assert saved.favorite is True
    repo.close()


def test_save_and_dismiss_mutex(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    save_job(repo, stored.id)
    set_reference(repo, stored.id, referenced=True)
    dismissed = dismiss_job(repo, stored.id)
    assert dismissed.favorite is False
    assert dismissed.reference is False
    assert dismissed.engagement is None
    assert dismissed.dismissed_at is not None
    restored = restore_dismiss(repo, stored.id)
    assert restored.dismissed_at is None
    assert restored.favorite is False
    assert restored.reference is False
    repo.close()


def test_save_while_dismissed_clears_dismiss(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    dismiss_job(repo, stored.id)
    saved = save_job(repo, stored.id)
    assert saved.favorite is True
    assert saved.dismissed_at is None
    repo.close()


def test_start_application_from_plain_discover_job(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    job, app = start_application(repo, stored.id)
    assert job.favorite is False
    assert job.reference is False
    assert job.engagement is None
    assert app.stage is ApplicationStage.DRAFT
    assert app.job_id == stored.id
    again_job, again_app = start_application(repo, stored.id)
    assert again_app.id == app.id
    assert again_job.id == job.id
    repo.close()


def test_start_application_blocked_when_dismissed(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    dismiss_job(repo, stored.id)
    with pytest.raises(TrackingError, match="Restore"):
        start_application(repo, stored.id)
    repo.close()


def test_abandon_draft_does_not_close(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job(favorite=True, reference=True))
    _created, app = start_application(repo, stored.id)
    leftover = abandon_draft(repo, app.id)
    assert leftover is not None
    assert leftover.favorite is True
    assert leftover.reference is True
    gone = repo.get_application(app.id)
    assert gone is None or gone.deleted_at is not None
    listed = repo.list_applications()
    assert listed == []
    stats = repo.application_stats()
    assert stats["draft"] == 0
    assert stats["closed"] == 0
    assert stats["total"] == 0
    repo.close()


def test_application_contact_patch_reload(tmp_path: Path) -> None:
    db = tmp_path / "api.db"
    repo = JobRepository(db)
    stored = repo.upsert_job(_job())
    _created, app = start_application(repo, stored.id)
    repo.close()
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=db))
    patched = client.patch(
        f"/api/applications/{app.id}",
        json={"contact": "Ada / wechat: ada\nhttps://example.com/ada"},
    )
    assert patched.status_code == 200
    assert patched.json()["contact"] == "Ada / wechat: ada\nhttps://example.com/ada"
    reloaded = client.get(f"/api/applications/{app.id}")
    assert reloaded.status_code == 200
    assert reloaded.json()["contact"] == "Ada / wechat: ada\nhttps://example.com/ada"
    empty = client.patch(f"/api/applications/{app.id}", json={"contact": ""})
    assert empty.status_code == 200
    assert empty.json()["contact"] == ""
    submitted = client.post(
        f"/api/applications/{app.id}/submit",
        json={"confirm_empty": True},
    )
    assert submitted.status_code == 200
    assert submitted.json()["contact"] == ""
    assert submitted.json()["stage"] == "applied"


def test_abandon_draft_keeps_contact_on_job(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job(comment="Ask about mixed methods."))
    _created, app = start_application(repo, stored.id)
    repo.update_application(app.id, contact="Ada / wechat: ada")
    leftover = abandon_draft(repo, app.id)
    assert leftover is not None
    gone = repo.get_application(app.id)
    assert gone is None or gone.deleted_at is not None
    assert repo.list_applications() == []
    job_after = repo.get_hub_job(stored.id)
    assert job_after is not None
    assert job_after.contact == "Ada / wechat: ada"
    assert job_after.comment == "Ask about mixed methods."
    repo.close()


def test_abandon_draft_empty_contact_does_not_wipe_leftover(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job(comment="Keep research notes."))
    _created, app = start_application(repo, stored.id)
    repo.update_application(app.id, contact="First leftover")
    abandon_draft(repo, app.id)
    _created2, app2 = start_application(repo, stored.id)
    assert (app2.contact or "") == "First leftover"
    repo.update_application(app2.id, contact="")
    leftover = abandon_draft(repo, app2.id)
    assert leftover is not None
    assert leftover.contact == "First leftover"
    assert leftover.comment == "Keep research notes."
    repo.close()


def test_upsert_job_preserves_leftover_contact(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    repo.keep_application_contact_on_job(stored.id, "Ada / wechat: ada")
    again = repo.upsert_job(_job(title="SWE 2", comment="collector must not write this"))
    assert again.id == stored.id
    assert again.contact == "Ada / wechat: ada"
    assert again.title == "SWE 2"
    assert again.comment == ""
    repo.close()


def test_abandon_draft_contact_api_visible_on_job_lookup(tmp_path: Path) -> None:
    db = tmp_path / "api.db"
    repo = JobRepository(db)
    stored = repo.upsert_job(_job(comment="Ask about mixed methods."))
    _created, app = start_application(repo, stored.id)
    repo.update_application(app.id, contact="Ada / wechat: ada")
    repo.close()
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=db))
    abandoned = client.post(f"/api/applications/{app.id}/abandon")
    assert abandoned.status_code == 200
    missing = client.get(f"/api/applications/{app.id}")
    assert missing.status_code == 404
    jobs = client.get("/api/jobs")
    assert jobs.status_code == 200
    row = next(item for item in jobs.json() if item["id"] == stored.id)
    assert row["contact"] == "Ada / wechat: ada"
    assert row["comment"] == "Ask about mixed methods."


def test_abandon_draft_keeps_comm_notes_on_job(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job(comment="Ask about mixed methods."))
    _created, app = start_application(repo, stored.id)
    occurred = datetime(2026, 8, 1, 10, 30, tzinfo=UTC)
    note = repo.create_comm_note(
        ApplicationCommNote(
            application_id=app.id,
            body="Emailed recruiter about OA",
            created_at=occurred,
        )
    )
    assert note.job_id == stored.id
    leftover = abandon_draft(repo, app.id)
    assert leftover is not None
    gone = repo.get_application(app.id)
    assert gone is None or gone.deleted_at is not None
    assert repo.list_applications() == []
    kept = repo.list_comm_notes_for_job(stored.id)
    assert len(kept) == 1
    assert kept[0].body == "Emailed recruiter about OA"
    assert kept[0].created_at == occurred
    assert kept[0].job_id == stored.id
    job_after = repo.get_hub_job(stored.id)
    assert job_after is not None
    assert job_after.comment == "Ask about mixed methods."
    assert job_after.comm_notes[0].body == "Emailed recruiter about OA"
    repo.close()


def test_abandon_draft_comm_notes_api_uses_original_occurred_at(tmp_path: Path) -> None:
    db = tmp_path / "api.db"
    repo = JobRepository(db)
    stored = repo.upsert_job(_job())
    _created, app = start_application(repo, stored.id)
    occurred = datetime(2026, 7, 15, 8, 0, tzinfo=UTC)
    repo.create_comm_note(
        ApplicationCommNote(
            application_id=app.id,
            body="Pinged on Boss",
            created_at=occurred,
        )
    )
    repo.close()
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=db))
    abandoned = client.post(f"/api/applications/{app.id}/abandon")
    assert abandoned.status_code == 200
    missing = client.get(f"/api/applications/{app.id}")
    assert missing.status_code == 404
    notes = client.get(f"/api/jobs/{stored.id}/comm-notes")
    assert notes.status_code == 200
    body = notes.json()
    assert len(body) == 1
    assert body[0]["body"] == "Pinged on Boss"
    assert body[0]["created_at"].startswith("2026-07-15T08:00:00")
    assert body[0]["job_id"] == stored.id


def test_mark_submitted_creates_submission(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    _job_row, app = start_application(repo, stored.id)
    submitted = mark_submitted(repo, app.id, channel="liepin", confirm_empty=True)
    assert submitted.stage is ApplicationStage.APPLIED
    assert len(submitted.submissions) == 1
    assert submitted.submissions[0].submitted_at is not None
    closed = close_application(repo, app.id)
    assert closed.stage is ApplicationStage.CLOSED
    assert closed.close_reason is None
    reopened = mark_submitted(repo, app.id, channel="email", confirm_empty=True)
    assert reopened.stage is ApplicationStage.APPLIED
    assert reopened.close_reason is None
    assert len(reopened.submissions) == 2
    repo.close()


def test_patch_cannot_skip_mark_submitted(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    _job_row, app = start_application(repo, stored.id)
    with pytest.raises(TrackingError, match="Mark Submitted"):
        set_application_stage(repo, app.id, ApplicationStage.APPLIED)
    with pytest.raises(TrackingError, match="Mark Submitted"):
        set_application_stage(repo, app.id, ApplicationStage.INTERVIEW)
    repo.close()


def test_close_does_not_require_reason(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    _job_row, app = start_application(repo, stored.id)
    mark_submitted(repo, app.id, confirm_empty=True)
    closed = set_application_stage(repo, app.id, ApplicationStage.CLOSED)
    assert closed.stage is ApplicationStage.CLOSED
    assert closed.close_reason is None
    reopened = set_application_stage(repo, app.id, ApplicationStage.INTERVIEW)
    assert reopened.stage is ApplicationStage.INTERVIEW
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


def test_plain_saved_reference_not_on_tasks(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    plain = repo.upsert_job(_job(source_job_id="plain"))
    saved = repo.upsert_job(_job(source_job_id="saved"))
    save_job(repo, saved.id)
    referenced = repo.upsert_job(_job(source_job_id="ref"))
    set_reference(repo, referenced.id, referenced=True)
    both = repo.upsert_job(_job(source_job_id="both"))
    save_job(repo, both.id)
    set_reference(repo, both.id, referenced=True)
    next_step = repo.upsert_job(_job(source_job_id="next"))
    repo.update_hub_job_tracking(next_step.id, next_step="email recruiter")
    ddl = repo.upsert_job(_job(source_job_id="ddl"))
    repo.update_hub_job_tracking(ddl.id, deadline=datetime.now(tz=UTC) + timedelta(days=3))
    tasked = repo.upsert_job(_job(source_job_id="task"))
    repo.create_job_task(tasked.id, title="OA")
    draft_job = repo.upsert_job(_job(source_job_id="draft"))
    start_application(repo, draft_job.id)
    applied_job = repo.upsert_job(_job(source_job_id="applied"))
    _job_row, app = start_application(repo, applied_job.id)
    mark_submitted(repo, app.id, confirm_empty=True)

    members = {j.source_job_id for j in repo.list_hub_jobs(view="tasks")}
    assert "plain" not in members
    assert "saved" not in members
    assert "ref" not in members
    assert "both" not in members
    assert members == {"next", "ddl", "task", "draft"}
    assert job_belongs_on_tasks(plain) is False
    assert job_belongs_on_tasks(saved) is False
    assert "applied" not in members
    repo.close()


def test_tasks_search_skips_discovered_at(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    hit = repo.upsert_job(_job(source_job_id="hit", title="Platform Engineer", company="Stripe"))
    repo.update_hub_job_tracking(hit.id, next_step="follow up")
    miss = repo.upsert_job(_job(source_job_id="miss", title="SWE", company="Acme"))
    repo.update_hub_job_tracking(miss.id, next_step="prep")
    tasked = repo.upsert_job(_job(source_job_id="oa", title="Analyst", company="Beta"))
    repo.create_job_task(tasked.id, title="Take-home OA")
    found_titles = {j.source_job_id for j in repo.list_hub_jobs(view="tasks", q="platform")}
    assert found_titles == {"hit"}
    found_tasks = {j.source_job_id for j in repo.list_hub_jobs(view="tasks", q="take-home")}
    assert found_tasks == {"oa"}
    found_next = {j.source_job_id for j in repo.list_hub_jobs(view="tasks", q="follow")}
    assert found_next == {"hit"}
    repo.close()


def test_dismiss_excluded_and_restore(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    dismissed = dismiss_job(repo, stored.id)
    assert dismissed.filter_state == "excluded"
    discover = {j.id for j in repo.list_hub_jobs(view="discover")}
    assert stored.id not in discover
    excluded = {j.id for j in repo.list_hub_jobs(filter_state="excluded")}
    assert stored.id in excluded
    restored = restore_dismiss(repo, stored.id)
    assert restored.dismissed_at is None
    repo.close()


def test_api_transitions_and_orphan_guard(tmp_path: Path) -> None:
    db = tmp_path / "j.db"
    repo = JobRepository(db)
    stored = repo.upsert_job(_job())
    repo.close()
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=db))

    saved = client.post(f"/api/jobs/{stored.id}/save")
    assert saved.status_code == 200
    assert saved.json()["favorite"] is True
    referenced = client.post(f"/api/jobs/{stored.id}/reference")
    assert referenced.json()["reference"] is True
    assert referenced.json()["favorite"] is True
    assert referenced.json()["engagement"] is None

    gone = client.post(f"/api/jobs/{stored.id}/start-review")
    assert gone.status_code == 410

    started = client.post(f"/api/jobs/{stored.id}/start-application")
    assert started.status_code == 200
    app = started.json()["application"]
    assert app["stage"] == "draft"
    assert started.json()["job"]["reference"] is True

    skip = client.patch(f"/api/applications/{app['id']}", json={"stage": "applied"})
    assert skip.status_code == 409

    submitted = client.post(
        f"/api/applications/{app['id']}/submit",
        json={"channel": "web", "confirm_empty": True},
    )
    assert submitted.json()["stage"] == "applied"
    assert submitted.json()["submissions"]

    closed = client.patch(f"/api/applications/{app['id']}", json={"stage": "closed"})
    assert closed.status_code == 200
    assert closed.json()["stage"] == "closed"
    assert closed.json()["close_reason"] is None

    closed_view = client.get("/api/applications", params={"view": "closed"}).json()
    assert any(row["id"] == app["id"] for row in closed_view)
    open_view = client.get("/api/applications", params={"view": "open"}).json()
    assert all(row["id"] != app["id"] for row in open_view)

    reapply = client.post(
        f"/api/applications/{app['id']}/submit",
        json={"channel": "email", "confirm_empty": True},
    )
    assert reapply.json()["stage"] == "applied"
    assert len(reapply.json()["submissions"]) == 2

    orphan = client.post("/api/applications", json={"title": "Orphan", "employer": "X"})
    assert orphan.status_code == 422

    under = client.patch(f"/api/jobs/{stored.id}", json={"engagement": "under_study"})
    assert under.status_code == 422
