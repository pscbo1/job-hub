"""Optional free-text Application tags. Not a taxonomy."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.core.models import Job
from job_sentinel.db.repository import JobRepository
from job_sentinel.jobs.actions import abandon_draft, mark_submitted, start_application
from job_sentinel.jobs.membership import job_belongs_on_tasks
from job_sentinel.jobs.tags import (
    application_matches_tags,
    normalize_application_tags,
    unique_application_tags,
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


def test_normalize_reuses_existing_spelling() -> None:
    assert normalize_application_tags([" 用户研究 ", "用户研究", "产品"], known=["用户研究"]) == [
        "用户研究",
        "产品",
    ]


def test_application_tags_patch_reload_and_filter(tmp_path: Path) -> None:
    db = tmp_path / "api.db"
    repo = JobRepository(db)
    first = repo.upsert_job(_job())
    second = repo.upsert_job(_job(source_job_id="j2", title="PM"))
    _created, app = start_application(repo, first.id)
    _created2, other = start_application(repo, second.id)
    repo.close()
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=db))
    patched = client.patch(
        f"/api/applications/{app.id}",
        json={"tags": [" 用户研究 ", "产品", "用户研究"]},
    )
    assert patched.status_code == 200
    assert patched.json()["tags"] == ["用户研究", "产品"]
    reloaded = client.get(f"/api/applications/{app.id}")
    assert reloaded.status_code == 200
    assert reloaded.json()["tags"] == ["用户研究", "产品"]
    other_tags = client.patch(
        f"/api/applications/{other.id}",
        json={"tags": ["英文岗位"]},
    )
    assert other_tags.status_code == 200
    catalog = client.get("/api/applications/tags")
    assert catalog.status_code == 200
    assert set(catalog.json()["tags"]) == {"英文岗位", "用户研究", "产品"}
    filtered = client.get("/api/applications", params={"tag": "用户研究"})
    assert filtered.status_code == 200
    ids = {row["id"] for row in filtered.json()}
    assert app.id in ids
    assert other.id not in ids
    cleared = client.patch(f"/api/applications/{app.id}", json={"tags": []})
    assert cleared.status_code == 200
    assert cleared.json()["tags"] == []
    submitted = client.post(
        f"/api/applications/{app.id}/submit",
        json={"confirm_empty": True},
    )
    assert submitted.status_code == 200
    assert submitted.json()["stage"] == "applied"
    assert submitted.json()["tags"] == []


def test_cancel_draft_drops_tags_from_lookup(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job(comment="Keep research notes."))
    _created, app = start_application(repo, stored.id)
    repo.update_application(app.id, tags=["用户研究"])
    leftover = abandon_draft(repo, app.id)
    assert leftover is not None
    assert leftover.comment == "Keep research notes."
    assert "tags" not in leftover.model_dump()
    gone = repo.get_application(app.id)
    assert gone is None or gone.deleted_at is not None
    assert repo.list_application_tags() == []
    repo.close()


def test_tags_do_not_change_tasks_membership(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    stored = repo.upsert_job(_job())
    _created, app = start_application(repo, stored.id)
    mark_submitted(repo, app.id, confirm_empty=True)
    repo.update_application(app.id, tags=["产品"])
    job = repo.get_hub_job(stored.id)
    assert job is not None
    assert job_belongs_on_tasks(job, has_draft_application=False) is False
    repo.close()


def test_unique_and_match_helpers() -> None:
    from job_sentinel.core.models import Application

    research = Application(title="A", tags=["用户研究"])
    product = Application(title="B", tags=["产品"])
    assert unique_application_tags([research, product]) == ["用户研究", "产品"]
    assert application_matches_tags(research, ["用户研究"]) is True
    assert application_matches_tags(product, ["用户研究"]) is False
