"""HTTP collect adapters → CollectorRecord (respx, no live network)."""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from job_sentinel.ingestion.adapters import AdapterError
from job_sentinel.ingestion.adapters.ats_board import collect_ats_board
from job_sentinel.ingestion.adapters.hiring_cafe import collect_hiring_cafe
from job_sentinel.ingestion.adapters.impactpool import collect_impactpool
from job_sentinel.ingestion.adapters.tencent import collect_tencent
from job_sentinel.ingestion.collect_sources import get_collect_source

_GH = {
    "jobs": [
        {
            "id": 8141380,
            "title": "Software Engineer",
            "absolute_url": "https://job-boards.greenhouse.io/dimagi/jobs/8141380",
            "location": {"name": "Cambridge, MA"},
            "departments": [{"name": "Engineering"}],
            "updated_at": "2026-08-01T12:00:00Z",
            "content": "CommCare platform engineering.",
        }
    ]
}

_TENCENT = {
    "Code": 200,
    "Data": {
        "Count": 1,
        "Posts": [
            {
                "PostId": "2078307645432971264",
                "RecruitPostId": 121284,
                "RecruitPostName": "SSV-产品经理",
                "LocationName": "深圳",
                "BGName": "CSIG",
                "Responsibility": "可持续社会价值产品。",
                "LastUpdateTime": "2026-08-20",
                "PostURL": "http://careers.tencent.com/jobdesc.html?postId=2078307645432971264",
            }
        ],
    },
}

_HOME_HTML = """
<div class='jobs-grid'>
  <a href="/jobs/1233861">Latest</a>
</div>
"""

_JOB_HTML = """
<html><head><title>Call for Experts | The Pandemic Fund</title></head>
<body><h1>Call for Experts</h1><p>Duty station</p><p>Washington, D.C.</p></body></html>
"""

_NEXT = {
    "props": {
        "pageProps": {
            "ssrHits": [
                {
                    "id": "gh___acme___99",
                    "apply_url": "https://job-boards.greenhouse.io/acme/jobs/99",
                    "job_information": {"title": "User Researcher"},
                    "v5_processed_job_data": {
                        "company_name": "Acme",
                        "workplace_cities": ["Remote"],
                        "estimated_publish_date_millis": 1720000000000,
                    },
                }
            ]
        }
    }
}


def test_registry_runnable_ids() -> None:
    from job_sentinel.ingestion.collect_sources import list_collect_sources

    ids = {s.id for s in list_collect_sources()}
    assert {
        "zhaopin",
        "liepin",
        "boss",
        "impactpool",
        "dimagi",
        "automattic",
        "palantir",
        "redhat",
        "tencent",
        "hiring_cafe",
    } <= ids
    assert "linkedin" in ids
    assert "fao" not in ids


@respx.mock
def test_ats_board_maps_greenhouse() -> None:
    respx.get("https://boards-api.greenhouse.io/v1/boards/dimagi/jobs?content=true").mock(
        return_value=httpx.Response(200, json=_GH)
    )
    spec = get_collect_source("dimagi")
    assert spec is not None
    recs = collect_ats_board(spec, keywords="engineer", location="", max_results=10)
    assert len(recs) == 1
    rec = recs[0]
    assert rec.channel_key == "dimagi"
    assert rec.market == "global"
    assert rec.source_job_id == "8141380"
    assert rec.source_url.endswith("/8141380")
    assert rec.company == "Dimagi"
    assert rec.title == "Software Engineer"
    assert rec.description == "CommCare platform engineering."
    assert rec.application_url.endswith("/8141380")


@respx.mock
def test_ats_board_maps_lever() -> None:
    respx.get("https://api.lever.co/v0/postings/palantir?mode=json").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": "lever-1",
                    "text": "Product Engineer",
                    "hostedUrl": "https://jobs.lever.co/palantir/lever-1",
                    "categories": {"location": "Remote", "team": "Product"},
                    "createdAt": 1717200000000,
                    "descriptionPlain": "Build issue tracking for teams.",
                }
            ],
        )
    )
    spec = get_collect_source("palantir")
    assert spec is not None
    recs = collect_ats_board(spec, keywords="engineer", location="", max_results=10)
    assert len(recs) == 1
    rec = recs[0]
    assert rec.channel_key == "palantir"
    assert rec.company == "Palantir"
    assert rec.source_job_id == "lever-1"
    assert rec.source_url == "https://jobs.lever.co/palantir/lever-1"
    assert rec.location == "Remote"
    assert "issue tracking" in rec.description


@respx.mock
def test_ats_board_http_error_is_adapter_error() -> None:
    respx.get("https://boards-api.greenhouse.io/v1/boards/dimagi/jobs?content=true").mock(
        return_value=httpx.Response(503)
    )
    spec = get_collect_source("dimagi")
    assert spec is not None
    with pytest.raises(AdapterError, match="ats_board failed"):
        collect_ats_board(spec, keywords="engineer", location="", max_results=10)


@respx.mock
def test_ats_board_keyword_filter() -> None:
    respx.get("https://boards-api.greenhouse.io/v1/boards/dimagi/jobs?content=true").mock(
        return_value=httpx.Response(200, json=_GH)
    )
    spec = get_collect_source("dimagi")
    assert spec is not None
    recs = collect_ats_board(spec, keywords="intern chef", location="", max_results=10)
    assert recs == []


@respx.mock
def test_ats_board_maps_workday() -> None:
    ext = "/job/Remote-US-NC/Platform-Engineer_R-1"
    respx.post("https://redhat.wd5.myworkdayjobs.com/wday/cxs/redhat/Jobs/jobs").mock(
        return_value=httpx.Response(
            200,
            json={
                "total": 1,
                "jobPostings": [
                    {
                        "title": "Platform Engineer",
                        "externalPath": ext,
                        "locationsText": "Remote US NC",
                        "bulletFields": ["R-1"],
                    }
                ],
            },
        )
    )
    respx.get(f"https://redhat.wd5.myworkdayjobs.com/wday/cxs/redhat/Jobs{ext}").mock(
        return_value=httpx.Response(
            200,
            json={
                "jobPostingInfo": {
                    "title": "Platform Engineer",
                    "location": "Remote US NC",
                    "jobReqId": "R-1",
                    "startDate": "2026-08-01",
                    "jobDescription": "<p>Linux platform engineering for partners.</p>",
                    "externalUrl": f"https://redhat.wd5.myworkdayjobs.com/Jobs{ext}",
                }
            },
        )
    )
    spec = get_collect_source("redhat")
    assert spec is not None
    recs = collect_ats_board(spec, keywords="engineer", location="", max_results=10)
    assert len(recs) == 1
    rec = recs[0]
    assert rec.channel_key == "redhat"
    assert rec.company == "Red Hat"
    assert rec.source_job_id == "R-1"
    assert rec.location == "Remote US NC"
    assert rec.source_url.endswith("/Platform-Engineer_R-1")
    assert "Linux platform" in rec.description


@respx.mock
def test_tencent_public_query() -> None:
    respx.get("https://careers.tencent.com/tencentcareer/api/post/Query").mock(
        return_value=httpx.Response(200, json=_TENCENT)
    )
    spec = get_collect_source("tencent")
    assert spec is not None
    recs = collect_tencent(spec, keywords="SSV", location="", max_results=10)
    assert len(recs) == 1
    assert recs[0].channel_key == "tencent"
    assert recs[0].source_job_id == "2078307645432971264"
    assert "jobdesc.html" in recs[0].source_url
    assert recs[0].company == "Tencent"


@respx.mock
def test_impactpool_homepage_and_detail() -> None:
    respx.get("https://www.impactpool.org/").mock(return_value=httpx.Response(200, text=_HOME_HTML))
    respx.get("https://www.impactpool.org/jobs/1233861").mock(
        return_value=httpx.Response(200, text=_JOB_HTML)
    )
    spec = get_collect_source("impactpool")
    assert spec is not None
    recs = collect_impactpool(spec, keywords="experts", location="", max_results=5)
    assert len(recs) == 1
    assert recs[0].source_url == "https://www.impactpool.org/jobs/1233861"
    assert recs[0].company == "The Pandemic Fund"


@respx.mock
def test_hiring_cafe_ssr_island() -> None:
    html = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(_NEXT)}</script>'
    respx.get("https://hiring.cafe/").mock(return_value=httpx.Response(200, text=html))
    spec = get_collect_source("hiring_cafe")
    assert spec is not None
    recs = collect_hiring_cafe(spec, keywords="researcher", location="", max_results=5)
    assert len(recs) == 1
    assert recs[0].source_url.startswith("https://job-boards.greenhouse.io/")
    assert recs[0].title == "User Researcher"
