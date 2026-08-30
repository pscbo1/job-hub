"""Search/Collect: run mcp-jobs and HTTP adapters, then the existing ingest pipeline."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal

from loguru import logger
from pydantic import BaseModel, Field

from job_sentinel.ingestion.adapters import AdapterError
from job_sentinel.ingestion.adapters.run import collect_adapter_records
from job_sentinel.ingestion.collect_sources import resolve_collect_sources
from job_sentinel.ingestion.filters import (
    FilterSettings,
    reapply_filters,
    save_filter_settings,
)
from job_sentinel.ingestion.mcp_jobs import parse_ingest_payload
from job_sentinel.ingestion.mcp_jobs_runner import McpJobsCollectError, run_mcp_jobs_search
from job_sentinel.ingestion.pipeline import ingest_records
from job_sentinel.ingestion.search_capabilities import resolve_source_query, sanitize_overrides

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository
    from job_sentinel.ingestion.collect_sources import CollectSource
    from job_sentinel.ingestion.contract import CollectorRecord

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
    remote: bool | None = None,
    date_posted_days: int | None = None,
    market: str | None = None,
    source_overrides: dict[str, dict[str, Any]] | None = None,
) -> CollectOutcome:
    """Validate sources, collect records, ingest into jobs_raw then jobs."""
    started = datetime.now(tz=UTC)
    since = started.date().isoformat()
    capped = max(1, min(int(max_results), 200))
    try:
        specs = resolve_collect_sources(source_ids, market=market)
    except ValueError as exc:
        return CollectOutcome(
            status="failed",
            since=since,
            message=str(exc),
            errors=[str(exc)],
            max_results=capped,
        )

    keyword = keywords.strip()
    overrides = sanitize_overrides(source_overrides)
    if not keyword:
        return CollectOutcome(
            status="failed",
            since=since,
            message="Keywords are required",
            errors=["Keywords are required"],
            max_results=capped,
        )

    if filter_settings is not None:
        save_filter_settings(repo, filter_settings)

    records: list[CollectorRecord] = []
    source_results: list[dict[str, Any]] = []
    errors: list[str] = []

    mcp_specs = [s for s in specs if s.integration == "mcp_jobs"]
    other_specs = [s for s in specs if s.integration != "mcp_jobs"]

    if mcp_specs:
        _run_mcp_jobs(
            mcp_specs,
            keyword=keyword,
            location=location,
            capped=capped,
            records=records,
            source_results=source_results,
            errors=errors,
            remote=remote,
            date_posted_days=date_posted_days,
            source_overrides=overrides,
        )

    for spec in other_specs:
        _run_adapter(
            spec,
            keyword=keyword,
            location=location,
            capped=capped,
            records=records,
            source_results=source_results,
            errors=errors,
            remote=remote,
            date_posted_days=date_posted_days,
            source_overrides=overrides,
        )

    ingest = ingest_records(
        repo, records, run_id=run_id or f"collect-{started.strftime('%Y%m%dT%H%M%SZ')}"
    )
    reapply_filters(repo)

    errors.extend(err for err in ingest.errors if err not in errors)
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


def _run_mcp_jobs(
    specs: list[CollectSource],
    *,
    keyword: str,
    location: str,
    capped: int,
    records: list[CollectorRecord],
    source_results: list[dict[str, Any]],
    errors: list[str],
    remote: bool | None = None,
    date_posted_days: int | None = None,
    source_overrides: dict[str, dict[str, Any]] | None = None,
) -> None:
    for spec in specs:
        params, _dropped = resolve_source_query(
            spec.id,
            keywords=keyword,
            location=location,
            max_results=capped,
            remote=remote,
            date_posted_days=date_posted_days,
            source_overrides=source_overrides,
        )
        try:
            payload = run_mcp_jobs_search(
                keyword=str(params.get("keywords") or keyword),
                city=str(params.get("location") or ""),
                collector_ids=[spec.collector_id],
                max_jobs=int(params.get("max_results") or capped),
            )
        except McpJobsCollectError as exc:
            logger.warning("mcp-jobs collect failed for {}: {}", spec.id, exc)
            errors.append(str(exc))
            source_results.append(
                {"name": spec.id, "succeeded": False, "jobCount": 0, "errors": [str(exc)]}
            )
            continue

        source_results.extend(_source_results(payload))
        records.extend(parse_ingest_payload(payload))
        for extra in _failed_source_errors(_source_results(payload)):
            if extra not in errors:
                errors.append(extra)


def _run_adapter(
    spec: CollectSource,
    *,
    keyword: str,
    location: str,
    capped: int,
    records: list[CollectorRecord],
    source_results: list[dict[str, Any]],
    errors: list[str],
    remote: bool | None = None,
    date_posted_days: int | None = None,
    source_overrides: dict[str, dict[str, Any]] | None = None,
) -> None:
    params, _dropped = resolve_source_query(
        spec.id,
        keywords=keyword,
        location=location,
        max_results=capped,
        remote=remote,
        date_posted_days=date_posted_days,
        source_overrides=source_overrides,
    )
    adapter_kwargs: dict[str, Any] = {
        "keywords": str(params.get("keywords") or keyword),
        "location": str(params.get("location") or ""),
        "max_results": int(params.get("max_results") or capped),
    }
    if "remote" in params:
        adapter_kwargs["remote"] = params["remote"]
    if "date_posted_days" in params:
        adapter_kwargs["date_posted_days"] = params["date_posted_days"]
    try:
        found = collect_adapter_records(spec, **adapter_kwargs)
    except (AdapterError, ValueError) as exc:
        logger.warning("adapter {} failed: {}", spec.id, exc)
        msg = str(exc)
        errors.append(msg)
        source_results.append({"name": spec.id, "succeeded": False, "jobCount": 0, "errors": [msg]})
        return
    except Exception as exc:
        logger.warning("adapter {} failed: {}", spec.id, exc)
        msg = f"{spec.id}: {exc}"
        errors.append(msg)
        source_results.append({"name": spec.id, "succeeded": False, "jobCount": 0, "errors": [msg]})
        return

    records.extend(found)
    source_results.append({"name": spec.id, "succeeded": True, "jobCount": len(found)})


def _source_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw = payload.get("sources")
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, dict):
            out.append(item)
    return out


def _failed_source_errors(sources: list[dict[str, Any]]) -> list[str]:
    extra = _source_error_summary(sources)
    return [extra] if extra else []


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
