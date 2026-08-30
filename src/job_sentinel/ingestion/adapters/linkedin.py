"""LinkedIn Jobs via public guest HTML endpoints (undocumented; no login).

These ``/jobs-guest/jobs/api/...`` URLs are not a documented LinkedIn API.
They return public job-search HTML for unauthenticated clients. Markup and
query params can change without notice — keep parsing shallow. Do not add
login, cookies, Playwright, or account automation here.
"""

from __future__ import annotations

import re
import time
from html import unescape
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse

import httpx
from loguru import logger

from job_sentinel.ingestion.adapters import AdapterError, record

if TYPE_CHECKING:
    from job_sentinel.ingestion.collect_sources import CollectSource
    from job_sentinel.ingestion.contract import CollectorRecord

SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
DETAIL_URL = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"
VIEW_URL = "https://www.linkedin.com/jobs/view/{job_id}"

# Browser-like UA only: guest HTML often rejects the shared JobHub collector UA.
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_TIMEOUT_S = 20.0
REQUEST_INTERVAL_S = 0.6
_MAX_ATTEMPTS = 3
_RETRY_STATUSES = frozenset({429, 500, 502, 503, 504, 999})
_PAGE_SIZE = 10

_URN = re.compile(r"urn:li:jobPosting:(\d+)")
_TAG = re.compile(r"<[^>]+>")
_TITLE = re.compile(
    r'class="[^"]*top-card-layout__title[^"]*"[^>]*>(.*?)</h2>',
    re.DOTALL | re.IGNORECASE,
)
_COMPANY = re.compile(
    r'class="[^"]*topcard__org-name-link[^"]*"[^>]*>(.*?)</a>',
    re.DOTALL | re.IGNORECASE,
)
_LOCATION = re.compile(
    r'class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>(.*?)</span>',
    re.DOTALL | re.IGNORECASE,
)
_DESC = re.compile(
    r'class="[^"]*description__text[^"]*"[^>]*>(.*?)</div>\s*</div>',
    re.DOTALL | re.IGNORECASE,
)
_EMPLOYMENT = re.compile(
    r"Employment type</h3>\s*<span[^>]*>(.*?)</span>",
    re.DOTALL | re.IGNORECASE,
)


def pause(seconds: float) -> None:
    """Sleep helper — tests replace this to avoid wall-clock waits."""
    if seconds > 0:
        time.sleep(seconds)


def search_query_params(
    *,
    keywords: str,
    location: str,
    start: int,
    remote: bool | None,
    date_posted_days: int | None,
) -> dict[str, str]:
    params: dict[str, str] = {
        "keywords": keywords.strip(),
        "start": str(start),
    }
    if location.strip():
        params["location"] = location.strip()
    if date_posted_days is not None and date_posted_days > 0:
        params["f_TPR"] = f"r{int(date_posted_days) * 86400}"
    if remote is True:
        params["f_WT"] = "2"
    elif remote is False:
        params["f_WT"] = "1"
    return params


def extract_job_ids(html: str) -> list[str]:
    """Ordered unique LinkedIn job ids from guest search HTML."""
    seen: set[str] = set()
    ids: list[str] = []
    for job_id in _URN.findall(html):
        if job_id in seen:
            continue
        seen.add(job_id)
        ids.append(job_id)
    return ids


def collect_linkedin(
    spec: CollectSource,
    *,
    keywords: str,
    location: str,
    max_results: int,
    remote: bool | None = None,
    date_posted_days: int | None = None,
) -> list[CollectorRecord]:
    cap = max(1, max_results)
    client = httpx.Client(
        timeout=_TIMEOUT_S,
        follow_redirects=True,
        headers={
            "User-Agent": _USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.linkedin.com/jobs",
        },
    )
    try:
        job_ids = _collect_search_ids(
            client,
            spec_id=spec.id,
            keywords=keywords,
            location=location,
            cap=cap,
            remote=remote,
            date_posted_days=date_posted_days,
        )
        out: list[CollectorRecord] = []
        for index, job_id in enumerate(job_ids):
            if index:
                pause(REQUEST_INTERVAL_S)
            rec = _fetch_detail(client, spec, job_id)
            if rec is None:
                continue
            out.append(rec)
            if len(out) >= cap:
                break
        return out
    finally:
        client.close()


def _collect_search_ids(
    client: httpx.Client,
    *,
    spec_id: str,
    keywords: str,
    location: str,
    cap: int,
    remote: bool | None,
    date_posted_days: int | None,
) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    start = 0
    while len(found) < cap:
        if start:
            pause(REQUEST_INTERVAL_S)
        params = search_query_params(
            keywords=keywords,
            location=location,
            start=start,
            remote=remote,
            date_posted_days=date_posted_days,
        )
        try:
            resp = _get(client, SEARCH_URL, params=params)
        except AdapterError:
            if found:
                logger.warning("{}: LinkedIn search page failed after {} ids", spec_id, len(found))
                break
            raise
        if _guest_blocked(resp):
            msg = f"{spec_id}: LinkedIn guest search blocked (HTTP {resp.status_code})"
            raise AdapterError(msg)
        if resp.status_code >= 400:
            if found:
                break
            msg = f"{spec_id}: LinkedIn guest search failed (HTTP {resp.status_code})"
            raise AdapterError(msg)
        page_ids = [job_id for job_id in extract_job_ids(resp.text) if job_id not in seen]
        if not page_ids:
            break
        for job_id in page_ids:
            seen.add(job_id)
            found.append(job_id)
            if len(found) >= cap:
                break
        start += max(len(page_ids), _PAGE_SIZE)
    return found[:cap]


def _fetch_detail(
    client: httpx.Client,
    spec: CollectSource,
    job_id: str,
) -> CollectorRecord | None:
    url = DETAIL_URL.format(job_id=job_id)
    try:
        resp = _get(client, url)
    except AdapterError as exc:
        logger.warning("linkedin: skip job {} — {}", job_id, exc)
        return None
    if resp.status_code >= 400 or _guest_blocked(resp):
        logger.warning("linkedin: skip job {} — HTTP {}", job_id, resp.status_code)
        return None
    rec = _from_detail_html(spec, job_id, resp.text)
    if rec is None:
        logger.warning("linkedin: skip job {} — could not parse guest detail", job_id)
    return rec


def _from_detail_html(spec: CollectSource, job_id: str, html: str) -> CollectorRecord | None:
    title = _inner(_TITLE.search(html))
    if not title:
        return None
    company = _inner(_COMPANY.search(html))
    location = _inner(_LOCATION.search(html))
    description = _inner(_DESC.search(html))
    employment = _inner(_EMPLOYMENT.search(html))
    source_url = VIEW_URL.format(job_id=job_id)
    raw: dict[str, Any] = {"linkedin_job_id": job_id}
    if employment:
        raw["employment_type"] = employment
    return record(
        spec_id=spec.id,
        market=spec.market,
        source_job_id=job_id,
        source_url=source_url,
        title=title,
        company=company,
        location=location,
        description=description,
        raw=raw,
    )


def _get(
    client: httpx.Client,
    url: str,
    *,
    params: dict[str, str] | None = None,
) -> httpx.Response:
    last_error: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            resp = client.get(url, params=params)
        except httpx.RequestError as exc:
            last_error = exc
            if attempt + 1 >= _MAX_ATTEMPTS:
                break
            pause(_backoff_s(attempt, None))
            continue
        if resp.status_code in _RETRY_STATUSES and attempt + 1 < _MAX_ATTEMPTS:
            pause(_backoff_s(attempt, resp))
            continue
        return resp
    if last_error is not None:
        raise AdapterError(f"linkedin: request failed — {last_error}") from last_error
    raise AdapterError("linkedin: request failed after retries")


def _backoff_s(attempt: int, resp: httpx.Response | None) -> float:
    if resp is not None:
        retry_after = resp.headers.get("Retry-After")
        if retry_after:
            try:
                seconds = float(str(retry_after))
            except ValueError:
                pass
            else:
                return seconds if seconds < 30.0 else 30.0
    wait = 2.0 * (2**attempt)
    return wait if wait < 8.0 else 8.0


def _guest_blocked(resp: httpx.Response) -> bool:
    if resp.status_code in {401, 403, 999}:
        return True
    text = resp.text[:4000].casefold()
    return "authwall" in text or "/checkpoint/challenge" in text


def _inner(match: re.Match[str] | None) -> str:
    if match is None:
        return ""
    return " ".join(unescape(_TAG.sub(" ", match.group(1))).split())


def job_id_from_view_url(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    digits = re.search(r"(\d{6,})$", path)
    return digits.group(1) if digits else ""
