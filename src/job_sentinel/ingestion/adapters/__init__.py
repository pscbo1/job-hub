"""Helpers for collect adapters that emit CollectorRecord."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx

from job_sentinel.ingestion.contract import CollectorRecord

USER_AGENT = "JobHub/0.1 (+local collector; personal use)"


class AdapterError(Exception):
    """One source failed; other sources in the same collect run continue."""


def http_client(timeout: float = 20.0) -> httpx.Client:
    return httpx.Client(
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json, text/html"},
    )


def query_blob(*parts: object) -> str:
    return " ".join(str(p or "") for p in parts)


def matches_query(blob: str, keywords: str, location: str = "") -> bool:
    hay = blob.casefold()
    for token in keywords.casefold().split():
        if token and token not in hay:
            return False
    loc = location.strip().casefold()
    return not loc or loc in hay


def parse_dt(value: object) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, (int, float)):
        ts = float(value)
        if ts > 10_000_000_000:
            ts /= 1000.0
        try:
            return datetime.fromtimestamp(ts, tz=UTC)
        except (ValueError, OSError, OverflowError):
            return None
    text = str(value).strip()
    if not text:
        return None
    if text.isdigit() and len(text) >= 10:
        try:
            ts = int(text[:13])
            if ts > 10_000_000_000:
                ts = ts / 1000
            return datetime.fromtimestamp(ts, tz=UTC)
        except (ValueError, OSError):
            return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def record(
    *,
    spec_id: str,
    market: str,
    source_job_id: str | None,
    source_url: str,
    title: str,
    company: str,
    location: str = "",
    description: str = "",
    published_at: datetime | None = None,
    raw: dict[str, Any] | None = None,
    application_url: str = "",
) -> CollectorRecord:
    return CollectorRecord(
        channel_key=spec_id,
        market=market,
        source_job_id=source_job_id or None,
        source_url=source_url,
        application_url=application_url,
        title=title,
        company=company,
        location=location,
        description=description,
        published_at=published_at,
        collected_at=datetime.now(tz=UTC),
        raw_payload=raw or {},
    )
