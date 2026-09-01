"""Ingestion: mcp-jobs export → jobs_raw → jobs."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from typer.testing import CliRunner

from job_sentinel.api.app import create_app
from job_sentinel.core.models import JobEngagement
from job_sentinel.db.repository import JobRepository
from job_sentinel.ingestion.mcp_jobs import load_ingest_file, parse_ingest_payload
from job_sentinel.ingestion.normalize import (
    canonicalize_source,
    canonicalize_url,
    normalize_record,
    source_job_id_from_url,
)
from job_sentinel.ingestion.pipeline import ingest_records

_FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "mcp_jobs"
runner = CliRunner()


def test_source_aliases() -> None:
    assert canonicalize_source("zhipin-web") == "boss"
    assert canonicalize_source("liepin-official-mcp") == "liepin"
    assert canonicalize_source("zhaopin") == "zhaopin"


def test_canonical_url_strips_tracking() -> None:
    url = (
        "http://www.zhaopin.com/jobdetail/CC383625320J40878294709.htm"
        "?refcode=4019&srccode=401903&preactionid=abc&data_identity="
    )
    canon = canonicalize_url(url)
    assert "refcode" not in canon
    assert "CC383625320J40878294709.htm" in canon
    assert source_job_id_from_url("zhaopin", canon) == "CC383625320J40878294709"


def test_parse_all_three_mcp_exports() -> None:
    records = load_ingest_file(_FIXTURES)
    sources = {r.channel_key for r in records}
    assert sources == {"zhaopin", "boss", "liepin"}
    assert len(records) == 6


def test_full_path_and_repeat_does_not_duplicate(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        records = load_ingest_file(_FIXTURES / "zhaopin-raw.json")
        first = ingest_records(repo, records, run_id="run-1")
        assert first.raw_inserted == 2
        assert first.jobs_created == 2
        assert first.jobs_updated == 0
        assert repo._db["jobs"].count == 2
        assert repo._db["jobs_raw"].count == 2

        stored = repo.get_job_by_source_key("zhaopin", "CC383625320J40878294709")
        assert stored is not None
        assert stored.status is None
        assert stored.company == "北京三快在线科技有限公司"
        assert stored.salary == "面议"
        discovered = stored.discovered_at
        repo._db["jobs"].update(stored.id, {"engagement": "to_do", "match_score": 0.9})

        second = ingest_records(repo, records, run_id="run-2")
        assert second.raw_inserted == 2
        assert second.jobs_created == 0
        assert second.jobs_updated == 2
        assert repo._db["jobs"].count == 2
        assert repo._db["jobs_raw"].count == 4

        again = repo.get_hub_job(stored.id)
        assert again is not None
        assert again.engagement == JobEngagement.TO_DO
        assert again.match_score == pytest.approx(0.9)
        assert again.discovered_at == discovered
        assert again.last_seen_at >= discovered
    finally:
        repo.close()


def test_fingerprint_does_not_merge_across_sources(tmp_path: Path) -> None:
    payload = {
        "jobs": [
            {
                "source": "zhaopin",
                "title": "产品经理",
                "company": "美团",
                "address": "北京",
                "jobDetail": "https://www.zhaopin.com/jobdetail/AAA.htm",
            },
            {
                "source": "liepin",
                "title": "产品经理",
                "company": "美团",
                "address": "北京",
                "jobDetail": "https://www.liepin.com/job/111.shtml",
            },
        ]
    }
    records = parse_ingest_payload(payload)
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        result = ingest_records(repo, records)
        assert result.jobs_created == 2
        assert repo._db["jobs"].count == 2
    finally:
        repo.close()


def test_invalid_row_stays_in_jobs_raw(tmp_path: Path) -> None:
    records = parse_ingest_payload(
        {"channel_key": "zhaopin", "title": "", "source_url": "", "collected_at": "2026-08-25"}
    )
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        result = ingest_records(repo, records)
        assert result.raw_inserted == 1
        assert result.invalid == 1
        assert result.jobs_created == 0
        assert repo._db["jobs"].count == 0
        assert repo._db["jobs_raw"].count == 1
    finally:
        repo.close()


def test_mcp_search_rawjobs_shape(tmp_path: Path) -> None:
    payload = {
        "rawJobs": [
            {
                "source": "zhipin-web",
                "title": "用户研究",
                "company": "示例",
                "address": "北京",
                "salary": "20-30k",
                "jobDetail": "https://www.zhipin.com/job_detail/abc123.html",
                "jd": "<p>负责用户研究</p>",
            }
        ],
        "jobs": [],
    }
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        result = ingest_records(repo, parse_ingest_payload(payload))
        assert result.jobs_created == 1
        job = repo.get_job_by_source_key("boss", "abc123")
        assert job is not None
        assert "href" not in job.description
        assert job.salary == "20-30k"
    finally:
        repo.close()


def test_ingest_api(tmp_path: Path) -> None:
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "j.db"))
    rows = load_ingest_file(_FIXTURES / "liepin-raw.json")
    payload = {"records": [r.model_dump(mode="json") for r in rows]}
    resp = client.post("/api/ingest/jobs", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["jobs_created"] == 2
    assert body["raw_inserted"] == 2


def test_ingest_cli(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from job_sentinel import __main__ as main_module

    db_path = tmp_path / "jobs.db"
    monkeypatch.setattr(main_module, "_DEFAULT_DB", db_path)
    result = runner.invoke(main_module.app, ["ingest", str(_FIXTURES / "boss-raw.json")])
    assert result.exit_code == 0, result.output
    repo = JobRepository(db_path)
    try:
        assert repo._db["jobs"].count == 2
        job = repo.get_job_by_source_key("boss", "2ac3aefaa0efca3b0nJy3NS8EldY")
        assert job is not None
        assert job.title == "C端用户调研"
    finally:
        repo.close()


def test_normalize_sets_null_status() -> None:
    records = load_ingest_file(_FIXTURES / "liepin-raw.json")
    job = normalize_record(records[0])
    assert job.status is None
    assert job.match_score is None
    assert job.source == "liepin"
    assert job.source_job_id == "1985138523"
    assert job.discovered_at == datetime(2026, 8, 25, tzinfo=UTC)
