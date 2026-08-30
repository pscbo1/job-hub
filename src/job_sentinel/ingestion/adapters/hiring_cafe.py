"""HiringCafe public SSR JSON island (__NEXT_DATA__). Keyword filter is local."""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any

from job_sentinel.ingestion.adapters import (
    AdapterError,
    http_client,
    matches_query,
    parse_dt,
    query_blob,
    record,
)

if TYPE_CHECKING:
    from job_sentinel.ingestion.collect_sources import CollectSource
    from job_sentinel.ingestion.contract import CollectorRecord

_HOME = "https://hiring.cafe/"
_NEXT = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
    re.DOTALL,
)


def collect_hiring_cafe(
    spec: CollectSource,
    *,
    keywords: str,
    location: str,
    max_results: int,
) -> list[CollectorRecord]:
    try:
        with http_client() as client:
            resp = client.get(_HOME)
            resp.raise_for_status()
    except Exception as exc:
        raise AdapterError(f"{spec.id}: hiring.cafe fetch failed — {exc}") from exc

    match = _NEXT.search(resp.text)
    if not match:
        raise AdapterError(f"{spec.id}: missing __NEXT_DATA__")
    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise AdapterError(f"{spec.id}: invalid __NEXT_DATA__") from exc

    hits = (
        payload.get("props", {}).get("pageProps", {}).get("ssrHits")
        if isinstance(payload, dict)
        else None
    )
    if not isinstance(hits, list):
        raise AdapterError(f"{spec.id}: unexpected SSR payload")

    out: list[CollectorRecord] = []
    for hit in hits:
        if not isinstance(hit, dict):
            continue
        rec = _from_hit(spec, hit)
        if rec is None:
            continue
        blob = query_blob(rec.title, rec.company, rec.location, rec.description)
        if not matches_query(blob, keywords, location):
            continue
        out.append(rec)
        if len(out) >= max_results:
            break
    return out


def _from_hit(spec: CollectSource, hit: dict[str, Any]) -> CollectorRecord | None:
    info_raw = hit.get("job_information")
    info: dict[str, Any] = info_raw if isinstance(info_raw, dict) else {}
    v5_raw = hit.get("v5_processed_job_data")
    v5: dict[str, Any] = v5_raw if isinstance(v5_raw, dict) else {}
    title = str(info.get("title") or info.get("job_title_raw") or v5.get("core_job_title") or "")
    company = str(v5.get("company_name") or "")
    url = str(hit.get("apply_url") or "")
    native = str(hit.get("id") or hit.get("objectID") or "")
    if not title or not url:
        return None
    cities = v5.get("workplace_cities")
    loc = ""
    if isinstance(cities, list) and cities:
        loc = str(cities[0])
    published = v5.get("estimated_publish_date_millis")
    return record(
        spec_id=spec.id,
        market=spec.market,
        source_job_id=native or None,
        source_url=url,
        title=title,
        company=company,
        location=loc,
        description=str(v5.get("role_type") or ""),
        published_at=parse_dt(published),
        raw={"id": native, "source": hit.get("source"), "board_token": hit.get("board_token")},
    )
