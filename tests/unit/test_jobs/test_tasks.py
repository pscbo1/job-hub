"""Job checklist tasks: CRUD, last_activity bump, API."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.core.models import Application, ApplicationStage, Job
from job_sentinel.db.repository import JobRepository

if TYPE_CHECKING:
    from pathlib import Path


def _job(**kwargs: object) -> Job:
    base: dict[str, object] = {
        "source": "zhaopin",
        "source_job_id": "j1",
        "title": "SWE",
        "company": "Acme",
    }
    base.update(kwargs)
    return Job(**base)  # type: ignore[arg-type]


def test_task_crud_bumps_last_activity(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    assert stored.last_activity_at is None
    task = repo.create_job_task(stored.id, title="OA", due_at=date(2026, 9, 5))
    assert task is not None
    after_create = repo.get_hub_job(stored.id)
    assert after_create is not None
    assert after_create.last_activity_at is not None
    assert after_create.tasks[0].title == "OA"
    updated = repo.update_job_task(stored.id, task.id, {"done": True})
    assert updated is not None
    assert updated.done is True
    assert repo.delete_job_task(stored.id, task.id) is True
    gone = repo.get_hub_job(stored.id)
    assert gone is not None
    assert gone.tasks == []
    repo.close()


def test_collector_upsert_does_not_set_last_activity(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    first = repo.upsert_job(_job(last_activity_at=datetime.now(tz=UTC), title="v1"))
    assert first.last_activity_at is None
    again = repo.upsert_job(first.model_copy(update={"title": "v2"}))
    assert again.last_activity_at is None
    assert again.title == "v2"
    repo.close()


def test_task_api_roundtrip(tmp_path: Path) -> None:
    db = tmp_path / "api.db"
    repo = JobRepository(db)
    stored = repo.upsert_job(_job())
    repo.close()
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=db))
    created = client.post(
        f"/api/jobs/{stored.id}/tasks",
        json={"title": "Prep", "due_at": "2026-09-08"},
    )
    assert created.status_code == 200
    task_id = created.json()["id"]
    listed = client.get(f"/api/jobs/{stored.id}/tasks")
    assert listed.status_code == 200
    assert listed.json()[0]["title"] == "Prep"
    patched = client.patch(
        f"/api/jobs/{stored.id}/tasks/{task_id}",
        json={"done": True},
    )
    assert patched.status_code == 200
    assert patched.json()["done"] is True
    deleted = client.delete(f"/api/jobs/{stored.id}/tasks/{task_id}")
    assert deleted.status_code == 200
    empty = client.get(f"/api/jobs/{stored.id}/tasks")
    assert empty.json() == []
    job = client.get("/api/jobs?view=discover")
    assert job.status_code == 200


def test_task_attachment_upload_and_delete(tmp_path: Path) -> None:
    db = tmp_path / "api.db"
    repo = JobRepository(db)
    stored = repo.upsert_job(_job())
    task = repo.create_job_task(stored.id, title="Take-home")
    assert task is not None
    repo.close()
    client = TestClient(
        create_app(
            profile_path=tmp_path / "p.yaml",
            db_path=db,
            materials_dir=tmp_path / "files",
        )
    )
    uploaded = client.post(
        f"/api/jobs/{stored.id}/tasks/{task.id}/attachments",
        files={"file": ("prompt.txt", b"read me", "text/plain")},
    )
    assert uploaded.status_code == 200
    attachment = uploaded.json()
    assert attachment["original_filename"] == "prompt.txt"
    listed = client.get(f"/api/jobs/{stored.id}/tasks")
    assert listed.json()[0]["attachments"][0]["id"] == attachment["id"]
    downloaded = client.get(
        f"/api/jobs/{stored.id}/tasks/{task.id}/attachments/{attachment['id']}/file"
    )
    assert downloaded.status_code == 200
    assert downloaded.content == b"read me"
    removed = client.delete(
        f"/api/jobs/{stored.id}/tasks/{task.id}/attachments/{attachment['id']}"
    )
    assert removed.status_code == 200
    uploaded_again = client.post(
        f"/api/jobs/{stored.id}/tasks/{task.id}/attachments",
        files={"file": ("prompt.txt", b"read me", "text/plain")},
    )
    assert uploaded_again.status_code == 200
    second_attachment = uploaded_again.json()
    deleted_task = client.delete(f"/api/jobs/{stored.id}/tasks/{task.id}")
    assert deleted_task.status_code == 200
    assert client.get(f"/api/jobs/{stored.id}/tasks").json() == []
    assert not (tmp_path / "files" / second_attachment["file_ref"]).exists()


def test_task_from_application_stores_shared_fields(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    app = repo.create_application(Application(job_id=stored.id, title="SWE", employer="Acme"))
    task = repo.create_job_task(
        stored.id,
        title="Prep case",
        due_at=date(2026, 9, 10),
        notes="Bring portfolio",
        source_url="https://example.com/oa",
        application_id=app.id,
    )
    assert task is not None
    assert task.notes == "Bring portfolio"
    assert task.source_url == "https://example.com/oa"
    assert task.application_id == app.id
    listed = repo.list_job_tasks(stored.id)
    assert listed[0].application_id == app.id
    assert listed[0].notes == "Bring portfolio"
    repo.close()


def test_task_rejects_application_on_other_job(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    other = repo.upsert_job(_job(source_job_id="j2"))
    app = repo.create_application(Application(job_id=other.id, title="Other", employer="X"))
    with pytest.raises(ValueError, match="not linked"):
        repo.create_job_task(stored.id, title="OA", application_id=app.id)
    repo.close()


def test_completing_task_does_not_change_application_stage(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    stored = repo.upsert_job(_job())
    app = repo.create_application(Application(job_id=stored.id, title="SWE", employer="Acme"))
    assert app.stage == ApplicationStage.DRAFT
    task = repo.create_job_task(stored.id, title="OA", application_id=app.id)
    assert task is not None
    updated = repo.update_job_task(stored.id, task.id, {"done": True})
    assert updated is not None
    assert updated.done is True
    again = repo.get_application(app.id)
    assert again is not None
    assert again.stage == ApplicationStage.DRAFT
    assert again.applied_date == ""
    repo.close()


def test_task_api_from_application(tmp_path: Path) -> None:
    db = tmp_path / "api.db"
    repo = JobRepository(db)
    stored = repo.upsert_job(_job())
    app = repo.create_application(Application(job_id=stored.id, title="SWE", employer="Acme"))
    repo.close()
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=db))
    created = client.post(
        f"/api/jobs/{stored.id}/tasks",
        json={
            "title": "From app",
            "notes": "n",
            "source_url": "https://example.com/oa",
            "application_id": app.id,
        },
    )
    assert created.status_code == 200
    body = created.json()
    assert body["application_id"] == app.id
    assert body["notes"] == "n"
    assert body["source_url"] == "https://example.com/oa"
    missing = client.post(
        f"/api/jobs/{stored.id}/tasks",
        json={"title": "Missing app", "application_id": "no-such-app"},
    )
    assert missing.status_code == 404
