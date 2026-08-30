"""Search/Collect: run mcp-jobs, then the existing ingest pipeline."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, Field

from job_sentinel.ingestion.collect_sources import resolve_collect_sources
from job_sentinel.ingestion.filters import (
    FilterSettings,
    reapply_filters,
    save_filter_settings,
)
from job_sentinel.ingestion.mcp_jobs import parse_ingest_payload
from job_sentinel.ingestion.mcp_jobs_runner import McpJobsCollectError, run_mcp_jobs_search
from job_sentinel.ingestion.pipeline import ingest_records

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository

CollectStatus = Literal["completed", "failed", "partial"]


class CollectOutcome(BaseModel):
    status: CollectStatus
    jobs_created: int = 0
    jobs_updated: int = 0
    raw_inserted: int = 0
    invalid: int = 0
    excluded: int = 0
    source_results: list[dict[str, Any]] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    since: str = ""
    message: str = ""
    max_results: int = 100


def collect_and_ingest(
    repo: JobRepository,
    *,
    keywords: str,
    location: str,
    source_ids: list[str],
    run_id: str | None = None,
    max_results: int = 100,
    filter_settings: FilterSettings | None = None,
) -> CollectOutcome:
    """Validate sources, call mcp-jobs, ingest rawJobs into jobs_raw then jobs."""
    started = datetime.now(tz=UTC)
    since = started.date().isoformat()
    capped = max(1, min(int(max_results), 200))
    try:
        specs = resolve_collect_sources(source_ids)
    except ValueError as exc:
        return CollectOutcome(
            status="failed",
            since=since,
            message=str(exc),
            errors=[str(exc)],
            max_results=capped,
        )

    keyword = keywords.strip()
    if not keyword:
        return CollectOutcome(
            status="failed",
            since=since,
            message="Keywords are required",
            errors=["Keywords are required"],
            max_results=capped,
        )

    kinds = {spec.kind for spec in specs}
    unsupported = kinds - {"platform"}
    if unsupported:
        msg = (
            "No collector wired for source kind(s): "
            + ", ".join(sorted(unsupported))
            + ". V0 only runs mcp-jobs platforms."
        )
        return CollectOutcome(
            status="failed", since=since, message=msg, errors=[msg], max_results=capped
        )

    if filter_settings is not None:
        save_filter_settings(repo, filter_settings)

    try:
        payload = run_mcp_jobs_search(
            keyword=keyword,
            city=location,
            collector_ids=[spec.collector_id for spec in specs],
            max_jobs=capped,
        )
    except McpJobsCollectError as exc:
        return CollectOutcome(
            status="failed",
            since=since,
            message=str(exc),
            errors=[str(exc)],
            max_results=capped,
        )

    source_results = _source_results(payload)
    records = parse_ingest_payload(payload)
    ingest = ingest_records(
        repo, records, run_id=run_id or f"collect-{started.strftime('%Y%m%dT%H%M%SZ')}"
    )
    reapply_filters(repo)

    errors = list(ingest.errors)
    any_ok = bool(source_results) and any(bool(s.get("succeeded")) for s in source_results)
    all_ok = bool(source_results) and all(bool(s.get("succeeded")) for s in source_results)
    if not source_results:
        any_ok = bool(records)
        all_ok = any_ok

    if not any_ok and ingest.raw_inserted == 0:
        status: CollectStatus = "failed"
        message = "Collection failed"
        if source_results:
            message = _source_error_summary(source_results) or message
    elif any_ok and not all_ok:
        status = "partial"
        message = "Collection finished with some source failures"
    else:
        status = "completed"
        message = "Collection completed"

    for src in source_results:
        if src.get("succeeded"):
            continue
        extra = _source_error_summary([src])
        if extra and extra not in errors:
            errors.append(extra)

    return CollectOutcome(
        status=status,
        jobs_created=ingest.jobs_created,
        jobs_updated=ingest.jobs_updated,
        raw_inserted=ingest.raw_inserted,
        invalid=ingest.invalid,
        excluded=ingest.excluded,
        source_results=source_results,
        errors=errors,
        since=since,
        message=message,
        max_results=capped,
    )


def _source_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw = payload.get("sources")
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, dict):
            out.append(item)
    return out


def _source_error_summary(sources: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for item in sources:
        name = str(item.get("name") or "source")
        errs = item.get("errors")
        if item.get("succeeded"):
            continue
        if isinstance(errs, list) and errs:
            parts.append(f"{name}: {'; '.join(str(e) for e in errs)}")
        else:
            parts.append(f"{name}: failed")
    return "; ".join(parts)
