"""Adapt mcp-jobs export / MCP search payloads to CollectorRecord."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from job_sentinel.ingestion.contract import CollectorRecord
from job_sentinel.ingestion.normalize import canonicalize_source
from job_sentinel.markets import parse_source_market

if TYPE_CHECKING:
    from pathlib import Path

_UNIFIED_TITLE = "岗位"
_UNIFIED_COMPANY = "公司"
_UNIFIED_CITY = "城市"
_UNIFIED_URL = "职位链接"
_UNIFIED_JD = "原始JD"
_UNIFIED_SOURCE = "来源"
_UNIFIED_DATE = "抓取日期"


def parse_collected_at(value: object) -> datetime:
    """Parse mcp-jobs 抓取日期 (YYYY-MM-DD) or an ISO timestamp."""
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    text = str(value or "").strip()
    if not text:
        return datetime.now(tz=UTC)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = datetime.strptime(text[:10], "%Y-%m-%d")
        except ValueError:
            return datetime.now(tz=UTC)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def _as_str(value: object) -> str:
    return str(value).strip() if value is not None else ""


def _record_market(channel: str, raw: str = "", *, default: str = "") -> str:
    """Resolve source_market from payload, then the collect-source registry."""
    from job_sentinel.ingestion.collect_sources import get_collect_source

    parsed = parse_source_market(raw)
    if parsed is not None:
        return parsed
    spec = get_collect_source(channel)
    if spec is not None:
        return spec.market
    return default


def from_unified_row(row: dict[str, Any]) -> CollectorRecord | None:
    """One mcp-jobs ``writeSourceExports`` Chinese-key row."""
    source = (
        canonicalize_source(_as_str(row.get(_UNIFIED_SOURCE) or row.get("source"))) or "unknown"
    )
    title = _as_str(row.get(_UNIFIED_TITLE) or row.get("title"))
    url = _as_str(row.get(_UNIFIED_URL) or row.get("jobDetail"))
    return CollectorRecord(
        channel_key=source,
        market=_record_market(source, default="cn"),
        source_url=url,
        title=title,
        company=_as_str(row.get(_UNIFIED_COMPANY) or row.get("company")),
        location=_as_str(row.get(_UNIFIED_CITY) or row.get("address")),
        description=_as_str(row.get(_UNIFIED_JD) or row.get("jd") or row.get("description")),
        collected_at=parse_collected_at(row.get(_UNIFIED_DATE)),
        raw_payload=dict(row),
    )


def from_joblike(item: dict[str, Any]) -> CollectorRecord | None:
    """mcp-jobs MCP ``jobs`` / ``rawJobs`` object (title, company, jobDetail)."""
    source = canonicalize_source(_as_str(item.get("source") or item.get("channel_key")))
    title = _as_str(item.get("title") or item.get(_UNIFIED_TITLE))
    url = _as_str(
        item.get("jobDetail") or item.get("source_url") or item.get(_UNIFIED_URL) or item.get("url")
    )
    if not source and not title and not url:
        return None
    if not source:
        source = "unknown"
    return CollectorRecord(
        channel_key=source,
        market=_record_market(source, _as_str(item.get("market")), default="cn"),
        source_job_id=_as_str(item.get("source_job_id")) or None,
        source_url=url,
        application_url=_as_str(item.get("application_url")),
        title=title,
        company=_as_str(item.get("company") or item.get(_UNIFIED_COMPANY)),
        location=_as_str(item.get("address") or item.get("location") or item.get(_UNIFIED_CITY)),
        description=_as_str(
            item.get("jd")
            or item.get("jobDescription")
            or item.get("description")
            or item.get(_UNIFIED_JD)
        ),
        published_at=_optional_dt(item.get("published_at")),
        collected_at=parse_collected_at(item.get("collected_at") or item.get(_UNIFIED_DATE)),
        raw_payload=dict(item),
    )


def from_contract_dict(item: dict[str, Any]) -> CollectorRecord:
    payload = item.get("raw_payload")
    raw = dict(payload) if isinstance(payload, dict) else dict(item)
    channel = canonicalize_source(_as_str(item.get("channel_key") or item.get("source")))
    return CollectorRecord(
        channel_key=channel,
        market=_record_market(channel, _as_str(item.get("market"))),
        source_job_id=_as_str(item.get("source_job_id")) or None,
        source_url=_as_str(item.get("source_url") or item.get("jobDetail")),
        application_url=_as_str(item.get("application_url")),
        title=_as_str(item.get("title")),
        company=_as_str(item.get("company")),
        location=_as_str(item.get("location")),
        description=_as_str(item.get("description")),
        requirements=_as_str(item.get("requirements")) or None,
        published_at=_optional_dt(item.get("published_at")),
        collected_at=parse_collected_at(item.get("collected_at")),
        raw_payload=raw,
    )


def _optional_dt(value: object) -> datetime | None:
    if value is None or value == "":
        return None
    parsed = parse_collected_at(value)
    return parsed


def _from_object(item: object) -> CollectorRecord | None:
    if not isinstance(item, dict):
        return None
    if "channel_key" in item and "source_url" in item:
        try:
            return from_contract_dict(item)
        except Exception:
            return None
    if _UNIFIED_TITLE in item or _UNIFIED_URL in item:
        return from_unified_row(item)
    return from_joblike(item)


def parse_ingest_payload(payload: object) -> list[CollectorRecord]:
    """Accept mcp-jobs export, MCP search JSON, contract envelope, or a list."""
    if isinstance(payload, list):
        records: list[CollectorRecord] = []
        for item in payload:
            rec = _from_object(item)
            if rec is not None:
                records.append(rec)
        return records
    if not isinstance(payload, dict):
        return []
    if "records" in payload and isinstance(payload["records"], list):
        return parse_ingest_payload(payload["records"])
    if "rows" in payload and isinstance(payload["rows"], list):
        return parse_ingest_payload(payload["rows"])
    # Prefer rawJobs so hard-filtered items still land in jobs_raw.
    if "rawJobs" in payload and isinstance(payload["rawJobs"], list):
        return parse_ingest_payload(payload["rawJobs"])
    if "jobs" in payload and isinstance(payload["jobs"], list):
        return parse_ingest_payload(payload["jobs"])
    rec = _from_object(payload)
    return [rec] if rec is not None else []


def load_ingest_file(path: Path) -> list[CollectorRecord]:
    """Load JSON, JSONL, or a directory of mcp-jobs ``*-raw.json`` exports."""
    if path.is_dir():
        records: list[CollectorRecord] = []
        for child in sorted(path.glob("*-raw.json")):
            records.extend(load_ingest_file(child))
        if records:
            return records
        for child in sorted(path.glob("*.json")):
            records.extend(load_ingest_file(child))
        return records

    text = path.read_text(encoding="utf-8")
    suffix = path.suffix.lower()
    if suffix == ".jsonl":
        records = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            records.extend(parse_ingest_payload(json.loads(line)))
        return records
    return parse_ingest_payload(json.loads(text))
