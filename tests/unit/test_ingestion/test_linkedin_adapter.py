"""LinkedIn public guest adapter (respx; no live network)."""

from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest
import respx

from job_sentinel.core.models import JobStatus
from job_sentinel.db.repository import JobRepository
from job_sentinel.ingestion.adapters import AdapterError
from job_sentinel.ingestion.adapters.linkedin import (
    SEARCH_URL,
    collect_linkedin,
    extract_job_ids,
    job_id_from_view_url,
    search_query_params,
)
from job_sentinel.ingestion.collect import collect_and_ingest
from job_sentinel.ingestion.collect_sources import get_collect_source
from job_sentinel.ingestion.normalize import source_job_id_from_url

if TYPE_CHECKING:
    from pathlib import Path

_SEARCH = """
<li>
  <div class="base-card job-search-card" data-entity-urn="urn:li:jobPosting:1111111111"></div>
  <div class="base-card job-search-card" data-entity-urn="urn:li:jobPosting:2222222222"></div>
</li>
"""

_DETAIL_OK = """
<section>
  <h2 class="top-card-layout__title">Software Engineer</h2>
  <a class="topcard__org-name-link">Nuvo</a>
  <span class="topcard__flavor topcard__flavor--bullet">New York, NY</span>
  <div class="description__text">Build B2B payments infrastructure.</div>
  </div>
  <h3>Employment type</h3>
  <span>Full-time</span>
</section>
"""

_DETAIL_BARE = """
<section>
  <h2 class="top-card-layout__title">Backend Engineer</h2>
  <a class="topcard__org-name-link">Acme</a>
  <span class="topcard__flavor topcard__flavor--bullet">Remote</span>
  <div class="description__text">Python services.</div>
  </div>
</section>
"""


def test_extract_job_ids_ordered_unique() -> None:
    html = (
        'data-entity-urn="urn:li:jobPosting:1111111111" '
        'data-entity-urn="urn:li:jobPosting:1111111111" '
        'data-entity-urn="urn:li:jobPosting:2222222222"'
    )
    assert extract_job_ids(html) == ["1111111111", "2222222222"]


def test_search_query_params_maps_filters() -> None:
    params = search_query_params(
        keywords="engineer",
        location="United States",
        start=10,
        remote=True,
        date_posted_days=7,
    )
    assert params["keywords"] == "engineer"
    assert params["location"] == "United States"
    assert params["start"] == "10"
    assert params["f_WT"] == "2"
    assert params["f_TPR"] == "r604800"


def test_linkedin_id_from_view_url() -> None:
    url = "https://www.linkedin.com/jobs/view/software-engineer-at-nuvo-4378357766"
    assert job_id_from_view_url(url) == "4378357766"
    assert source_job_id_from_url("linkedin", url) == "4378357766"


@respx.mock
def test_linkedin_search_then_detail(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("job_sentinel.ingestion.adapters.linkedin.pause", lambda _s: None)
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, text=_SEARCH))
    respx.get("https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/1111111111").mock(
        return_value=httpx.Response(200, text=_DETAIL_OK)
    )
    respx.get("https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/2222222222").mock(
        return_value=httpx.Response(200, text=_DETAIL_BARE)
    )
    spec = get_collect_source("linkedin")
    assert spec is not None
    recs = collect_linkedin(spec, keywords="engineer", location="United States", max_results=2)
    assert len(recs) == 2
    assert recs[0].channel_key == "linkedin"
    assert recs[0].market == "en"
    assert recs[0].source_job_id == "1111111111"
    assert recs[0].source_url == "https://www.linkedin.com/jobs/view/1111111111"
    assert recs[0].title == "Software Engineer"
    assert recs[0].company == "Nuvo"
    assert recs[0].location == "New York, NY"
    assert "payments" in recs[0].description
    assert recs[0].raw_payload.get("employment_type") == "Full-time"


@respx.mock
def test_linkedin_sends_remote_and_date_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("job_sentinel.ingestion.adapters.linkedin.pause", lambda _s: None)
    route = respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, text="<li></li>"))
    spec = get_collect_source("linkedin")
    assert spec is not None
    recs = collect_linkedin(
        spec,
        keywords="engineer",
        location="Austin",
        max_results=5,
        remote=True,
        date_posted_days=1,
    )
    assert recs == []
    url = str(route.calls[0].request.url)
    assert "keywords=engineer" in url
    assert "location=Austin" in url
    assert "f_WT=2" in url
    assert "f_TPR=r86400" in url


@respx.mock
def test_linkedin_skips_failed_detail(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("job_sentinel.ingestion.adapters.linkedin.pause", lambda _s: None)
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, text=_SEARCH))
    respx.get("https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/1111111111").mock(
        return_value=httpx.Response(404, text="missing")
    )
    respx.get("https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/2222222222").mock(
        return_value=httpx.Response(200, text=_DETAIL_BARE)
    )
    spec = get_collect_source("linkedin")
    assert spec is not None
    recs = collect_linkedin(spec, keywords="engineer", location="", max_results=2)
    assert len(recs) == 1
    assert recs[0].source_job_id == "2222222222"


@respx.mock
def test_linkedin_search_block_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("job_sentinel.ingestion.adapters.linkedin.pause", lambda _s: None)
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, text="<html>authwall login</html>"))
    spec = get_collect_source("linkedin")
    assert spec is not None
    with pytest.raises(AdapterError, match="blocked"):
        collect_linkedin(spec, keywords="engineer", location="", max_results=2)


@respx.mock
def test_linkedin_ingest_uses_job_id_dedup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("job_sentinel.ingestion.adapters.linkedin.pause", lambda _s: None)
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, text=_SEARCH))
    respx.get("https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/1111111111").mock(
        return_value=httpx.Response(200, text=_DETAIL_OK)
    )
    respx.get("https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/2222222222").mock(
        return_value=httpx.Response(200, text=_DETAIL_BARE)
    )
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        first = collect_and_ingest(
            repo,
            keywords="engineer",
            location="United States",
            source_ids=["linkedin"],
            max_results=1,
        )
        assert first.status == "completed"
        assert first.jobs_created == 1
        assert first.raw_inserted == 1
        job = repo.get_job_by_source_key("linkedin", "1111111111")
        assert job is not None
        assert job.source == "linkedin"
        assert job.title == "Software Engineer"
        discovered = job.discovered_at

        second = collect_and_ingest(
            repo,
            keywords="engineer",
            location="United States",
            source_ids=["linkedin"],
            max_results=1,
        )
        assert second.jobs_created == 0
        assert second.jobs_updated == 1
        again = repo.get_hub_job(job.id)
        assert again is not None
        assert again.discovered_at == discovered
        assert again.status == JobStatus.UNDER_STUDY
    finally:
        repo.close()
