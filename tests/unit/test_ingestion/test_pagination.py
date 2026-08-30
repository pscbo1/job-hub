"""Page range derived from per-source max_results."""

from __future__ import annotations

from job_sentinel.ingestion.mcp_jobs_runner import page_to_for_max_jobs


def test_page_to_requests_page_two_when_max_exceeds_one_page() -> None:
    assert page_to_for_max_jobs(15) == 1
    assert page_to_for_max_jobs(16) == 2
    assert page_to_for_max_jobs(40) == 3
    assert page_to_for_max_jobs(100) == 7
    assert page_to_for_max_jobs(200) == 14
