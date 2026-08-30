"""Search/Collect: mcp-jobs CLI → ingest pipeline."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from typer.testing import CliRunner

from job_sentinel.api.app import create_app
from job_sentinel.db.repository import JobRepository
from job_sentinel.ingestion.collect import collect_and_ingest
from job_sentinel.ingestion.collect_sources import resolve_collect_sources
from job_sentinel.ingestion.mcp_jobs_runner import McpJobsCollectError, run_mcp_jobs_search

runner = CliRunner()


def test_resolve_known_sources() -> None:
    specs = resolve_collect_sources(["Zhaopin", "boss"])
    assert [s.id for s in specs] == ["zhaopin", "boss"]
    assert specs[1].collector_id == "boss"


def test_resolve_unknown_source() -> None:
    with pytest.raises(ValueError, match="Unknown"):
        resolve_collect_sources(["greenhouse"])


def test_collect_and_ingest_uses_payload(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "rawJobs": [
            {
                "source": "zhaopin",
                "title": "用户研究",
                "company": "示例",
                "address": "北京",
                "jobDetail": "https://www.zhaopin.com/jobdetail/CC123.htm",
            }
        ],
        "jobs": [],
        "sources": [{"name": "zhaopin", "succeeded": True, "jobCount": 1}],
        "anySucceeded": True,
        "allSucceeded": True,
    }

    def fake_run(**kwargs: Any) -> dict[str, Any]:
        assert kwargs["keyword"] == "用户研究"
        assert kwargs["city"] == "北京"
        assert kwargs["collector_ids"] == ["zhaopin"]
        return payload

    monkeypatch.setattr("job_sentinel.ingestion.collect.run_mcp_jobs_search", fake_run)
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        first = collect_and_ingest(
            repo, keywords="用户研究", location="北京", source_ids=["zhaopin"]
        )
        assert first.status == "completed"
        assert first.jobs_created == 1
        assert first.raw_inserted == 1
        assert repo._db["jobs"].count == 1
        stored = repo.get_job_by_source_key("zhaopin", "CC123")
        assert stored is not None
        assert stored.status is None
        discovered = stored.discovered_at

        second = collect_and_ingest(
            repo, keywords="用户研究", location="北京", source_ids=["zhaopin"]
        )
        assert second.jobs_created == 0
        assert second.jobs_updated == 1
        assert repo._db["jobs"].count == 1
        again = repo.get_hub_job(stored.id)
        assert again is not None
        assert again.discovered_at == discovered
        assert again.status is None
    finally:
        repo.close()


def test_collect_partial_when_one_source_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = {
        "rawJobs": [
            {
                "source": "zhaopin",
                "title": "A",
                "company": "C",
                "jobDetail": "https://www.zhaopin.com/jobdetail/AAA.htm",
            }
        ],
        "sources": [
            {"name": "zhaopin", "succeeded": True, "jobCount": 1},
            {"name": "liepin", "succeeded": False, "jobCount": 0, "errors": ["timeout"]},
        ],
    }
    monkeypatch.setattr(
        "job_sentinel.ingestion.collect.run_mcp_jobs_search",
        lambda **kwargs: payload,
    )
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        outcome = collect_and_ingest(
            repo, keywords="pm", location="", source_ids=["zhaopin", "liepin"]
        )
        assert outcome.status == "partial"
        assert outcome.jobs_created == 1
    finally:
        repo.close()


def test_collect_failed_when_runner_errors(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(**kwargs: Any) -> dict[str, Any]:
        raise McpJobsCollectError("mcp-jobs collect exited 1")

    monkeypatch.setattr("job_sentinel.ingestion.collect.run_mcp_jobs_search", boom)
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        outcome = collect_and_ingest(repo, keywords="x", location="", source_ids=["zhaopin"])
        assert outcome.status == "failed"
        assert outcome.jobs_created == 0
    finally:
        repo.close()


def test_collect_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "rawJobs": [
            {
                "source": "liepin",
                "title": "PM",
                "company": "X",
                "jobDetail": "https://www.liepin.com/job/111.shtml",
            }
        ],
        "sources": [{"name": "liepin", "succeeded": True, "jobCount": 1}],
    }
    monkeypatch.setattr(
        "job_sentinel.ingestion.collect.run_mcp_jobs_search",
        lambda **kwargs: payload,
    )
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "j.db"))
    listed = client.get("/api/collect/sources")
    assert listed.status_code == 200
    ids = {s["id"] for s in listed.json()["sources"]}
    assert ids == {"zhaopin", "liepin", "boss"}

    resp = client.post(
        "/api/collect/jobs",
        json={"keywords": "产品", "location": "上海", "sources": ["liepin"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["jobs_created"] == 1

    jobs = client.get("/api/jobs").json()
    assert len(jobs) == 1
    assert jobs[0]["source"] == "liepin"
    assert jobs[0]["status"] is None


def test_collect_api_rejects_empty_keywords(tmp_path: Path) -> None:
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "j.db"))
    resp = client.post("/api/collect/jobs", json={"keywords": "  ", "sources": ["zhaopin"]})
    assert resp.status_code == 422


def test_runner_argv(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path / "mcp-jobs"
    (root / "scripts").mkdir(parents=True)
    (root / "dist").mkdir()
    (root / "scripts" / "collect-json.js").write_text("/* stub */", encoding="utf-8")
    (root / "dist" / "index.js").write_text("module.exports = {}", encoding="utf-8")
    captured: dict[str, Any] = {}

    def fake_run(argv: list[str], **kwargs: Any) -> Any:
        captured["argv"] = argv
        out = Path(argv[argv.index("--out") + 1])
        out.write_text('{"rawJobs":[],"sources":[],"anySucceeded":true}', encoding="utf-8")

        class Result:
            returncode = 0
            stderr = ""
            stdout = ""

        return Result()

    monkeypatch.setattr("job_sentinel.ingestion.mcp_jobs_runner.subprocess.run", fake_run)
    payload = run_mcp_jobs_search(
        keyword="用户研究",
        city="北京",
        collector_ids=["zhaopin"],
        mcp_jobs_root=root,
        node="node",
        timeout_seconds=30,
        page_from=1,
        page_to=1,
        max_jobs=10,
    )
    argv = captured["argv"]
    assert argv[0] == "node"
    assert "--keyword" in argv and "用户研究" in argv
    assert "--city" in argv and "北京" in argv
    assert "--sources" in argv and argv[argv.index("--sources") + 1] == "zhaopin"
    assert payload["anySucceeded"] is True


def test_collect_cli(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from job_sentinel import __main__ as main_module

    payload = {
        "rawJobs": [
            {
                "source": "zhaopin",
                "title": "R",
                "company": "C",
                "jobDetail": "https://www.zhaopin.com/jobdetail/ZZ.htm",
            }
        ],
        "sources": [{"name": "zhaopin", "succeeded": True, "jobCount": 1}],
    }
    monkeypatch.setattr(main_module, "_DEFAULT_DB", tmp_path / "jobs.db")
    monkeypatch.setattr(
        "job_sentinel.ingestion.collect.run_mcp_jobs_search",
        lambda **kwargs: payload,
    )
    result = runner.invoke(
        main_module.app,
        ["collect", "--keywords", "用户研究", "--location", "北京", "--sources", "zhaopin"],
    )
    assert result.exit_code == 0, result.output
    assert "created=1" in result.output
