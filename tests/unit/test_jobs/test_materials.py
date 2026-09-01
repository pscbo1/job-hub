"""Materials Library, Packet bindings, and submission snapshots."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.core.models import Application, Job
from job_sentinel.db.repository import SCHEMA_VERSION, JobRepository
from job_sentinel.jobs.actions import abandon_draft, mark_submitted, start_application
from job_sentinel.materials.service import MaterialsError, MaterialsService
from job_sentinel.materials.storage import MaterialStorage

if TYPE_CHECKING:
    from pathlib import Path


def _service(tmp_path: Path) -> tuple[JobRepository, MaterialsService]:
    repo = JobRepository(tmp_path / "j.db")
    service = MaterialsService(repo, MaterialStorage(tmp_path / "materials"))
    return repo, service


def test_schema_version_is_9() -> None:
    assert SCHEMA_VERSION == 9


def test_binding_unique_per_material(tmp_path: Path) -> None:
    repo, service = _service(tmp_path)
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE"))
    _row, app = start_application(repo, job.id)
    first = service.create_material(title="Resume", url="https://example.com/r1.pdf")
    v2 = service.add_version(first.id, url="https://example.com/r2.pdf", version_label="research")
    service.add_binding(app.id, first.versions[0].id)
    with pytest.raises(MaterialsError):
        service.add_binding(app.id, v2.id)
    changed = service.change_binding_version(
        app.id, repo.list_application_bindings(app.id)[0].id, v2.id
    )
    assert changed.material_version_id == v2.id
    assert len(repo.list_application_bindings(app.id)) == 1
    repo.close()


def test_replace_packet_rejects_two_versions_of_same_material(tmp_path: Path) -> None:
    repo, service = _service(tmp_path)
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE"))
    _row, app = start_application(repo, job.id)
    material = service.create_material(title="Resume", url="https://example.com/r1.pdf")
    v2 = service.add_version(material.id, url="https://example.com/r2.pdf")
    with pytest.raises(MaterialsError):
        service.replace_packet(app.id, [material.versions[0].id, v2.id])
    repo.close()


def test_submit_snapshots_server_bindings_not_client(tmp_path: Path) -> None:
    repo, service = _service(tmp_path)
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE"))
    _row, app = start_application(repo, job.id)
    material = service.create_material(
        title="英文简历",
        url="https://example.com/en.pdf",
        purpose=["research"],
        version_purpose=["2026 campus"],
    )
    service.replace_packet(app.id, [material.versions[0].id])
    submitted = mark_submitted(
        repo,
        app.id,
        materials_dir=tmp_path / "materials",
    )
    snap = submitted.submissions[0].packet_snapshot
    assert snap.items[0].title == "英文简历"
    assert snap.items[0].url == "https://example.com/en.pdf"
    assert snap.items[0].material_purpose == ["research"]
    assert snap.items[0].version_purpose == ["2026 campus"]
    v2 = service.add_version(material.id, url="https://example.com/en-v2.pdf")
    service.replace_packet(app.id, [v2.id])
    again = mark_submitted(repo, app.id, materials_dir=tmp_path / "materials")
    assert len(again.submissions) == 2
    assert again.submissions[0].packet_snapshot.items[0].url == "https://example.com/en.pdf"
    assert again.submissions[1].packet_snapshot.items[0].url == "https://example.com/en-v2.pdf"
    repo.close()


def test_empty_packet_snapshot_is_explicit(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE"))
    _row, app = start_application(repo, job.id)
    submitted = mark_submitted(repo, app.id, materials_dir=tmp_path / "materials")
    snap = submitted.submissions[0].packet_snapshot
    assert snap.items == []
    assert snap.material_version_ids == []
    repo.close()


def test_cancel_draft_clears_bindings_keeps_library(tmp_path: Path) -> None:
    repo, service = _service(tmp_path)
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE"))
    _row, app = start_application(repo, job.id)
    material = service.create_material(title="Resume", url="https://example.com/r.pdf")
    service.replace_packet(app.id, [material.versions[0].id])
    abandon_draft(repo, app.id)
    assert repo.list_application_bindings(app.id) == []
    stored = repo.get_material(material.id)
    assert stored is not None
    assert stored.title == "Resume"
    repo.close()


def test_upload_and_api_packet(tmp_path: Path) -> None:
    db = tmp_path / "j.db"
    materials = tmp_path / "materials"
    client = TestClient(
        create_app(profile_path=tmp_path / "p.yaml", db_path=db, materials_dir=materials)
    )
    repo = JobRepository(db)
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE", company="Acme"))
    _row, app = start_application(repo, job.id)
    repo.close()
    created = client.post(
        "/api/materials/upload",
        data={"title": "Resume", "kind": "resume"},
        files={"file": ("resume.pdf", b"%PDF-1.4 sample", "application/pdf")},
    )
    assert created.status_code == 200
    material = created.json()
    version_id = material["versions"][0]["id"]
    bound = client.put(
        f"/api/applications/{app.id}/packet",
        json={"material_version_ids": [version_id]},
    )
    assert bound.status_code == 200
    assert len(bound.json()["items"]) == 1
    submitted = client.post(f"/api/applications/{app.id}/submit", json={})
    assert submitted.status_code == 200
    items = submitted.json()["submissions"][0]["packet_snapshot"]["items"]
    assert items[0]["original_filename"] == "resume.pdf"
    file_resp = client.get(f"/api/material-versions/{version_id}/file")
    assert file_resp.status_code == 200
    assert file_resp.content.startswith(b"%PDF")


def test_api_rejects_duplicate_material_in_packet(tmp_path: Path) -> None:
    db = tmp_path / "j.db"
    client = TestClient(
        create_app(profile_path=tmp_path / "p.yaml", db_path=db, materials_dir=tmp_path / "m")
    )
    repo = JobRepository(db)
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE"))
    _row, app = start_application(repo, job.id)
    repo.close()
    first = client.post(
        "/api/materials",
        json={"title": "Resume", "url": "https://example.com/a.pdf"},
    )
    assert first.status_code == 200
    mid = first.json()["id"]
    v1 = first.json()["versions"][0]["id"]
    v2 = client.post(
        f"/api/materials/{mid}/versions",
        json={"url": "https://example.com/b.pdf"},
    ).json()["id"]
    ok = client.put(
        f"/api/applications/{app.id}/packet",
        json={"material_version_ids": [v1]},
    )
    assert ok.status_code == 200
    dup = client.post(
        f"/api/applications/{app.id}/packet/bindings",
        json={"material_version_id": v2},
    )
    assert dup.status_code == 400


def test_application_exclude_from_idle_default() -> None:
    app = Application(title="legacy")
    assert app.exclude_from_idle is False
