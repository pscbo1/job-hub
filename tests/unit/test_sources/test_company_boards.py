"""Tests for company_boards — greenhouse/lever/ashby parsing via respx."""

from __future__ import annotations

import httpx
import pytest
import respx

from job_sentinel.sources.company_boards import SUPPORTED_ATS, fetch_company_board

_GREENHOUSE_PAYLOAD = {
    "jobs": [
        {
            "id": 4001,
            "title": "Staff Engineer",
            "absolute_url": "https://boards.greenhouse.io/stripe/jobs/4001",
            "location": {"name": "San Francisco, CA"},
            "departments": [{"name": "Engineering"}],
            "updated_at": "2026-06-05T12:00:00Z",
            "content": "We build payments infrastructure.",
        }
    ]
}

_LEVER_PAYLOAD = [
    {
        "id": "lever-abc",
        "text": "Frontend Engineer",
        "hostedUrl": "https://jobs.lever.co/linear/lever-abc",
        "categories": {"location": "Remote", "team": "Product"},
        "createdAt": 1717200000,
        "descriptionPlain": "Build the Linear web app.",
    }
]

_ASHBY_PAYLOAD = {
    "jobPostings": [
        {
            "id": "ashby-xyz",
            "title": "Backend Engineer",
            "jobPostingUrl": "https://jobs.ashbyhq.com/notion/ashby-xyz",
            "locationName": "New York",
            "employmentType": "FullTime",
            "publishedDate": "2026-06-08",
            "descriptionPlain": "Build Notion's backend.",
            "isRemote": False,
            "compensation": {
                "minValue": 150000,
                "maxValue": 200000,
                "currency": "USD",
                "interval": "yearly",
            },
        }
    ]
}


@respx.mock
def test_greenhouse_parsing() -> None:
    respx.get("https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true").mock(
        return_value=httpx.Response(200, json=_GREENHOUSE_PAYLOAD)
    )

    jobs = fetch_company_board("greenhouse", "stripe")

    assert len(jobs) == 1
    job = jobs[0]
    assert "greenhouse" in job.posting_id
    assert job.title == "Staff Engineer"
    assert job.location == "San Francisco, CA"
    assert job.job_type == "Engineering"
    assert job.raw_data.get("ats") == "greenhouse"


@respx.mock
def test_lever_parsing() -> None:
    respx.get("https://api.lever.co/v0/postings/linear?mode=json").mock(
        return_value=httpx.Response(200, json=_LEVER_PAYLOAD)
    )

    jobs = fetch_company_board("lever", "linear")

    assert len(jobs) == 1
    job = jobs[0]
    assert "lever" in job.posting_id
    assert job.title == "Frontend Engineer"
    assert job.location == "Remote"
    assert job.raw_data.get("ats") == "lever"


@respx.mock
def test_ashby_parsing() -> None:
    respx.get("https://api.ashbyhq.com/posting-api/job-board/notion?includeCompensation=true").mock(
        return_value=httpx.Response(200, json=_ASHBY_PAYLOAD)
    )

    jobs = fetch_company_board("ashby", "notion")

    assert len(jobs) == 1
    job = jobs[0]
    assert "ashby" in job.posting_id
    assert job.title == "Backend Engineer"
    assert "150,000" in job.raw_data.get("salary_text", "")
    assert job.raw_data.get("ats") == "ashby"


@respx.mock
def test_workday_parsing() -> None:
    ext = "/job/Remote/Role_R-9"
    respx.post("https://redhat.wd5.myworkdayjobs.com/wday/cxs/redhat/Jobs/jobs").mock(
        return_value=httpx.Response(
            200,
            json={
                "total": 1,
                "jobPostings": [
                    {
                        "title": "Software Engineer",
                        "externalPath": ext,
                        "locationsText": "Remote",
                        "bulletFields": ["R-9"],
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
                    "title": "Software Engineer",
                    "location": "Remote",
                    "jobReqId": "R-9",
                    "jobDescription": "<p>Build Linux products.</p>",
                    "externalUrl": f"https://redhat.wd5.myworkdayjobs.com/Jobs{ext}",
                }
            },
        )
    )
    jobs = fetch_company_board("workday", "redhat.wd5.myworkdayjobs.com/Jobs")
    assert len(jobs) == 1
    assert jobs[0].title == "Software Engineer"
    assert jobs[0].raw_data.get("ats") == "workday"


def test_unsupported_ats_raises() -> None:
    with pytest.raises(ValueError, match="Unsupported ATS"):
        fetch_company_board("unknown", "slug")


@respx.mock
def test_fetch_handles_http_error_gracefully() -> None:
    respx.get("https://boards-api.greenhouse.io/v1/boards/badco/jobs?content=true").mock(
        return_value=httpx.Response(404)
    )

    jobs = fetch_company_board("greenhouse", "badco")
    assert jobs == []


def test_supported_ats_constants() -> None:
    assert "greenhouse" in SUPPORTED_ATS
    assert "lever" in SUPPORTED_ATS
    assert "ashby" in SUPPORTED_ATS
    assert "workday" in SUPPORTED_ATS
