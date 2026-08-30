"""
sources/company_boards.py
──────────────────────────
Follow specific employers via their public ATS job boards.

Supported ATS platforms (no auth, publicly accessible):
  - Greenhouse: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
  - Lever:      https://api.lever.co/v0/postings/{slug}?mode=json
  - Ashby:      https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true

New companies for Job Hub collect belong in ingestion/company_ats.yaml.
This module remains the CLI / JobSource wrapper around the shared client.

Usage — standalone helper:
    from job_sentinel.sources.company_boards import fetch_company_board
    jobs = fetch_company_board(ats="greenhouse", slug="stripe")

Usage — as a JobSource (searches all followed companies in one call):
    source = CompanyBoardSource(followed=[("greenhouse","stripe"), ("lever","linear")])
    results = source.search(query)
"""

from __future__ import annotations

from typing import Any

from loguru import logger

from job_sentinel.ingestion.ats_board_client import (
    SUPPORTED_ATS,
    AtsFetchError,
    AtsJob,
    UnsupportedAtsError,
    fetch_ats_jobs,
    log_fetch_failure,
)
from job_sentinel.sources.base import JobPosting, JobQuery, JobSource

__all__ = ["SUPPORTED_ATS", "CompanyBoardSource", "fetch_company_board"]


def _to_posting(job: AtsJob) -> JobPosting:
    from job_sentinel.core.models import ApplicationStatus

    snippet = job.description[:350] if job.description else ""
    raw: dict[str, Any] = dict(job.extra)
    return JobPosting(
        posting_id=f"company_board:{job.ats}:{job.slug}:{job.native_id}",
        title=job.title or "Untitled Position",
        employer=job.company or "",
        location=job.location or "",
        job_type=job.department or "",
        posted_date=job.posted_at or "",
        deadline="",
        description_snippet=snippet,
        portal_url=job.apply_url or "",
        status=ApplicationStatus.NEW,
        source_adapter="company_board",
        raw_data=raw,
    )


def fetch_company_board(ats: str, slug: str) -> list[JobPosting]:
    """
    Fetch job postings directly from a company's public ATS board.

    Parameters
    ----------
    ats:
        One of "greenhouse", "lever", or "ashby".
    slug:
        The company slug as used on the ATS (e.g. "stripe", "linear").

    Returns
    -------
    list[JobPosting]
        All current openings from that company's board.

    Raises
    ------
    ValueError
        If *ats* is not one of the supported platforms.
    """
    try:
        jobs = fetch_ats_jobs(ats, slug)
    except UnsupportedAtsError as exc:
        raise ValueError(str(exc)) from exc
    except (ValueError, AtsFetchError) as exc:
        if isinstance(exc, ValueError) and "Need a supported ATS" in str(exc):
            msg = f"Unsupported ATS: {ats.strip().lower()!r}. Supported: {sorted(SUPPORTED_ATS)}"
            raise ValueError(msg) from exc
        log_fetch_failure(ats, slug, exc)
        return []
    return [_to_posting(job) for job in jobs]


class CompanyBoardSource(JobSource):
    """
    Search a predefined list of followed companies via their ATS boards.

    Pass ``followed`` as a list of (ats, slug) tuples, e.g.
    [("greenhouse", "stripe"), ("lever", "linear")].
    """

    SOURCE_ID = "company_board"
    LABEL = "Company ATS Boards"
    requires_key = False
    is_scraper = False
    default_enabled = False
    homepage = "https://github.com/harshitwandhare/job-sentinel"

    def __init__(self, followed: list[tuple[str, str]] | None = None) -> None:
        self._followed = followed or []

    def search(self, query: JobQuery) -> list[JobPosting]:
        results: list[JobPosting] = []
        kw = query.keywords.lower()

        for ats, slug in self._followed:
            try:
                jobs = fetch_company_board(ats, slug)
            except (ValueError, RuntimeError) as exc:
                logger.warning("company_boards: skipping {}/{} — {}", ats, slug, exc)
                continue

            for job in jobs:
                if kw:
                    haystack = f"{job.title} {job.employer} {job.description_snippet}".lower()
                    if kw not in haystack:
                        continue
                results.append(job)
                if len(results) >= query.limit:
                    return results

        return results
