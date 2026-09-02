"""Materials Library, Packet bindings, and submission snapshots."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.core.models import Application, ApplicationCommNote, Job
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


def test_schema_version_is_15() -> None:
    assert SCHEMA_VERSION == 15


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
    submitted = mark_submitted(
        repo, app.id, materials_dir=tmp_path / "materials", confirm_empty=True
    )
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
    repo.create_comm_note(
        ApplicationCommNote(application_id=app.id, body="Asked for JD", job_id=job.id)
    )
    abandon_draft(repo, app.id)
    assert repo.list_application_bindings(app.id) == []
    stored = repo.get_material(material.id)
    assert stored is not None
    assert stored.title == "Resume"
    kept = repo.list_comm_notes_for_job(job.id)
    assert [note.body for note in kept] == ["Asked for JD"]
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


def test_same_material_versions_bind_independently_across_apps(tmp_path: Path) -> None:
    repo, service = _service(tmp_path)
    job_a = repo.upsert_job(Job(source="manual", source_job_id="a", title="UX Researcher"))
    job_b = repo.upsert_job(Job(source="manual", source_job_id="b", title="PM"))
    _ja, app_a = start_application(repo, job_a.id)
    _jb, app_b = start_application(repo, job_b.id)
    material = service.create_material(title="Resume", url="https://example.com/r1.pdf")
    v1 = material.versions[0].id
    v2 = service.add_version(material.id, url="https://example.com/r2.pdf").id
    service.replace_packet(app_a.id, [v1])
    service.replace_packet(app_b.id, [v2])
    assert repo.list_application_bindings(app_a.id)[0].material_version_id == v1
    assert repo.list_application_bindings(app_b.id)[0].material_version_id == v2
    assert repo.count_application_bindings(app_a.id) == 1
    service.change_binding_version(app_a.id, repo.list_application_bindings(app_a.id)[0].id, v2)
    assert repo.count_application_bindings(app_a.id) == 1
    assert repo.list_application_bindings(app_a.id)[0].material_version_id == v2
    repo.close()


def test_draft_with_materials_and_applied_without(tmp_path: Path) -> None:
    repo, service = _service(tmp_path)
    draft_job = repo.upsert_job(Job(source="manual", source_job_id="d", title="Draft role"))
    applied_job = repo.upsert_job(Job(source="manual", source_job_id="p", title="Applied role"))
    _jd, draft = start_application(repo, draft_job.id)
    _ja, applied = start_application(repo, applied_job.id)
    material = service.create_material(title="Resume", url="https://example.com/r.pdf")
    service.replace_packet(draft.id, [material.versions[0].id])
    submitted = mark_submitted(
        repo, applied.id, materials_dir=tmp_path / "materials", confirm_empty=True
    )
    assert draft.stage.value == "draft" or repo.get_application(draft.id).stage.value == "draft"
    stored_draft = repo.get_application(draft.id)
    assert stored_draft is not None
    assert stored_draft.stage.value == "draft"
    assert stored_draft.current_material_count == 1
    assert submitted.stage.value == "applied"
    assert submitted.current_material_count == 0
    assert submitted.submissions[0].packet_snapshot.items == []
    repo.close()


def test_empty_submit_requires_confirm_and_is_idempotent(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "j.db")
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE"))
    _row, app = start_application(repo, job.id)
    with pytest.raises(Exception, match="本次未记录材料"):
        mark_submitted(repo, app.id, materials_dir=tmp_path / "materials")
    first = mark_submitted(
        repo,
        app.id,
        materials_dir=tmp_path / "materials",
        confirm_empty=True,
        idempotency_key="submit-1",
    )
    again = mark_submitted(
        repo,
        app.id,
        materials_dir=tmp_path / "materials",
        confirm_empty=True,
        idempotency_key="submit-1",
    )
    assert len(first.submissions) == 1
    assert len(again.submissions) == 1
    assert again.submissions[0].id == first.submissions[0].id
    assert again.stage.value == "applied"
    repo.close()


def test_api_empty_submit_returns_coded_409(tmp_path: Path) -> None:
    db = tmp_path / "j.db"
    client = TestClient(
        create_app(profile_path=tmp_path / "p.yaml", db_path=db, materials_dir=tmp_path / "m")
    )
    repo = JobRepository(db)
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE"))
    _row, app = start_application(repo, job.id)
    repo.close()
    blocked = client.post(f"/api/applications/{app.id}/submit", json={})
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "empty_materials"
    first = client.post(
        f"/api/applications/{app.id}/submit",
        json={"confirm_empty": True, "idempotency_key": "k1"},
    )
    retry = client.post(
        f"/api/applications/{app.id}/submit",
        json={"confirm_empty": True, "idempotency_key": "k1"},
    )
    assert first.status_code == 200
    assert retry.status_code == 200
    assert len(first.json()["submissions"]) == 1
    assert len(retry.json()["submissions"]) == 1
    assert retry.json()["submissions"][0]["id"] == first.json()["submissions"][0]["id"]


def test_submit_rejects_stale_expected_versions(tmp_path: Path) -> None:
    repo, service = _service(tmp_path)
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE"))
    _row, app = start_application(repo, job.id)
    material = service.create_material(title="Resume", url="https://example.com/r.pdf")
    service.replace_packet(app.id, [material.versions[0].id])
    with pytest.raises(Exception, match="Materials changed"):
        mark_submitted(
            repo,
            app.id,
            materials_dir=tmp_path / "materials",
            expected_version_ids=[],
        )
    repo.close()


def test_interview_stays_on_another_submission(tmp_path: Path) -> None:
    from job_sentinel.core.models import ApplicationStage
    from job_sentinel.jobs.actions import set_application_stage

    repo, service = _service(tmp_path)
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE"))
    _row, app = start_application(repo, job.id)
    material = service.create_material(title="Resume", url="https://example.com/r.pdf")
    service.replace_packet(app.id, [material.versions[0].id])
    submitted = mark_submitted(repo, app.id, materials_dir=tmp_path / "materials")
    interviewed = set_application_stage(repo, submitted.id, ApplicationStage.INTERVIEW)
    again = mark_submitted(repo, interviewed.id, materials_dir=tmp_path / "materials")
    assert again.stage is ApplicationStage.INTERVIEW
    assert len(again.submissions) == 2
    repo.close()


def test_submission_snapshot_download_keeps_v1_and_v2(tmp_path: Path) -> None:
    db = tmp_path / "j.db"
    materials = tmp_path / "materials"
    client = TestClient(
        create_app(profile_path=tmp_path / "p.yaml", db_path=db, materials_dir=materials)
    )
    repo = JobRepository(db)
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE"))
    _row, app = start_application(repo, job.id)
    repo.close()
    created = client.post(
        "/api/materials/upload",
        data={"title": "Resume", "kind": "resume"},
        files={"file": ("v1.pdf", b"%PDF-1.4 first", "application/pdf")},
    )
    assert created.status_code == 200
    material_id = created.json()["id"]
    v1 = created.json()["versions"][0]["id"]
    bound = client.put(
        f"/api/applications/{app.id}/packet",
        json={"material_version_ids": [v1]},
    )
    assert bound.status_code == 200
    first = client.post(f"/api/applications/{app.id}/submit", json={})
    assert first.status_code == 200
    v2 = client.post(
        f"/api/materials/{material_id}/versions/upload",
        data={"version_label": "campus"},
        files={"file": ("v2.pdf", b"%PDF-1.4 second", "application/pdf")},
    )
    assert v2.status_code == 200
    v2_id = v2.json()["id"]
    client.put(
        f"/api/applications/{app.id}/packet",
        json={"material_version_ids": [v2_id]},
    )
    second = client.post(f"/api/applications/{app.id}/submit", json={})
    assert second.status_code == 200
    subs = second.json()["submissions"]
    assert len(subs) == 2
    s1, s2 = subs[0], subs[1]
    assert s1["packet_snapshot"]["items"][0]["original_filename"] == "v1.pdf"
    assert s2["packet_snapshot"]["items"][0]["original_filename"] == "v2.pdf"
    file1 = client.get(f"/api/applications/{app.id}/submissions/{s1['id']}/items/0/file")
    file2 = client.get(f"/api/applications/{app.id}/submissions/{s2['id']}/items/0/file")
    assert file1.status_code == 200
    assert file2.status_code == 200
    assert file1.content == b"%PDF-1.4 first"
    assert file2.content == b"%PDF-1.4 second"
    latest = client.get(f"/api/material-versions/{v2_id}/file")
    assert latest.content == b"%PDF-1.4 second"
    assert file1.content != latest.content


def test_knowledge_content_md_versions(tmp_path: Path) -> None:
    repo, service = _service(tmp_path)
    created = service.create_material(
        title="Boss greeting",
        kind="message_template",
        content="# Hello\nThanks for the chat.",
    )
    assert created.kind == "message_template"
    assert created.versions[0].original_filename == "content.md"
    assert "Thanks for the chat" in created.versions[0].text
    v2 = service.add_version(created.id, content="# Hello\nUpdated body.")
    assert v2.version_number == 2
    assert "Updated body" in v2.text
    repo.close()


def test_new_library_version_does_not_move_bindings(tmp_path: Path) -> None:
    repo, service = _service(tmp_path)
    job = repo.upsert_job(Job(source="manual", source_job_id="1", title="SWE"))
    _row, app = start_application(repo, job.id)
    material = service.create_material(title="Resume", data=b"%PDF-1.4 a", filename="a.pdf")
    v1 = material.versions[0].id
    service.replace_packet(app.id, [v1])
    v2 = service.add_version(material.id, data=b"%PDF-1.4 b", filename="b.pdf")
    binding = repo.list_application_bindings(app.id)[0]
    assert binding.material_version_id == v1
    assert binding.material_version_id != v2.id
    repo.close()
