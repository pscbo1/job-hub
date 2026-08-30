"""
Tests for the local HTTP API (FastAPI TestClient — no server needed).

Every test injects temp profile/DB paths into ``create_app`` so the user's real
``data/`` files are never touched.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.core.models import JobPosting
from job_sentinel.db.repository import JobRepository

if TYPE_CHECKING:
    from pathlib import Path


def _client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(profile_path=tmp_path / "profile.yaml", db_path=tmp_path / "j.db"))


def _seed_db(tmp_path: Path, *jobs: JobPosting) -> Path:
    db = tmp_path / "j.db"
    repo = JobRepository(db)
    for j in jobs:
        repo.save_job(j)
    repo.close()
    return db


def test_health(tmp_path: Path) -> None:
    resp = _client(tmp_path).get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_profile_empty_by_default(tmp_path: Path) -> None:
    resp = _client(tmp_path).get("/api/profile")
    assert resp.status_code == 200
    assert resp.json()["basics"]["name"] == ""


def test_put_then_get_profile_round_trips(tmp_path: Path) -> None:
    client = _client(tmp_path)
    payload = {
        "basics": {"name": "Ada Lovelace", "summary": "Engineer"},
        "experience": [{"company": "Analytical", "role": "Engineer", "bullets": ["built it"]}],
    }
    put = client.put("/api/profile", json=payload)
    assert put.status_code == 200
    got = client.get("/api/profile").json()
    assert got["basics"]["name"] == "Ada Lovelace"
    assert got["experience"][0]["company"] == "Analytical"
    # And the summary reflects it.
    assert client.get("/api/profile/summary").json()["experience"] == 1


def test_jobs_empty_without_db(tmp_path: Path) -> None:
    resp = _client(tmp_path).get("/api/jobs")
    assert resp.status_code == 200
    assert resp.json() == []


def test_jobs_listed_and_status_updated(tmp_path: Path) -> None:
    from job_sentinel.core.models import Job, JobStatus
    from job_sentinel.db.repository import JobRepository

    db = tmp_path / "j.db"
    repo = JobRepository(db)
    stored = repo.upsert_job(
        Job(source="zhaopin", source_job_id="CC1", title="SWE", company="ACME", location="Beijing")
    )
    repo.close()
    client = _client(tmp_path)

    jobs = client.get("/api/jobs").json()
    assert any(j["id"] == stored.id for j in jobs)
    assert jobs[0]["status"] is None

    upd = client.patch(f"/api/jobs/{stored.id}", json={"status": "applied"})
    assert upd.status_code == 200
    assert upd.json()["status"] == JobStatus.APPLIED.value

    again = client.get("/api/jobs").json()
    assert again[0]["status"] == "applied"

    cleared = client.patch(f"/api/jobs/{stored.id}", json={"status": None})
    assert cleared.status_code == 200
    assert cleared.json()["status"] is None

    bad = client.patch(f"/api/jobs/{stored.id}", json={"status": "under_study"})
    assert bad.status_code == 422

    missing = client.patch("/api/jobs/ghost", json={"status": "saved"})
    assert missing.status_code == 404


def test_jobs_since_filter(tmp_path: Path) -> None:
    from datetime import UTC, datetime

    from job_sentinel.core.models import Job
    from job_sentinel.db.repository import JobRepository

    repo = JobRepository(tmp_path / "j.db")
    repo.upsert_job(
        Job(
            source="zhaopin",
            source_job_id="old",
            title="Old",
            discovered_at=datetime(2026, 8, 1, tzinfo=UTC),
        )
    )
    repo.upsert_job(
        Job(
            source="zhaopin",
            source_job_id="new",
            title="New",
            discovered_at=datetime(2026, 8, 25, tzinfo=UTC),
        )
    )
    repo.close()
    client = _client(tmp_path)
    assert len(client.get("/api/jobs").json()) == 2
    filtered = client.get("/api/jobs", params={"since": "2026-08-20"}).json()
    assert [j["source_job_id"] for j in filtered] == ["new"]
    assert client.get("/api/jobs", params={"since": "not-a-date"}).status_code == 422


def test_legacy_posting_status_still_works(tmp_path: Path) -> None:
    _seed_db(tmp_path, JobPosting(posting_id="job-9", title="SWE", employer="ACME"))
    client = _client(tmp_path)
    upd = client.post("/api/jobs/job-9/status", json={"status": "applied"})
    assert upd.status_code == 200
    assert upd.json()["status"] == "applied"
    assert client.get("/api/jobs").json() == []


def test_tailor_reports_coverage(tmp_path: Path) -> None:
    resp = _client(tmp_path).post("/api/resume/tailor", json={"job_description": "python react"})
    assert resp.status_code == 200
    body = resp.json()
    assert 0.0 <= body["score"] <= 1.0
    assert "missing_keywords" in body


def test_tailor_requires_non_empty(tmp_path: Path) -> None:
    assert (
        _client(tmp_path).post("/api/resume/tailor", json={"job_description": ""}).status_code
        == 422
    )


def test_build_rejects_empty_profile(tmp_path: Path) -> None:
    resp = _client(tmp_path).post("/api/resume/build", json={})
    assert resp.status_code == 400


def test_cover_rejects_empty_profile(tmp_path: Path) -> None:
    assert _client(tmp_path).post("/api/resume/cover", json={}).status_code == 400


def test_cover_with_profile_returns_pdf_or_503(tmp_path: Path) -> None:
    client = _client(tmp_path)
    client.put("/api/profile", json={"basics": {"name": "Ada", "summary": "Engineer."}})
    resp = client.post("/api/resume/cover", json={"role": "RA", "company": "UTD"})
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        assert resp.headers["content-type"] == "application/pdf"


def test_build_with_profile_returns_pdf_or_503(tmp_path: Path) -> None:
    client = _client(tmp_path)
    client.put(
        "/api/profile",
        json={"basics": {"name": "Ada"}, "skills": [{"category": "L", "skills": ["Python"]}]},
    )
    resp = client.post("/api/resume/build", json={})
    # 200 (PDF) if Tectonic is installed, 503 (with install hint) if not.
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        assert resp.headers["content-type"] == "application/pdf"


def test_filter_settings_round_trip_and_hide_jobs(tmp_path: Path) -> None:
    from job_sentinel.core.models import Job
    from job_sentinel.db.repository import JobRepository

    repo = JobRepository(tmp_path / "j.db")
    intern = repo.upsert_job(Job(source="zhaopin", source_job_id="i1", title="产品实习"))
    repo.close()
    client = _client(tmp_path)
    defaults = client.get("/api/filters").json()
    assert defaults["exclude_internship"] is True
    applied = client.put("/api/filters", json={**defaults, "apply": True}).json()
    assert applied["reapplied"]["excluded"] == 1
    assert client.get("/api/jobs").json() == []
    hidden = client.get("/api/jobs", params={"filter_state": "excluded"}).json()
    assert hidden[0]["id"] == intern.id
    assert hidden[0]["filter_reasons"] == ["internship"]
    cleared = client.put(
        "/api/filters",
        json={**defaults, "exclude_internship": False, "apply": True},
    ).json()
    assert cleared["reapplied"]["included"] == 1
    visible = client.get("/api/jobs").json()
    assert visible[0]["id"] == intern.id
    assert visible[0]["status"] is None


def test_dismiss_and_undismiss_hub_job(tmp_path: Path) -> None:
    from job_sentinel.core.models import Job, JobRaw, JobStatus
    from job_sentinel.db.repository import JobRepository

    repo = JobRepository(tmp_path / "j.db")
    job = repo.upsert_job(
        Job(
            source="zhaopin",
            source_job_id="d1",
            title="产品经理",
            company="示例",
            status=JobStatus.SAVED,
        )
    )
    repo.insert_job_raw(JobRaw(source="zhaopin", source_job_id="d1", job_id=job.id))
    repo.close()
    client = _client(tmp_path)
    gone = client.post(f"/api/jobs/{job.id}/dismiss")
    assert gone.status_code == 200
    body = gone.json()
    assert body["filter_state"] == "excluded"
    assert "manual_dismiss" in body["filter_reasons"]
    assert body["status"] == "saved"
    assert client.get("/api/jobs").json() == []
    hidden = client.get("/api/jobs", params={"filter_state": "excluded"}).json()
    assert hidden[0]["id"] == job.id
    back = client.post(f"/api/jobs/{job.id}/undismiss")
    assert back.status_code == 200
    assert back.json()["filter_state"] == "included"
    assert back.json()["status"] == "saved"
    visible = client.get("/api/jobs").json()
    assert visible[0]["id"] == job.id


def test_jobs_market_country_and_no_cross_market_leak(tmp_path: Path) -> None:
    from job_sentinel.core.models import Job
    from job_sentinel.db.repository import JobRepository

    repo = JobRepository(tmp_path / "j.db")
    repo.upsert_job(
        Job(
            source="zhaopin",
            source_job_id="cn1",
            title="后端",
            location="北京",
            market="CN",
        )
    )
    repo.upsert_job(
        Job(
            source="linkedin",
            source_job_id="uk1",
            title="SWE",
            location="London, UK",
            market="GLOBAL",
        )
    )
    repo.upsert_job(
        Job(
            source="linkedin",
            source_job_id="us1",
            title="SWE US",
            location="United States",
            market="GLOBAL",
        )
    )
    repo.upsert_job(
        Job(
            source="linkedin",
            source_job_id="rem1",
            title="Remote unknown",
            location="Remote",
            market="GLOBAL",
        )
    )
    repo.upsert_job(
        Job(
            source="palantir",
            source_job_id="p-cn",
            title="FE China",
            location="Beijing, China",
            market="global",
        )
    )
    repo.upsert_job(
        Job(
            source="palantir",
            source_job_id="p-uk",
            title="FE UK",
            location="London, UK",
            market="global",
        )
    )
    repo.close()
    client = _client(tmp_path)

    cn = client.get("/api/jobs", params={"market": "cn"}).json()
    assert {j["source_job_id"] for j in cn} == {"cn1"}
    en = client.get("/api/jobs", params={"market": "en"}).json()
    assert {j["source_job_id"] for j in en} == {"uk1", "us1", "rem1", "p-cn", "p-uk"}

    uk = client.get("/api/jobs", params={"market": "en", "country": "GB"}).json()
    assert {j["source_job_id"] for j in uk} == {"uk1", "p-uk"}
    unknown = client.get("/api/jobs", params={"market": "en", "country": "XX"}).json()
    assert {j["source_job_id"] for j in unknown} == {"rem1"}
    us = client.get("/api/jobs", params={"market": "en", "country": "US"}).json()
    assert {j["source_job_id"] for j in us} == {"us1"}
    china = client.get("/api/jobs", params={"market": "en", "country": "CN"}).json()
    assert {j["source_job_id"] for j in china} == {"p-cn"}
    assert client.get("/api/jobs", params={"market": "jp"}).status_code == 422

    repo = JobRepository(tmp_path / "j.db")
    repo.upsert_job(Job(source="zhaopin", source_job_id="legacy", title="旧", market=""))
    repo.close()
    legacy_cn = client.get("/api/jobs", params={"market": "cn"}).json()
    assert "legacy" in {j["source_job_id"] for j in legacy_cn}
    legacy_en = client.get("/api/jobs", params={"market": "en"}).json()
    assert "legacy" not in {j["source_job_id"] for j in legacy_en}


def test_collect_sources_market_query(tmp_path: Path) -> None:
    client = _client(tmp_path)
    cn_ids = {
        s["id"]
        for s in client.get("/api/collect/sources", params={"market": "cn"}).json()["sources"]
    }
    en_ids = {
        s["id"]
        for s in client.get("/api/collect/sources", params={"market": "en"}).json()["sources"]
    }
    assert "zhaopin" in cn_ids
    assert "dimagi" not in cn_ids
    assert "linkedin" not in cn_ids
    assert "linkedin" in en_ids
    assert "dimagi" in en_ids
    assert "zhaopin" not in en_ids
    global_ids = {
        s["id"]
        for s in client.get("/api/collect/sources", params={"market": "global"}).json()["sources"]
    }
    assert "dimagi" in global_ids
    assert "linkedin" in global_ids
    assert "zhaopin" not in global_ids
    assert client.get("/api/collect/sources", params={"market": "jp"}).status_code == 422
