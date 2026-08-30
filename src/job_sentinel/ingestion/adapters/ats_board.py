"""Collect a company career page via the existing Greenhouse/Lever/Ashby helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from job_sentinel.ingestion.adapters import (
    AdapterError,
    matches_query,
    parse_dt,
    query_blob,
    record,
)
from job_sentinel.sources.company_boards import SUPPORTED_ATS, fetch_company_board

if TYPE_CHECKING:
    from job_sentinel.ingestion.collect_sources import CollectSource
    from job_sentinel.ingestion.contract import CollectorRecord


def collect_ats_board(
    spec: CollectSource,
    *,
    keywords: str,
    location: str,
    max_results: int,
) -> list[CollectorRecord]:
    ats = (spec.ats or "").strip().lower()
    slug = (spec.slug or "").strip()
    if ats not in SUPPORTED_ATS or not slug:
        raise AdapterError(f"{spec.id}: ats_board requires ats + slug")

    postings = fetch_company_board(ats, slug)
    company = (spec.company or "").strip() or slug
    out: list[CollectorRecord] = []
    for posting in postings:
        extra = posting.raw_data if isinstance(posting.raw_data, dict) else {}
        blob = query_blob(
            posting.title,
            company,
            posting.location,
            posting.description_snippet,
            posting.job_type,
        )
        if not matches_query(blob, keywords, location):
            continue
        native = posting.posting_id.split(":")[-1] if posting.posting_id else ""
        out.append(
            record(
                spec_id=spec.id,
                market=spec.market,
                source_job_id=native or None,
                source_url=posting.portal_url,
                title=posting.title,
                company=company,
                location=posting.location,
                description=posting.description_snippet,
                published_at=parse_dt(posting.posted_date),
                raw={
                    "ats": ats,
                    "slug": slug,
                    "native_id": native,
                    **extra,
                },
            )
        )
        if len(out) >= max_results:
            break
    return out
