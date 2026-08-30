"""Source search capabilities and per-adapter query resolution."""

from __future__ import annotations

from job_sentinel.ingestion.search_capabilities import (
    capabilities_for,
    ordered_search_fields,
    resolve_source_query,
    sanitize_overrides,
)


def test_linkedin_has_remote_and_posted() -> None:
    assert "remote" in capabilities_for("linkedin")
    assert "date_posted_days" in capabilities_for("linkedin")
    assert ordered_search_fields("linkedin") == [
        "keywords",
        "location",
        "remote",
        "date_posted_days",
        "max_results",
    ]


def test_hiring_cafe_and_cn_platforms_omit_linkedin_filters() -> None:
    for sid in ("hiring_cafe", "boss", "liepin", "zhaopin"):
        caps = capabilities_for(sid)
        assert "remote" not in caps
        assert "date_posted_days" not in caps
        assert {"keywords", "location", "max_results"} <= caps


def test_unknown_source_uses_default_fields() -> None:
    assert capabilities_for("dimagi") == {"keywords", "location", "max_results"}


def test_resolve_drops_unsupported_common_filters() -> None:
    params, dropped = resolve_source_query(
        "hiring_cafe",
        keywords="ux",
        location="Remote",
        max_results=50,
        remote=True,
        date_posted_days=7,
    )
    assert params["keywords"] == "ux"
    assert params["location"] == "Remote"
    assert "remote" not in params
    assert "date_posted_days" not in params
    assert "remote" in dropped
    assert "date_posted_days" in dropped


def test_resolve_keeps_linkedin_common_filters() -> None:
    params, dropped = resolve_source_query(
        "linkedin",
        keywords="ux",
        location="United States",
        max_results=50,
        remote=True,
        date_posted_days=7,
    )
    assert params["remote"] is True
    assert params["date_posted_days"] == 7
    assert dropped == []


def test_overrides_only_apply_to_that_source() -> None:
    overrides = {
        "linkedin": {"remote": True, "gone": "stale"},
        "hiring_cafe": {"remote": True},
    }
    li, li_drop = resolve_source_query(
        "linkedin",
        keywords="ux",
        location="",
        max_results=50,
        source_overrides=overrides,
    )
    cafe, cafe_drop = resolve_source_query(
        "hiring_cafe",
        keywords="ux",
        location="",
        max_results=50,
        source_overrides=overrides,
    )
    assert li["remote"] is True
    assert "linkedin.gone" in li_drop
    assert "remote" not in cafe
    assert "hiring_cafe.remote" in cafe_drop


def test_stale_override_does_not_raise() -> None:
    params, dropped = resolve_source_query(
        "boss",
        keywords="产品",
        location="北京",
        max_results=20,
        source_overrides={"boss": {"salary_min": 30000, "keywords": "产品经理"}},
    )
    assert params["keywords"] == "产品经理"
    assert "boss.salary_min" in dropped


def test_sanitize_overrides_drops_non_primitives() -> None:
    cleaned = sanitize_overrides(
        {
            "linkedin": {"remote": True, "nested": {"x": 1}, "ok": "us"},
            1: {"a": 1},
        }
    )
    assert cleaned == {"linkedin": {"remote": True, "ok": "us"}}
