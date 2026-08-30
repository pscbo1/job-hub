"""Collect a company career page via the shared public ATS board client."""

from __future__ import annotations

from typing import TYPE_CHECKING

from job_sentinel.ingestion.adapters import (
    AdapterError,
    matches_query,
    parse_dt,
    query_blob,
    record,
)
from job_sentinel.ingestion.ats_board_client import (
    AtsFetchError,
    UnsupportedAtsError,
    fetch_ats_jobs,
    resolve_board,
)

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
    try:
        ats, slug = resolve_board(
            ats=spec.ats or "",
            slug=spec.slug or "",
            careers_url=spec.careers_url or "",
        )
        postings = fetch_ats_jobs(
            ats,
            slug,
            search_text=keywords,
            limit=max_results,
        )
    except UnsupportedAtsError as exc:
        raise AdapterError(f"{spec.id}: {exc}") from exc
    except (ValueError, AtsFetchError) as exc:
        raise AdapterError(f"{spec.id}: ats_board failed — {exc}") from exc

    company = (spec.company or "").strip() or slug
    out: list[CollectorRecord] = []
    for posting in postings:
        blob = query_blob(
            posting.title,
            company,
            posting.location,
            posting.description,
            posting.department,
        )
        if not matches_query(blob, keywords, location):
            continue
        native = posting.native_id
        apply_url = posting.apply_url
        out.append(
            record(
                spec_id=spec.id,
                market=spec.market,
                source_job_id=native or None,
                source_url=apply_url,
                application_url=apply_url,
                title=posting.title,
                company=company,
                location=posting.location,
                description=posting.description,
                published_at=parse_dt(posting.posted_at),
                raw={
                    "ats": ats,
                    "slug": slug,
                    "native_id": native,
                    **posting.extra,
                },
            )
        )
        if len(out) >= max_results:
            break
    return out
