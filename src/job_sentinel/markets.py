"""Market views (cn / en) vs source_market (cn / en / global).

source_market is configured on each collect source. country is a per-job
location attribute. CN and EN views do not mix sources. global boards belong
to the EN view. Missing source_market is never guessed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from job_sentinel.core.models import Job

MarketId = Literal["cn", "en"]
SourceMarket = Literal["cn", "en", "global"]

_SOURCE_ALIASES: dict[str, SourceMarket] = {
    "cn": "cn",
    "en": "en",
    "global": "global",
}


@dataclass(frozen=True)
class MarketConfig:
    id: MarketId
    label: str
    default_country: str | None
    filters: frozenset[str]
    default_collect_sources: tuple[str, ...]
    route: str


MARKETS: dict[MarketId, MarketConfig] = {
    "cn": MarketConfig(
        id="cn",
        label="CN",
        default_country="CN",
        # CN jobs may leave visa/sponsorship empty; no sponsorship_display filter.
        filters=frozenset({"source"}),
        default_collect_sources=("zhaopin", "liepin"),
        route="/cn",
    ),
    "en": MarketConfig(
        id="en",
        label="EN",
        default_country=None,
        # EN view includes global boards; fill visa/work-permit when available.
        filters=frozenset({"country", "remote", "posted", "source", "sponsorship_display"}),
        default_collect_sources=("linkedin", "hiring_cafe"),
        route="/en",
    ),
}


def parse_source_market(raw: str | None) -> SourceMarket | None:
    """Canonical source_market: cn, en, or global. None if missing/unknown."""
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    return _SOURCE_ALIASES.get(text.lower())


def require_source_market(raw: str | None) -> SourceMarket:
    parsed = parse_source_market(raw)
    if parsed is None:
        raise ValueError("source market must be cn, en, or global")
    return parsed


def parse_market_id(raw: str | None) -> MarketId | None:
    """UI view id. global international boards map onto EN."""
    sm = parse_source_market(raw)
    if sm == "global":
        return "en"
    if sm == "cn" or sm == "en":
        return sm
    return None


def require_market_id(raw: str | None) -> MarketId:
    mid = parse_market_id(raw)
    if mid is None:
        raise ValueError("Unknown market")
    return mid


def stored_values_for(market_id: MarketId) -> frozenset[str]:
    if market_id == "cn":
        return frozenset({"cn", "CN"})
    return frozenset({"en", "EN", "global", "GLOBAL"})


def market_has_filter(market_id: MarketId, name: str) -> bool:
    return name in MARKETS[market_id].filters


def source_in_view(source_market: str | None, view: MarketId) -> bool:
    """CN sources stay in CN. EN and global boards stay in EN."""
    sm = parse_source_market(source_market)
    if sm is None:
        return False
    if sm == "global":
        return view == "en"
    return sm == view


def resolve_job_source_market(
    *,
    source_id: str,
    stored_market: str,
    registry: dict[str, SourceMarket],
) -> SourceMarket | None:
    """Prefer the source registry, then the stored job market. Never guess."""
    key = source_id.strip().lower()
    if key in registry:
        return registry[key]
    return parse_source_market(stored_market)


def job_in_view(
    *,
    source_market: SourceMarket | None,
    country: str,
    view: MarketId,
) -> bool:
    """Market membership is by source. Country is an EN filter only."""
    del country
    if source_market is None:
        return False
    if source_market == "cn":
        return view == "cn"
    return view == "en"


def job_in_market_view(
    job: Job,
    view: MarketId,
    registry: dict[str, SourceMarket],
) -> bool:
    sm = resolve_job_source_market(
        source_id=job.source,
        stored_market=job.market,
        registry=registry,
    )
    return job_in_view(source_market=sm, country=job.country, view=view)
