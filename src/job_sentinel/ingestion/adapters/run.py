"""Run the adapter for one CollectSource. mcp-jobs stays in collect.py."""

from __future__ import annotations

from typing import TYPE_CHECKING

from job_sentinel.ingestion.adapters import AdapterError
from job_sentinel.ingestion.adapters.ats_board import collect_ats_board
from job_sentinel.ingestion.adapters.hiring_cafe import collect_hiring_cafe
from job_sentinel.ingestion.adapters.impactpool import collect_impactpool
from job_sentinel.ingestion.adapters.linkedin import collect_linkedin
from job_sentinel.ingestion.adapters.tencent import collect_tencent

if TYPE_CHECKING:
    from job_sentinel.ingestion.collect_sources import CollectSource
    from job_sentinel.ingestion.contract import CollectorRecord


def collect_adapter_records(
    spec: CollectSource,
    *,
    keywords: str,
    location: str,
    max_results: int,
    remote: bool | None = None,
    date_posted_days: int | None = None,
) -> list[CollectorRecord]:
    if spec.integration == "ats_board":
        return collect_ats_board(
            spec, keywords=keywords, location=location, max_results=max_results
        )
    if spec.integration == "http_json" and spec.id == "tencent":
        return collect_tencent(spec, keywords=keywords, location=location, max_results=max_results)
    if spec.integration == "public_html" and spec.id == "impactpool":
        return collect_impactpool(
            spec, keywords=keywords, location=location, max_results=max_results
        )
    if spec.integration == "public_html" and spec.id == "linkedin":
        return collect_linkedin(
            spec,
            keywords=keywords,
            location=location,
            max_results=max_results,
            remote=remote,
            date_posted_days=date_posted_days,
        )
    if spec.integration == "ssr_json" and spec.id == "hiring_cafe":
        return collect_hiring_cafe(
            spec, keywords=keywords, location=location, max_results=max_results
        )
    raise AdapterError(f"No adapter wired for {spec.id} ({spec.integration})")
