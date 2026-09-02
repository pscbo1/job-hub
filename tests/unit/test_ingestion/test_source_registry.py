"""Company Sources: YAML seed once, then Collect reads source_registry."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.db.repository import JobRepository
from job_sentinel.ingestion.collect_sources import list_collect_sources, resolve_collect_sources
from job_sentinel.ingestion.source_registry import (
    create_company_source,
    list_company_sources,
    seed_source_registry,
    update_company_source,
)

if TYPE_CHECKING:
    from pathlib import Path


def test_seed_preserves_yaml_ids(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        seed_source_registry(repo)
        ids = {row.id for row in list_company_sources(repo)}
        assert "dimagi" in ids
        assert "palantir" in ids
        assert "tencent" in ids
        dimagi = next(row for row in list_company_sources(repo) if row.id == "dimagi")
        assert dimagi.collect_en is True
        assert dimagi.collect_cn is False
        assert dimagi.include_in_run is False
        tencent = next(row for row in list_company_sources(repo) if row.id == "tencent")
        assert tencent.collect_cn is True
        assert tencent.runnable is True
    finally:
        repo.close()


def test_seed_is_once_and_new_companies_are_db_only(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        seed_source_registry(repo)
        create_company_source(
            repo,
            company="Acme Labs",
            collect_en=True,
            careers_url="https://jobs.lever.co/acme",
            tags=["research"],
            note="Product research team",
        )
        seed_source_registry(repo)
        rows = list_company_sources(repo)
        assert sum(1 for row in rows if row.company == "Acme Labs") == 1
        acme = next(row for row in rows if row.id.startswith("acme"))
        assert acme.runnable is True
        assert acme.tags == ["research"]
        listed = list_collect_sources(repo=repo, enabled_only=True, market="en")
        assert any(spec.id == acme.id for spec in listed)
    finally:
        repo.close()


def test_disabled_company_is_not_collectable(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        update_company_source(repo, "dimagi", enabled=False, include_in_run=True)
        listed = {s.id for s in list_collect_sources(repo=repo, enabled_only=True)}
        assert "dimagi" not in listed
        try:
            resolve_collect_sources(["dimagi"], repo=repo)
            raised = False
        except ValueError as exc:
            raised = True
            assert "Unknown" in str(exc)
        assert raised
        all_rows = list_company_sources(repo)
        assert any(row.id == "dimagi" and not row.enabled for row in all_rows)
    finally:
        repo.close()


def test_company_sources_api_and_collect_catalog(tmp_path: Path) -> None:
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "j.db"))
    listed = client.get("/api/company-sources")
    assert listed.status_code == 200
    body = listed.json()
    ids = {row["id"] for row in body["sources"]}
    assert "dimagi" in ids
    assert "ats" not in body["sources"][0]
    created = client.post(
        "/api/company-sources",
        json={
            "company": "Nava",
            "collect_en": True,
            "include_in_run": True,
            "tags": ["civic"],
            "note": "Public interest tech",
            "careers_url": "https://jobs.lever.co/nava",
        },
    )
    assert created.status_code == 200
    nava_id = created.json()["id"]
    patched = client.patch(
        f"/api/company-sources/{nava_id}",
        json={"enabled": False, "include_in_run": False},
    )
    assert patched.status_code == 200
    assert patched.json()["enabled"] is False
    collect = client.get("/api/collect/sources", params={"market": "en"})
    collect_ids = {row["id"] for row in collect.json()["sources"]}
    assert nava_id not in collect_ids
    assert "dimagi" in collect_ids
    assert "zhaopin" not in collect_ids


def test_verticals_share_registry_table_and_skip_collect(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        seed_source_registry(repo)
        registry_ids = {row.id for row in repo.list_source_registry()}
        assert "impactpool" not in registry_ids
        wechat = create_company_source(
            repo,
            company="Research Circle",
            kind="wechat",
            handle="research_jobs",
            tags=["research"],
            note="Directory only",
            include_in_run=True,
            enabled=True,
        )
        assert wechat.kind == "wechat"
        stored = repo.get_company_source(wechat.id)
        assert stored is not None
        assert stored.kind == "wechat"
        listed = list_company_sources(repo)
        assert wechat.id in {row.id for row in listed}
        assert {row.kind for row in listed} >= {"company", "wechat"}
        wechat_only = list_company_sources(repo, kind="wechat")
        assert [row.id for row in wechat_only] == [wechat.id]
        tagged = list_company_sources(repo, tag="research")
        assert wechat.id in {row.id for row in tagged}
        collect_ids = {spec.id for spec in list_collect_sources(repo=repo, enabled_only=False)}
        assert wechat.id not in collect_ids
        assert "impactpool" in collect_ids
        resolved = resolve_collect_sources(["dimagi", wechat.id], repo=repo)
        assert {spec.id for spec in resolved} == {"dimagi"}
    finally:
        repo.close()

    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "api.db"))
    created = client.post(
        "/api/company-sources",
        json={
            "company": "Research Circle",
            "kind": "wechat",
            "handle": "research_jobs",
            "tags": ["research"],
            "note": "Directory only",
            "enabled": True,
            "include_in_run": True,
        },
    )
    assert created.status_code == 200
    body = created.json()
    assert body["kind"] == "wechat"
    assert body["type"] == "wechat"
    assert body["name"] == "Research Circle"
    channel_id = body["id"]
    listed = client.get("/api/company-sources")
    ids = {row["id"] for row in listed.json()["sources"]}
    assert "dimagi" in ids
    assert channel_id in ids
    wechat = client.get("/api/company-sources", params={"kind": "wechat"})
    assert {row["id"] for row in wechat.json()["sources"]} == {channel_id}
    assert all(row["kind"] == "wechat" for row in wechat.json()["sources"])
    patched = client.patch(
        f"/api/company-sources/{channel_id}",
        json={"include_in_run": False, "note": "Still listed"},
    )
    assert patched.status_code == 200
    assert patched.json()["kind"] == "wechat"
    assert patched.json()["include_in_run"] is False
    collect = client.get("/api/collect/sources")
    collect_ids = {row["id"] for row in collect.json()["sources"]}
    assert channel_id not in collect_ids
    assert "impactpool" in collect_ids
    missing = client.post("/api/company-sources", json={"company": "   ", "kind": "wechat"})
    assert missing.status_code == 400
    bad_type = client.post("/api/company-sources", json={"company": "Nope", "kind": "telegram"})
    assert bad_type.status_code == 400
    via_alias = client.post(
        "/api/vertical-channels",
        json={"name": "Civic Discord", "channel_type": "community", "enabled": True},
    )
    assert via_alias.status_code == 200
    assert via_alias.json()["kind"] == "community"
    all_ids = {row["id"] for row in client.get("/api/company-sources").json()["sources"]}
    assert via_alias.json()["id"] in all_ids
