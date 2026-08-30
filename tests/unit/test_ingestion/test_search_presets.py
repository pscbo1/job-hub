"""Search preset CRUD in SQLite meta (not jobs)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.db.repository import JobRepository
from job_sentinel.ingestion.search_presets import (
    SearchPresetPatch,
    SearchPresetWrite,
    create_preset,
    delete_preset,
    load_presets,
    update_preset,
)

if TYPE_CHECKING:
    from pathlib import Path


def _write(**kwargs: object) -> SearchPresetWrite:
    body: dict[str, object] = {
        "name": "UX LinkedIn",
        "market": "en",
        "sources": ["linkedin", "hiring_cafe"],
        "common_filters": {
            "keywords": "ux researcher",
            "location": "United States",
            "remote": True,
            "date_posted_days": 7,
            "max_results": 50,
        },
        "source_overrides": {"linkedin": {"remote": True}, "hiring_cafe": {"ignored": 1}},
    }
    body.update(kwargs)
    return SearchPresetWrite.model_validate(body)


def test_presets_are_market_scoped(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        create_preset(repo, _write(name="EN", market="en"))
        create_preset(
            repo,
            _write(
                name="CN Boss",
                market="cn",
                sources=["boss", "liepin"],
                common_filters={"keywords": "用户研究", "location": "北京", "max_results": 80},
                source_overrides={},
            ),
        )
        en = load_presets(repo, market="en")
        cn = load_presets(repo, market="cn")
        assert [p.name for p in en] == ["EN"]
        assert [p.name for p in cn] == ["CN Boss"]
        assert en[0].sources == ["linkedin", "hiring_cafe"]
        assert "hiring_cafe" not in cn[0].sources
    finally:
        repo.close()


def test_rename_update_delete(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        preset = create_preset(repo, _write())
        renamed = update_preset(repo, preset.id, SearchPresetPatch(name="UX US"))
        assert renamed is not None
        assert renamed.name == "UX US"
        assert renamed.common_filters.keywords == "ux researcher"
        updated = update_preset(
            repo,
            preset.id,
            SearchPresetPatch(
                sources=["linkedin"],
                common_filters=_write().common_filters.model_copy(
                    update={"keywords": "product designer", "max_results": 100}
                ),
            ),
        )
        assert updated is not None
        assert updated.sources == ["linkedin"]
        assert updated.common_filters.keywords == "product designer"
        assert "hiring_cafe" not in updated.source_overrides
        assert delete_preset(repo, preset.id) is True
        assert load_presets(repo, market="en") == []
        assert delete_preset(repo, preset.id) is False
    finally:
        repo.close()


def test_preset_api_isolation(tmp_path: Path) -> None:
    client = TestClient(create_app(profile_path=tmp_path / "p.yaml", db_path=tmp_path / "j.db"))
    en = client.post(
        "/api/search/presets",
        json={
            "name": "LI+HC",
            "market": "en",
            "sources": ["linkedin", "hiring_cafe"],
            "common_filters": {"keywords": "engineer", "max_results": 50},
        },
    )
    assert en.status_code == 200
    cn = client.post(
        "/api/search/presets",
        json={
            "name": "Boss",
            "market": "cn",
            "sources": ["boss"],
            "common_filters": {"keywords": "产品"},
        },
    )
    assert cn.status_code == 200
    en_list = client.get("/api/search/presets", params={"market": "en"}).json()["presets"]
    cn_list = client.get("/api/search/presets", params={"market": "cn"}).json()["presets"]
    assert [p["name"] for p in en_list] == ["LI+HC"]
    assert [p["name"] for p in cn_list] == ["Boss"]
    preset_id = en_list[0]["id"]
    renamed = client.patch(f"/api/search/presets/{preset_id}", json={"name": "Engineer US"})
    assert renamed.json()["name"] == "Engineer US"
    deleted = client.delete(f"/api/search/presets/{preset_id}")
    assert deleted.status_code == 200
    assert client.get("/api/search/presets", params={"market": "en"}).json()["presets"] == []
    assert client.delete(f"/api/search/presets/{preset_id}").status_code == 404
