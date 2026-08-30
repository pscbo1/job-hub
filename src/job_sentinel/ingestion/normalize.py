"""Map a CollectorRecord onto the confirmed ``jobs`` schema."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from job_sentinel.core.models import Job, compute_job_fingerprint, source_job_id_from_canonical_url
from job_sentinel.core.text import strip_html

if TYPE_CHECKING:
    from job_sentinel.ingestion.contract import CollectorRecord

_TRACKING_PARAMS = frozenset(
    {
        "refcode",
        "srccode",
        "preactionid",
        "data_identity",
        "mscid",
        "sid",
        "pid",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
    }
)

_SOURCE_ALIASES: dict[str, str] = {
    "zhaopin": "zhaopin",
    "智联": "zhaopin",
    "zhipin-web": "boss",
    "zhipin": "boss",
    "boss": "boss",
    "boss_zhipin": "boss",
    "boss-zhipin": "boss",
    "liepin": "liepin",
    "liepin-official-mcp": "liepin",
    "猎聘": "liepin",
}


def canonicalize_source(raw: str) -> str:
    """Map mcp-jobs provider names onto stable Job Hub source keys."""
    key = raw.strip().lower()
    return _SOURCE_ALIASES.get(key, key)


def _source_market_for(source: str, raw_market: str) -> str:
    """Prefer a valid record market, then the source registry. Do not guess."""
    from job_sentinel.ingestion.collect_sources import get_collect_source
    from job_sentinel.markets import parse_source_market

    parsed = parse_source_market(raw_market)
    if parsed is not None:
        return parsed
    spec = get_collect_source(source)
    if spec is not None:
        return spec.market
    return ""


def canonicalize_url(url: str) -> str:
    """Drop known tracking query params; keep the rest of the URL."""
    text = url.strip()
    if not text:
        return ""
    parts = urlsplit(text)
    scheme = (parts.scheme or "https").lower()
    netloc = parts.netloc.lower()
    query = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if k.lower() not in _TRACKING_PARAMS
    ]
    return urlunsplit((scheme, netloc, parts.path, urlencode(query), ""))


def source_job_id_from_url(source: str, url: str) -> str:
    """Best-effort platform id from a listing URL; empty if unknown."""
    path = urlsplit(url).path
    if source == "zhaopin":
        marker = "/jobdetail/"
        if marker in path.lower():
            idx = path.lower().index(marker) + len(marker)
            token = path[idx:].split("/")[0]
            return token.split(".")[0]
    if source == "boss":
        marker = "/job_detail/"
        if marker in path.lower():
            idx = path.lower().index(marker) + len(marker)
            token = path[idx:].split("/")[0]
            return token.split(".")[0]
    if source == "liepin":
        marker = "/job/"
        if marker in path.lower():
            idx = path.lower().index(marker) + len(marker)
            token = path[idx:].split("/")[0]
            return token.split(".")[0]
    if source == "linkedin":
        path = urlsplit(url).path.rstrip("/")
        digits = path.rsplit("/", 1)[-1]
        if "-" in digits:
            digits = digits.rsplit("-", 1)[-1]
        return digits if digits.isdigit() and len(digits) >= 6 else ""
    return ""


def validation_reasons(record: CollectorRecord) -> list[str]:
    """Missing required fields; empty list means the record can be normalized."""
    reasons: list[str] = []
    if not record.channel_key.strip():
        reasons.append("missing_channel_key")
    if not record.title.strip():
        reasons.append("missing_title")
    if not record.source_url.strip():
        reasons.append("missing_source_url")
    return reasons


def normalize_record(record: CollectorRecord) -> Job:
    """Build a ``Job`` row. Status and match_score stay unset (NULL)."""
    source = canonicalize_source(record.channel_key)
    job_url = record.source_url.strip()
    canonical = canonicalize_url(job_url)
    source_job_id = (record.source_job_id or "").strip() or source_job_id_from_url(
        source, canonical or job_url
    )
    if not source_job_id:
        source_job_id = source_job_id_from_canonical_url(canonical or job_url)
    title = " ".join(record.title.split())
    company = " ".join(record.company.split())
    location = " ".join(record.location.split())
    description = strip_html(record.description)
    if record.requirements:
        extra = strip_html(record.requirements)
        if extra and extra not in description:
            description = f"{description} {extra}".strip()
    now = datetime.now(tz=UTC)
    collected = record.collected_at
    if collected.tzinfo is None:
        collected = collected.replace(tzinfo=UTC)
    return Job(
        source=source,
        source_job_id=source_job_id,
        job_url=job_url,
        canonical_url=canonical,
        title=title,
        company=company,
        location=location,
        description=description,
        employment_type=_employment_type_from_record(record),
        salary=_salary_from_record(record),
        published_at=record.published_at,
        discovered_at=collected,
        last_seen_at=now,
        updated_at=now,
        fingerprint=compute_job_fingerprint(company, title, location),
        status=None,
        match_score=None,
        market=_source_market_for(source, record.market),
    )


def _employment_type_from_record(record: CollectorRecord) -> str:
    payload = record.raw_payload
    for key in ("employment_type", "jobType", "job_type", "工作性质", "职位类型"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    tags = payload.get("tags")
    if isinstance(tags, list):
        parts = [str(t).strip() for t in tags if str(t).strip()]
        if parts:
            return " ".join(parts)
    return ""


def _salary_from_record(record: CollectorRecord) -> str:
    payload = record.raw_payload
    for key in ("薪资", "salary"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""
