"""Shared ATS board identity + Greenhouse/Lever/Ashby parsing (respx)."""

from __future__ import annotations

import httpx
import pytest
import respx
import yaml

from job_sentinel.ingestion.ats_board_client import (
    SUPPORTED_ATS,
    AtsFetchError,
    UnsupportedAtsError,
    fetch_ats_jobs,
    parse_careers_url,
    resolve_board,
)
from job_sentinel.ingestion.collect_sources import load_company_ats_sources


def test_parse_greenhouse_and_lever_urls() -> None:
    assert parse_careers_url("https://job-boards.greenhouse.io/dimagi/jobs/1") == (
        "greenhouse",
        "dimagi",
    )
    assert parse_careers_url("https://boards.greenhouse.io/embed/job_board?for=Stripe") == (
        "greenhouse",
        "stripe",
    )
    assert parse_careers_url("https://jobs.lever.co/linear/abc-123") == ("lever", "linear")
    assert parse_careers_url("https://jobs.ashbyhq.com/notion") == ("ashby", "notion")


def test_parse_taleo_url_is_detected_not_fetched() -> None:
    assert parse_careers_url("https://fao.taleo.net/careersection/fao_external/jobsearch.ftl") == (
        "taleo",
        "fao",
    )
    with pytest.raises(UnsupportedAtsError, match="no public job-board API"):
        resolve_board(careers_url="https://acme.taleo.net/careersection/ex/jobsearch.ftl")


def test_resolve_board_from_url_only() -> None:
    assert resolve_board(careers_url="https://jobs.lever.co/linear") == ("lever", "linear")


def test_unsupported_ats_constant() -> None:
    assert "greenhouse" in SUPPORTED_ATS
    assert "taleo" not in SUPPORTED_ATS


@respx.mock
def test_fetch_ats_jobs_keeps_full_greenhouse_html() -> None:
    body = "<p>" + ("CommCare platform. " * 40) + "</p>"
    respx.get("https://boards-api.greenhouse.io/v1/boards/dimagi/jobs?content=true").mock(
        return_value=httpx.Response(
            200,
            json={
                "jobs": [
                    {
                        "id": 9,
                        "title": "Research Engineer",
                        "absolute_url": "https://job-boards.greenhouse.io/dimagi/jobs/9",
                        "location": {"name": "Cambridge, MA"},
                        "departments": [{"name": "Engineering"}],
                        "updated_at": "2026-08-01T12:00:00Z",
                        "content": body,
                    }
                ]
            },
        )
    )
    jobs = fetch_ats_jobs("greenhouse", "dimagi")
    assert len(jobs) == 1
    assert jobs[0].title == "Research Engineer"
    assert "CommCare platform." in jobs[0].description
    assert len(jobs[0].description) > 350


@respx.mock
def test_fetch_ats_jobs_raises_on_http_error() -> None:
    respx.get("https://boards-api.greenhouse.io/v1/boards/badco/jobs?content=true").mock(
        return_value=httpx.Response(404)
    )
    with pytest.raises(AtsFetchError):
        fetch_ats_jobs("greenhouse", "badco")


def test_load_company_ats_yaml_tmp(tmp_path) -> None:
    path = tmp_path / "company_ats.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "companies": [
                    {
                        "id": "acme",
                        "company": "Acme",
                        "careers_url": "https://jobs.lever.co/acme",
                        "market": "GLOBAL",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    specs = load_company_ats_sources(path)
    assert len(specs) == 1
    assert specs[0].id == "acme"
    assert specs[0].integration == "ats_board"
    assert specs[0].ats == "lever"
    assert specs[0].slug == "acme"
    assert specs[0].company == "Acme"


def test_load_company_ats_rejects_taleo(tmp_path) -> None:
    path = tmp_path / "company_ats.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "companies": [
                    {
                        "id": "fao",
                        "company": "FAO",
                        "careers_url": "https://fao.taleo.net/careersection/ex/jobsearch.ftl",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="no public job-board API"):
        load_company_ats_sources(path)
