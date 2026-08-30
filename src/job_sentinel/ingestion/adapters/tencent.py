"""Tencent social-hire board via the public careers.tencent.com Query JSON API."""

from __future__ import annotations

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

_QUERY = "https://careers.tencent.com/tencentcareer/api/post/Query"
_REFERER = "https://careers.tencent.com/search.html"


def collect_tencent(
    spec: CollectSource,
    *,
    keywords: str,
    location: str,
    max_results: int,
) -> list[CollectorRecord]:
    page_size = min(max(max_results, 1), 50)
    try:
        with http_client() as client:
            resp = client.get(
                _QUERY,
                params={
                    "timestamp": "0",
                    "countryId": "",
                    "cityId": "",
                    "keyword": keywords.strip(),
                    "pageIndex": "1",
                    "pageSize": str(page_size),
                    "language": "zh-cn",
                    "area": "cn",
                },
                headers={"Referer": _REFERER, "Accept": "application/json"},
            )
            resp.raise_for_status()
            payload: dict[str, Any] = resp.json()
    except Exception as exc:
        raise AdapterError(f"{spec.id}: tencent query failed — {exc}") from exc

    data = payload.get("Data") if isinstance(payload, dict) else None
    posts = data.get("Posts") if isinstance(data, dict) else None
    if not isinstance(posts, list):
        raise AdapterError(f"{spec.id}: unexpected tencent payload")

    out: list[CollectorRecord] = []
    for item in posts:
        if not isinstance(item, dict):
            continue
        title = str(item.get("RecruitPostName") or "")
        loc = str(item.get("LocationName") or item.get("CountryName") or "")
        url = str(item.get("PostURL") or "")
        post_id = str(item.get("PostId") or item.get("RecruitPostId") or "")
        desc = str(item.get("Responsibility") or "")
        blob = query_blob(title, loc, desc, item.get("BGName"), item.get("CategoryName"))
        if not matches_query(blob, keywords, location):
            continue
        if not url and post_id:
            url = f"https://careers.tencent.com/jobdesc.html?postId={post_id}"
        out.append(
            record(
                spec_id=spec.id,
                market=spec.market,
                source_job_id=post_id or None,
                source_url=url,
                title=title,
                company=spec.company or "Tencent",
                location=loc,
                description=desc,
                published_at=parse_dt(item.get("LastUpdateTime")),
                raw=item,
            )
        )
        if len(out) >= max_results:
            break
    return out
