"""Manual Add application creates one stable Job + Draft transaction."""

from __future__ import annotations

import sqlite3
import uuid
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.core.models import Job
from job_sentinel.db.repository import JobRepository

if TYPE_CHECKING:
    from pathlib import Path


def _client(tmp_path: Path) -> tuple[TestClient, Path]:
    db = tmp_path / "manual.db"
    return TestClient(create_app(profile_path=tmp_path / "profile.yaml", db_path=db)), db


def _payload(**updates: object) -> dict[str, object]:
    body: dict[str, object] = {
        "request_id": str(uuid.uuid4()),
        "title": "Backend Engineer",
        "company": "Acme",
    }
    body.update(updates)
    return body


def test_title_company_only_creates_raw_job_draft_and_event(tmp_path: Path) -> None:
    client, db = _client(tmp_path)
    response = client.post("/api/applications/manual", json=_payload())
    assert response.status_code == 201
    body = response.json()
    assert body["replayed"] is False
    assert body["job"]["source"] == "manual"
    assert body["job"]["source_job_id"].startswith("manual:")
    assert body["job"]["favorite"] is False
    assert body["job"]["reference"] is False
    assert body["job"]["engagement"] is None
    assert body["job"]["last_activity_at"] is not None
    assert body["application"]["stage"] == "draft"
    assert body["application"]["job_id"] == body["job"]["id"]
    assert body["application"]["current_material_count"] == 0
    assert body["application"]["applied_date"] == ""

    repo = JobRepository(db)
    assert len(repo.list_job_raw_by_source_key("manual", body["job"]["source_job_id"])) == 1
    events = repo.list_application_events(body["application"]["id"])
    assert [(event.kind, event.payload["stage"]) for event in events] == [("created", "draft")]
    tasks_jobs = repo.list_hub_jobs(view="tasks")
    assert [job.id for job in tasks_jobs] == [body["job"]["id"]]
    repo.close()


def test_optional_manual_fields_persist_and_link_is_source_only(tmp_path: Path) -> None:
    client, db = _client(tmp_path)
    response = client.post(
        "/api/applications/manual",
        json=_payload(
            job_url="https://example.com/jobs/1?utm_source=test",
            location="Shanghai",
            source_note="Shared by an alum",
            market="en",
        ),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["job"]["job_url"] == "https://example.com/jobs/1?utm_source=test"
    assert body["job"]["canonical_url"] == "https://example.com/jobs/1"
    assert body["job"]["location"] == "Shanghai"
    assert body["job"]["source_note"] == "Shared by an alum"
    assert body["job"]["market"] == "en"
    assert body["application"]["url"] == body["job"]["job_url"]
    assert body["application"]["apply_url"] == ""
    assert body["application"]["job_url"] == body["job"]["job_url"]
    JobRepository(db).close()


def test_validation_failure_writes_nothing(tmp_path: Path) -> None:
    client, db = _client(tmp_path)
    response = client.post(
        "/api/applications/manual",
        json=_payload(title=" ", job_url="javascript:alert(1)"),
    )
    assert response.status_code == 422
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM jobs_raw").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM applications").fetchone()[0] == 0


def test_request_replay_is_idempotent_and_cancelled_request_stays_sealed(
    tmp_path: Path,
) -> None:
    client, db = _client(tmp_path)
    payload = _payload()
    first = client.post("/api/applications/manual", json=payload)
    replay = client.post("/api/applications/manual", json=payload)
    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.json()["replayed"] is True
    assert replay.json()["job"]["id"] == first.json()["job"]["id"]
    app_id = first.json()["application"]["id"]
    assert client.post(f"/api/applications/{app_id}/abandon").status_code == 200
    cancelled = client.post("/api/applications/manual", json=payload)
    assert cancelled.status_code == 200
    assert cancelled.json() == {
        "job": None,
        "application": None,
        "replayed": True,
        "cancelled": True,
    }
    repo = JobRepository(db)
    assert len(repo.list_all_hub_jobs()) == 1
    assert repo.list_applications() == []
    repo.close()


def test_same_url_conflicts_then_create_separately_succeeds(tmp_path: Path) -> None:
    client, db = _client(tmp_path)
    url = "https://example.com/job/42?utm_source=one"
    first = client.post("/api/applications/manual", json=_payload(job_url=url))
    second_payload = _payload(job_url="https://example.com/job/42?utm_medium=two")
    duplicate = client.post("/api/applications/manual", json=second_payload)
    assert first.status_code == 201
    assert duplicate.status_code == 409
    detail = duplicate.json()["detail"]
    assert detail["code"] == "duplicate_candidate"
    assert detail["duplicate_candidate"]["job"]["id"] == first.json()["job"]["id"]

    second_payload["create_separately"] = True
    separate = client.post("/api/applications/manual", json=second_payload)
    assert separate.status_code == 201
    assert separate.json()["job"]["id"] != first.json()["job"]["id"]
    repo = JobRepository(db)
    assert len(repo.list_all_hub_jobs()) == 2
    repo.close()


def test_two_no_url_manual_actions_never_fuzzy_merge(tmp_path: Path) -> None:
    client, db = _client(tmp_path)
    first = client.post("/api/applications/manual", json=_payload())
    second = client.post("/api/applications/manual", json=_payload())
    assert first.status_code == second.status_code == 201
    assert first.json()["job"]["id"] != second.json()["job"]["id"]
    repo = JobRepository(db)
    assert len(repo.list_all_hub_jobs()) == 2
    repo.close()


def test_transaction_rolls_back_when_draft_insert_fails(tmp_path: Path) -> None:
    client, db = _client(tmp_path)
    repo = JobRepository(db)
    repo.close()
    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            CREATE TRIGGER fail_manual_draft
            BEFORE INSERT ON applications
            BEGIN
                SELECT RAISE(ABORT, 'forced application failure');
            END
            """
        )
    try:
        client.post("/api/applications/manual", json=_payload())
    except sqlite3.IntegrityError:
        pass
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM jobs_raw").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM applications").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM manual_application_requests").fetchone()[0] == 0


def test_collector_url_match_preserves_manual_identity_fields(tmp_path: Path) -> None:
    client, db = _client(tmp_path)
    created = client.post(
        "/api/applications/manual",
        json=_payload(
            title="My title",
            company="My company",
            location="My location",
            source_note="Why I saved it",
            market="cn",
            job_url="https://example.com/jobs/keep",
        ),
    ).json()
    repo = JobRepository(db)
    updated = repo.upsert_job(
        Job(
            source="linkedin",
            source_job_id="collector-1",
            canonical_url="https://example.com/jobs/keep",
            job_url="https://example.com/jobs/keep",
            title="Collector title",
            company="Collector company",
            location="Collector location",
            market="en",
            description="New JD",
        )
    )
    repo.close()
    assert updated.id == created["job"]["id"]
    assert (
        updated.title,
        updated.company,
        updated.location,
        updated.market,
        updated.source_note,
    ) == ("My title", "My company", "My location", "cn", "Why I saved it")
    assert updated.description == "New JD"
