"""Collect Jobs source_group metadata on the registry and API."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.ingestion.collect_sources import list_collect_sources

if TYPE_CHECKING:
    from pathlib import Path


def test_listed_sources_have_groups_and_omit_unrunnable() -> None:
    listed = list_collect_sources()
    ids = {s.id for s in listed}
    assert "linkedin" in ids
    assert "fao" not in ids
    by_group: dict[str, list[str]] = {}
    for spec in listed:
        assert spec.source_group in {"platform", "vertical", "company_careers"}
        by_group.setdefault(spec.source_group or "", []).append(spec.id)
    assert "zhaopin" in by_group["platform"]
    assert "liepin" in by_group["platform"]
    assert "boss" in by_group["platform"]


def test_collect_sources_api_includes_source_group(tmp_path: Path) -> None:
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "j.db"))
    listed = client.get("/api/collect/sources")
    assert listed.status_code == 200
    sources = listed.json()["sources"]
    assert sources
    for item in sources:
        assert item["source_group"] in {"platform", "vertical", "company_careers"}
        assert item.get("runnable") is not False
        assert item.get("search_fields")
    by_id = {s["id"]: s for s in sources}
    assert "remote" in by_id["linkedin"]["search_fields"]
    assert "date_posted_days" in by_id["linkedin"]["search_fields"]
    if "hiring_cafe" in by_id:
        assert "remote" not in by_id["hiring_cafe"]["search_fields"]
    groups = {s["id"]: s["source_group"] for s in sources}
    assert groups["zhaopin"] == "platform"
    assert groups["linkedin"] == "platform"
    if "impactpool" in groups:
        assert groups["impactpool"] == "vertical"
    if "dimagi" in groups:
        assert groups["dimagi"] == "company_careers"
    if "hiring_cafe" in groups:
        assert groups["hiring_cafe"] == "platform"
