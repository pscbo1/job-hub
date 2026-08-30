"""Market id mapping, source_market config, and view grouping."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
import yaml
from pydantic import ValidationError

from job_sentinel.ingestion.collect_sources import (
    CollectSource,
    list_collect_sources,
    load_company_ats_sources,
    resolve_collect_sources,
)
from job_sentinel.markets import (
    job_in_view,
    parse_market_id,
    parse_source_market,
    source_in_view,
    stored_values_for,
)

if TYPE_CHECKING:
    from pathlib import Path


def test_parse_source_market() -> None:
    assert parse_source_market("cn") == "cn"
    assert parse_source_market("CN") == "cn"
    assert parse_source_market("en") == "en"
    assert parse_source_market("GLOBAL") == "global"
    assert parse_source_market("") is None
    assert parse_source_market("jp") is None


def test_parse_market_id_maps_global_to_en() -> None:
    assert parse_market_id("cn") == "cn"
    assert parse_market_id("en") == "en"
    assert parse_market_id("GLOBAL") == "en"
    assert parse_market_id("global") == "en"
    assert parse_market_id("jp") is None


def test_builtin_source_market_mapping() -> None:
    by_id = {s.id: s.market for s in list_collect_sources(enabled_only=False)}
    assert by_id["zhaopin"] == "cn"
    assert by_id["linkedin"] == "en"
    assert by_id["dimagi"] == "global"


def test_cn_view_lists_cn_sources_only() -> None:
    ids = {s.id for s in list_collect_sources(market="cn")}
    assert "zhaopin" in ids
    assert "tencent" in ids
    assert "dimagi" not in ids
    assert "linkedin" not in ids


def test_en_view_lists_en_and_global_sources() -> None:
    ids = {s.id for s in list_collect_sources(market="en")}
    assert "linkedin" in ids
    assert "dimagi" in ids
    assert "zhaopin" not in ids


def test_global_alias_uses_en_view() -> None:
    ids = {s.id for s in list_collect_sources(market="global")}
    assert "dimagi" in ids
    assert "linkedin" in ids
    assert "zhaopin" not in ids


def test_resolve_rejects_cross_market_sources() -> None:
    with pytest.raises(ValueError, match="not in market"):
        resolve_collect_sources(["zhaopin"], market="en")
    with pytest.raises(ValueError, match="not in market"):
        resolve_collect_sources(["palantir"], market="cn")
    specs = resolve_collect_sources(["palantir"], market="en")
    assert [s.id for s in specs] == ["palantir"]


def test_collect_source_requires_market() -> None:
    with pytest.raises(ValidationError):
        CollectSource(id="x", label="X", kind="platform", collector_id="x")


def test_company_ats_requires_market(tmp_path: Path) -> None:
    path = tmp_path / "company_ats.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "companies": [
                    {
                        "id": "acme",
                        "company": "Acme",
                        "careers_url": "https://jobs.lever.co/acme",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="market is required"):
        load_company_ats_sources(path)


def test_jobs_assigned_by_source_not_country() -> None:
    assert job_in_view(source_market="global", country="CN", view="cn") is False
    assert job_in_view(source_market="global", country="CN", view="en") is True
    assert source_in_view("global", "cn") is False
    assert source_in_view("global", "en") is True


def test_stored_values() -> None:
    assert "CN" in stored_values_for("cn")
    assert "GLOBAL" in stored_values_for("en")
