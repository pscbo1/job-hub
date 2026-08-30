"""Shared public ATS board client (Greenhouse, Lever, Ashby, Workday).

Company-specific collection does not live here. Callers pass ``ats`` + ``slug``
(or a careers URL that encodes them). Taleo and iCIMS are recognized so we
can refuse them with a stable reason instead of scraping session-bound or
HTML-only career portals.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol
from urllib.parse import parse_qs, urlparse

import httpx
from loguru import logger

from job_sentinel.core.text import strip_html

if TYPE_CHECKING:
    from collections.abc import Callable

SUPPORTED_ATS = frozenset({"greenhouse", "lever", "ashby", "workday"})

TALEO_UNSUPPORTED_REASON = (
    "Oracle Taleo (and Oracle Recruiting Cloud career sites) have no public "
    "job-board API. Listings are filled by a session-bound undocumented POST to "
    "/careersection/rest/jobboard/searchjobs that needs a per-tenant portal id "
    "scraped from jobsearch.ftl, a cookie jar, and timezone headers. Full JDs "
    "require a second HTML scrape of jobdetail.ftl. RSS exists only when an "
    "admin enables it (default off) and is capped at 10 jobs. Job Hub does not "
    "use that workaround."
)

ICIMS_UNSUPPORTED_REASON = (
    "iCIMS has no public job-board API. The Talent Cloud / Job Portal APIs at "
    "api.icims.com require a numeric customer id and partner credentials. The "
    "optimized XML feed is for approved job boards only. Career sites "
    "({careers,jobs}-*.icims.com) render HTML listings; mode=rss still returns "
    "HTML, and there is no stable anonymous JSON list. Full JDs are schema.org "
    "JSON-LD on per-job HTML (often iframe). Tenants vary (classic iframe vs JS "
    "shell vs bot wall). Job Hub does not scrape that surface."
)

UNSUPPORTED_ATS: dict[str, str] = {
    "taleo": TALEO_UNSUPPORTED_REASON,
    "oracle_recruiting": TALEO_UNSUPPORTED_REASON,
    "icims": ICIMS_UNSUPPORTED_REASON,
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
    def fetch(
        self,
        client: httpx.Client,
        slug: str,
        *,
        search_text: str,
        limit: int | None,
    ) -> list[AtsJob]: ...


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

    wd = _parse_workday_board(host, parsed.path)
    if wd:
        return "workday", wd

    if host.endswith(".icims.com"):
        tenant = host.split(".")[0]
        for prefix in ("careers-", "jobs-"):
            if tenant.lower().startswith(prefix):
                tenant = tenant[len(prefix) :]
                break
        return "icims", tenant or host.split(".")[0]

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
            "Need a supported ATS (greenhouse, lever, ashby, workday) and slug, "
            "or a careers URL on boards.greenhouse.io / jobs.lever.co / "
            "jobs.ashbyhq.com / *.myworkdayjobs.com"
        )
        raise ValueError(msg)
    return ats_key, slug_key


def fetch_ats_jobs(
    ats: str,
    slug: str,
    *,
    search_text: str = "",
    limit: int | None = None,
) -> list[AtsJob]:
    """Fetch current postings from a public board. Raises on HTTP failure."""
    ats_key, slug_key = resolve_board(ats=ats, slug=slug)
    codec = _CODECS[ats_key]
    try:
        with httpx.Client(
            timeout=_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
        ) as client:
            return codec.fetch(client, slug_key, search_text=search_text, limit=limit)
    except Exception as exc:
        if isinstance(exc, AtsFetchError):
            raise
        raise AtsFetchError(f"{ats_key}/{slug_key}: {exc}") from exc


def _workday_site_from_path(path: str) -> str:
    parts = [p for p in path.strip("/").split("/") if p]
    if parts and re.fullmatch(r"[a-z]{2}(?:-[A-Za-z]{2})?", parts[0]):
        parts = parts[1:]
    if not parts or parts[0].lower() == "job":
        return ""
    return parts[0]


def _parse_workday_board(host: str, path: str) -> str | None:
    labels = host.split(".")
    if len(labels) < 3 or labels[-2] != "myworkdayjobs":
        return None
    if len(labels) >= 4 and not re.fullmatch(r"wd\d+", labels[1], re.I):
        return None
    if len(labels) not in {3, 4}:
        return None
    site = _workday_site_from_path(path)
    if not site:
        return None
    return f"{host}/{site}"


def _split_workday_slug(slug: str) -> tuple[str, str, str]:
    """Return ``(host, tenant, site)`` from ``host/site`` or a careers URL."""
    text = slug.strip()
    if "://" in text:
        parsed = urlparse(text)
        host = parsed.netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        packed = _parse_workday_board(host, parsed.path)
        if not packed:
            raise ValueError(f"Not a Workday careers URL: {slug}")
        text = packed
    host, _, site = text.partition("/")
    host = host.lower()
    site = site.split("/")[0]
    if not host or not site:
        raise ValueError(f"Workday slug must be host/site (got {slug!r})")
    tenant = host.split(".")[0]
    return host, tenant, site


def _json_get(
    client: httpx.Client,
    url: str,
    parse: Callable[[Any, str], list[AtsJob]],
    slug: str,
) -> list[AtsJob]:
    resp = client.get(url)
    resp.raise_for_status()
    return parse(resp.json(), slug)


class _GreenhouseCodec:
    def list_url(self, slug: str) -> str:
        return f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"

    def fetch(
        self,
        client: httpx.Client,
        slug: str,
        *,
        search_text: str,
        limit: int | None,
    ) -> list[AtsJob]:
        _ = (search_text, limit)
        return _json_get(client, self.list_url(slug), self.parse, slug)

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

    def fetch(
        self,
        client: httpx.Client,
        slug: str,
        *,
        search_text: str,
        limit: int | None,
    ) -> list[AtsJob]:
        _ = (search_text, limit)
        return _json_get(client, self.list_url(slug), self.parse, slug)

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

    def fetch(
        self,
        client: httpx.Client,
        slug: str,
        *,
        search_text: str,
        limit: int | None,
    ) -> list[AtsJob]:
        _ = (search_text, limit)
        return _json_get(client, self.list_url(slug), self.parse, slug)

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


_WORKDAY_PAGE = 20
_WORKDAY_MAX_PAGES = 15


class _WorkdayCodec:
    def fetch(
        self,
        client: httpx.Client,
        slug: str,
        *,
        search_text: str,
        limit: int | None,
    ) -> list[AtsJob]:
        host, tenant, site = _split_workday_slug(slug)
        list_url = f"https://{host}/wday/cxs/{tenant}/{site}/jobs"
        cap = limit if limit is not None and limit > 0 else _WORKDAY_PAGE * _WORKDAY_MAX_PAGES
        jobs: list[AtsJob] = []
        offset = 0
        total = 1
        pages = 0
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        while offset < total and len(jobs) < cap and pages < _WORKDAY_MAX_PAGES:
            resp = client.post(
                list_url,
                json={
                    "appliedFacets": {},
                    "limit": _WORKDAY_PAGE,
                    "offset": offset,
                    "searchText": search_text.strip(),
                },
                headers=headers,
            )
            resp.raise_for_status()
            payload = resp.json()
            if not isinstance(payload, dict):
                break
            total = int(payload.get("total") or 0)
            rows = payload.get("jobPostings") or []
            if not isinstance(rows, list) or not rows:
                break
            for item in rows:
                if not isinstance(item, dict):
                    continue
                jobs.append(self._hydrate(client, host, tenant, site, slug, item))
                if len(jobs) >= cap:
                    break
            offset += _WORKDAY_PAGE
            pages += 1
        return jobs

    def _hydrate(
        self,
        client: httpx.Client,
        host: str,
        tenant: str,
        site: str,
        slug: str,
        item: dict[str, Any],
    ) -> AtsJob:
        ext = str(item.get("externalPath") or "")
        title = str(item.get("title") or "")
        location = str(item.get("locationsText") or "")
        native = ""
        bullets = item.get("bulletFields") or []
        if isinstance(bullets, list) and bullets:
            native = str(bullets[0] or "")
        apply_url = f"https://{host}/{site}{ext}" if ext else f"https://{host}/{site}"
        desc = ""
        posted = str(item.get("postedOn") or "")
        if ext:
            durl = f"https://{host}/wday/cxs/{tenant}/{site}{ext}"
            dpayload: Any = {}
            try:
                dresp = client.get(durl, headers={"Accept": "application/json"})
                dresp.raise_for_status()
                dpayload = dresp.json()
            except Exception as exc:
                logger.warning("workday detail failed {} — {}", durl, exc)
            info = dpayload.get("jobPostingInfo") if isinstance(dpayload, dict) else {}
            if isinstance(info, dict):
                title = str(info.get("title") or title)
                location = str(info.get("location") or location)
                native = str(info.get("jobReqId") or info.get("id") or native)
                posted = str(info.get("startDate") or posted)
                desc = str(info.get("jobDescription") or "")
                ext_url = str(info.get("externalUrl") or "")
                if ext_url:
                    apply_url = ext_url
        return AtsJob(
            ats="workday",
            slug=slug,
            native_id=native,
            title=title,
            location=location,
            company=tenant,
            department="",
            posted_at=posted,
            apply_url=apply_url,
            description=desc,
            extra={"ats": "workday", "company_slug": slug, "external_path": ext},
        )


_CODECS: dict[str, _AtsCodec] = {
    "greenhouse": _GreenhouseCodec(),
    "lever": _LeverCodec(),
    "ashby": _AshbyCodec(),
    "workday": _WorkdayCodec(),
}


def log_fetch_failure(ats: str, slug: str, exc: BaseException) -> None:
    logger.warning("company_boards: fetch failed ats={} slug={} — {}", ats, slug, exc)
