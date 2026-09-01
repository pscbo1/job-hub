"""Job checklist tasks: CRUD, last_activity bump, API."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.core.models import Job
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
