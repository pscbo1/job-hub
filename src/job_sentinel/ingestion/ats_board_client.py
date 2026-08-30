"""Shared public ATS board client (Greenhouse, Lever, Ashby).

Company-specific collection does not live here. Callers pass ``ats`` + ``slug``
(or a careers URL that encodes them). Taleo is recognized so we can refuse it
with a stable reason instead of scraping a session-bound private endpoint.
"""

from __future__ import annotations

import html
from dataclasses import dataclass, field
from typing import Any, Protocol
from urllib.parse import parse_qs, urlparse

import httpx
from loguru import logger

from job_sentinel.core.text import strip_html

SUPPORTED_ATS = frozenset({"greenhouse", "lever", "ashby"})

TALEO_UNSUPPORTED_REASON = (
    "Oracle Taleo (and Oracle Recruiting Cloud career sites) have no public "
    "job-board API. Listings are filled by a session-bound undocumented POST to "
    "/careersection/rest/jobboard/searchjobs that needs a per-tenant portal id "
    "scraped from jobsearch.ftl, a cookie jar, and timezone headers. Full JDs "
    "require a second HTML scrape of jobdetail.ftl. RSS exists only when an "
    "admin enables it (default off) and is capped at 10 jobs. Job Hub does not "
    "use that workaround."
)

UNSUPPORTED_ATS: dict[str, str] = {
    "taleo": TALEO_UNSUPPORTED_REASON,
    "oracle_recruiting": TALEO_UNSUPPORTED_REASON,
}

_TIMEOUT = 20.0
_USER_AGENT = "JobHub/0.1 (+local collector; personal use)"


class AtsFetchError(Exception):
    """HTTP or payload failure talking to a public ATS board."""


class UnsupportedAtsError(ValueError):
    """ATS has no stable public board Job Hub will call."""


@dataclass(frozen=True)
class AtsJob:
    ats: str
    slug: str
    native_id: str
    title: str
    company: str
    location: str
    department: str
    posted_at: str
    apply_url: str
    description: str
    extra: dict[str, Any] = field(default_factory=dict)


class _AtsCodec(Protocol):
    def list_url(self, slug: str) -> str: ...

    def parse(self, payload: Any, slug: str) -> list[AtsJob]: ...


def parse_careers_url(url: str) -> tuple[str, str] | None:
    """Return ``(ats, slug)`` when the URL is a known public board host."""
    text = url.strip()
    if not text:
        return None
    if "://" not in text:
        text = f"https://{text}"
    parsed = urlparse(text)
    host = parsed.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    path = parsed.path.strip("/")
    parts = [p for p in path.split("/") if p]
    qs = parse_qs(parsed.query)

    if host in {"boards.greenhouse.io", "job-boards.greenhouse.io"}:
        for_slug = qs.get("for") or []
        if for_slug and for_slug[0].strip():
            return "greenhouse", for_slug[0].strip().lower()
        if parts and parts[0].lower() not in {"embed", "jobs"}:
            return "greenhouse", parts[0].lower()
        return None

    if host == "jobs.lever.co" and parts:
        return "lever", parts[0].lower()

    if host == "jobs.ashbyhq.com" and parts:
        return "ashby", parts[0].lower()

    if host.endswith(".taleo.net"):
        return "taleo", host.split(".")[0]

    if "oraclecloud.com" in host and "hcmui" in path.lower():
        return "oracle_recruiting", host.split(".")[0]

    return None


def resolve_board(*, ats: str = "", slug: str = "", careers_url: str = "") -> tuple[str, str]:
    """Normalize ATS + slug from explicit fields and/or a careers URL."""
    ats_key = ats.strip().lower()
    slug_key = slug.strip()
    parsed = parse_careers_url(careers_url) if careers_url.strip() else None
    if parsed:
        parsed_ats, parsed_slug = parsed
        ats_key = ats_key or parsed_ats
        slug_key = slug_key or parsed_slug
    if ats_key in UNSUPPORTED_ATS:
        raise UnsupportedAtsError(UNSUPPORTED_ATS[ats_key])
    if ats_key not in SUPPORTED_ATS or not slug_key:
        msg = (
            "Need a supported ATS (greenhouse, lever, ashby) and slug, "
            "or a careers URL on boards.greenhouse.io / jobs.lever.co / "
            "jobs.ashbyhq.com"
        )
        raise ValueError(msg)
    return ats_key, slug_key


def fetch_ats_jobs(ats: str, slug: str) -> list[AtsJob]:
    """Fetch every current posting from a public board. Raises on HTTP failure."""
    ats_key, slug_key = resolve_board(ats=ats, slug=slug)
    codec = _CODECS[ats_key]
    url = codec.list_url(slug_key)
    try:
        with httpx.Client(
            timeout=_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
        ) as client:
            resp = client.get(url)
            resp.raise_for_status()
            payload: Any = resp.json()
    except Exception as exc:
        raise AtsFetchError(f"{ats_key}/{slug_key}: {exc}") from exc
    return codec.parse(payload, slug_key)


class _GreenhouseCodec:
    def list_url(self, slug: str) -> str:
        return f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"

    def parse(self, payload: Any, slug: str) -> list[AtsJob]:
        if not isinstance(payload, dict):
            return []
        jobs: list[AtsJob] = []
        for item in payload.get("jobs") or []:
            if not isinstance(item, dict):
                continue
            loc = item.get("location") or {}
            location = loc.get("name", "") if isinstance(loc, dict) else str(loc or "")
            departments = item.get("departments") or []
            dept = ""
            if departments and isinstance(departments[0], dict):
                dept = str(departments[0].get("name") or "")
            content = html.unescape(str(item.get("content") or ""))
            native = str(item.get("id") or "")
            jobs.append(
                AtsJob(
                    ats="greenhouse",
                    slug=slug,
                    native_id=native,
                    title=str(item.get("title") or ""),
                    company=slug,
                    location=location,
                    department=dept,
                    posted_at=str(item.get("updated_at") or item.get("first_published") or ""),
                    apply_url=str(item.get("absolute_url") or ""),
                    description=content,
                    extra={"ats": "greenhouse", "company_slug": slug},
                )
            )
        return jobs


class _LeverCodec:
    def list_url(self, slug: str) -> str:
        return f"https://api.lever.co/v0/postings/{slug}?mode=json"

    def parse(self, payload: Any, slug: str) -> list[AtsJob]:
        if not isinstance(payload, list):
            return []
        jobs: list[AtsJob] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            categories = item.get("categories") or {}
            loc = ""
            team = ""
            if isinstance(categories, dict):
                loc = str(categories.get("location") or "")
                team = str(categories.get("team") or "")
            desc = str(item.get("descriptionPlain") or "")
            if not desc:
                desc = strip_html(str(item.get("description") or ""))
            extra_bits: list[str] = []
            for block in item.get("lists") or []:
                if not isinstance(block, dict):
                    continue
                text = strip_html(str(block.get("text") or block.get("content") or ""))
                if text:
                    extra_bits.append(text)
            if extra_bits:
                desc = "\n\n".join(part for part in [desc, *extra_bits] if part)
            native = str(item.get("id") or "")
            jobs.append(
                AtsJob(
                    ats="lever",
                    slug=slug,
                    native_id=native,
                    title=str(item.get("text") or ""),
                    company=slug,
                    location=loc,
                    department=team,
                    posted_at=str(item.get("createdAt") or ""),
                    apply_url=str(item.get("hostedUrl") or item.get("applyUrl") or ""),
                    description=desc,
                    extra={"ats": "lever", "company_slug": slug},
                )
            )
        return jobs


class _AshbyCodec:
    def list_url(self, slug: str) -> str:
        return f"https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true"

    def parse(self, payload: Any, slug: str) -> list[AtsJob]:
        if not isinstance(payload, dict):
            return []
        jobs: list[AtsJob] = []
        for item in payload.get("jobPostings") or []:
            if not isinstance(item, dict):
                continue
            desc = str(item.get("descriptionPlain") or "")
            if not desc:
                desc = strip_html(str(item.get("descriptionHtml") or ""))
            native = str(item.get("id") or "")
            extra: dict[str, Any] = {"ats": "ashby", "company_slug": slug}
            if item.get("isRemote"):
                extra["is_remote"] = True
            salary_text = _ashby_salary(item.get("compensation"))
            if salary_text:
                extra["salary_text"] = salary_text
            jobs.append(
                AtsJob(
                    ats="ashby",
                    slug=slug,
                    native_id=native,
                    title=str(item.get("title") or ""),
                    company=slug,
                    location=str(item.get("locationName") or item.get("location") or ""),
                    department=str(item.get("employmentType") or ""),
                    posted_at=str(item.get("publishedDate") or ""),
                    apply_url=str(item.get("jobPostingUrl") or ""),
                    description=desc,
                    extra=extra,
                )
            )
        return jobs


def _ashby_salary(comp: object) -> str:
    if not isinstance(comp, dict):
        return ""
    lo = comp.get("minValue")
    hi = comp.get("maxValue")
    curr = str(comp.get("currency") or "")
    interval = str(comp.get("interval") or "")
    if not lo and not hi:
        return ""
    lo_str = f"{lo:,}" if isinstance(lo, (int, float)) else "?"
    hi_str = f"{hi:,}" if isinstance(hi, (int, float)) else "?"
    return f"{curr} {lo_str}–{hi_str} {interval}".strip()


_CODECS: dict[str, _AtsCodec] = {
    "greenhouse": _GreenhouseCodec(),
    "lever": _LeverCodec(),
    "ashby": _AshbyCodec(),
}


def log_fetch_failure(ats: str, slug: str, exc: BaseException) -> None:
    logger.warning("company_boards: fetch failed ats={} slug={} — {}", ats, slug, exc)
