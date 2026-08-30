"""Impactpool latest public listings (homepage HTML) plus job-page title/company."""

from __future__ import annotations

import re
from html import unescape
from typing import TYPE_CHECKING

from job_sentinel.ingestion.adapters import (
    AdapterError,
    http_client,
    matches_query,
    query_blob,
    record,
)

if TYPE_CHECKING:
    from job_sentinel.ingestion.collect_sources import CollectSource
    from job_sentinel.ingestion.contract import CollectorRecord

_HOME = "https://www.impactpool.org/"
_JOB_HREF = re.compile(r'href="(/jobs/(\d+))"')
_TITLE = re.compile(r"<title>([^<]+)</title>", re.IGNORECASE)
_H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.IGNORECASE | re.DOTALL)
_TAG = re.compile(r"<[^>]+>")


def collect_impactpool(
    spec: CollectSource,
    *,
    keywords: str,
    location: str,
    max_results: int,
) -> list[CollectorRecord]:
    try:
        with http_client() as client:
            home = client.get(_HOME)
            home.raise_for_status()
            ids = _unique_job_ids(home.text)
            if not ids:
                raise AdapterError(f"{spec.id}: no public job links on homepage")
            fetch_cap = max(max_results * 8, 24)
            out: list[CollectorRecord] = []
            for job_id in ids[:fetch_cap]:
                if len(out) >= max_results:
                    break
                url = f"https://www.impactpool.org/jobs/{job_id}"
                page = client.get(url)
                if page.status_code >= 400:
                    continue
                title, company = _title_company(page.text)
                loc = _location_guess(page.text)
                blob = query_blob(title, company, loc, page.text[:2000])
                if not matches_query(blob, keywords, location):
                    continue
                out.append(
                    record(
                        spec_id=spec.id,
                        market=spec.market,
                        source_job_id=job_id,
                        source_url=url,
                        title=title,
                        company=company or "Impactpool",
                        location=loc,
                        description=_plain(page.text)[:2000],
                        raw={"job_id": job_id, "title_tag": title},
                    )
                )
    except AdapterError:
        raise
    except Exception as exc:
        raise AdapterError(f"{spec.id}: impactpool fetch failed — {exc}") from exc
    return out


def _unique_job_ids(html: str) -> list[str]:
    seen: set[str] = set()
    ids: list[str] = []
    for _, job_id in _JOB_HREF.findall(html):
        if job_id in seen:
            continue
        seen.add(job_id)
        ids.append(job_id)
    return ids


def _title_company(html: str) -> tuple[str, str]:
    match = _TITLE.search(html)
    raw = unescape(_TAG.sub("", match.group(1))).strip() if match else ""
    if " | " in raw:
        title, company = raw.rsplit(" | ", 1)
        return title.strip(), company.strip()
    h1 = _H1.search(html)
    if h1:
        return unescape(_TAG.sub("", h1.group(1))).strip(), ""
    return raw, ""


def _location_guess(html: str) -> str:
    match = re.search(
        r"(?:Duty station|Location)</[^>]+>\s*([^<]{2,80})",
        html,
        flags=re.IGNORECASE,
    )
    if match:
        return unescape(match.group(1)).strip()
    return ""


def _plain(html: str) -> str:
    return unescape(_TAG.sub(" ", html))
