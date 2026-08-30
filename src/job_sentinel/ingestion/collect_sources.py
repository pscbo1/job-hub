"""Collectable source registry.

Each source declares how it is collected. Search lists only runnable sources.
Job Pool and the ingest pipeline stay unchanged — adapters emit CollectorRecord.

Greenhouse / Lever / Ashby / Workday company careers live in ``company_ats.yaml``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, field_validator, model_validator

from job_sentinel.ingestion.ats_board_client import resolve_board
from job_sentinel.ingestion.search_capabilities import ordered_search_fields
from job_sentinel.markets import (
    SourceMarket,
    parse_market_id,
    require_source_market,
    source_in_view,
)

CollectKind = Literal["platform", "career_page", "vertical"]
SourceGroup = Literal["platform", "vertical", "company_careers"]
IntegrationMethod = Literal[
    "mcp_jobs",
    "ats_board",
    "http_json",
    "public_html",
    "ssr_json",
]

_KIND_TO_SOURCE_GROUP: dict[CollectKind, SourceGroup] = {
    "platform": "platform",
    "vertical": "vertical",
    "career_page": "company_careers",
}

_COMPANY_ATS_YAML = Path(__file__).with_name("company_ats.yaml")


class CollectSource(BaseModel):
    """One selectable collection source in the Search UI."""

    id: str
    label: str
    kind: CollectKind
    collector_id: str = Field(
        description="Id passed to the collector (mcp-jobs provider name or alias)."
    )
    integration: IntegrationMethod = "mcp_jobs"
    market: SourceMarket
    runnable: bool = True
    notes: str = ""
    enabled: bool = True
    ats: str | None = None
    slug: str | None = None
    company: str | None = None
    careers_url: str | None = None
    source_group: SourceGroup | None = Field(
        default=None,
        description="Collect Jobs UI group. Defaults from kind when omitted.",
    )
    collection_group: str | None = Field(
        default=None,
        description="Reserved for a later custom grouping layer; unused in V0.",
    )
    search_fields: list[str] = Field(
        default_factory=list,
        description="Search filters this adapter actually consumes.",
    )

    @field_validator("market", mode="before")
    @classmethod
    def _require_source_market(cls, v: object) -> object:
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("market is required (cn, en, or global)")
        return require_source_market(str(v))

    @model_validator(mode="after")
    def _default_source_group(self) -> CollectSource:
        if self.source_group is None:
            self.source_group = _KIND_TO_SOURCE_GROUP[self.kind]
        if not self.search_fields:
            self.search_fields = ordered_search_fields(self.id)
        return self


# Stable V0 ids. Platform / vertical / custom HTTP sources stay here.
# Company ATS boards are loaded from company_ats.yaml — do not reuse ids.
# FAO Careers (Taleo) and LinkedIn Jobs are not ATS-board sources.
# FAO stays omitted. LinkedIn, when wired, is a separate public_html collector.
_BUILTIN_SOURCES: tuple[CollectSource, ...] = (
    CollectSource(
        id="zhaopin",
        label="Zhaopin",
        kind="platform",
        collector_id="zhaopin",
        integration="mcp_jobs",
        market="cn",
        notes="智联招聘",
    ),
    CollectSource(
        id="liepin",
        label="Liepin",
        kind="platform",
        collector_id="liepin",
        integration="mcp_jobs",
        market="cn",
        notes="猎聘",
    ),
    CollectSource(
        id="boss",
        label="Boss",
        kind="platform",
        collector_id="boss",
        integration="mcp_jobs",
        market="cn",
        notes="BOSS直聘 — uses the existing local Chrome profile / login",
    ),
    CollectSource(
        id="impactpool",
        label="Impactpool",
        kind="vertical",
        collector_id="impactpool",
        integration="public_html",
        market="en",
        notes="Impact-sector board — latest public listings, then keyword filter",
    ),
    CollectSource(
        id="tencent",
        label="Tencent Careers",
        kind="career_page",
        collector_id="tencent",
        integration="http_json",
        market="cn",
        company="Tencent",
        notes="careers.tencent.com public Query API — try SSV / 公益 / Tech for Good",
    ),
    CollectSource(
        id="hiring_cafe",
        label="HiringCafe",
        kind="platform",
        collector_id="hiring_cafe",
        integration="ssr_json",
        market="en",
        notes="Public SSR job island on hiring.cafe — keyword filter is client-side",
    ),
    CollectSource(
        id="linkedin",
        label="LinkedIn",
        kind="platform",
        collector_id="linkedin",
        integration="public_html",
        market="en",
        notes=(
            "Public guest job HTML (undocumented /jobs-guest endpoints). "
            "No login or cookies. Keyword, location, date posted, and remote only."
        ),
    ),
)


def load_company_ats_sources(path: Path | None = None) -> list[CollectSource]:
    """Build ``ats_board`` CollectSource rows from YAML (config, not collector code)."""
    yaml_path = path or _COMPANY_ATS_YAML
    if not yaml_path.is_file():
        return []
    loaded = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
    rows = loaded.get("companies") if isinstance(loaded, dict) else None
    if not isinstance(rows, list):
        return []
    out: list[CollectSource] = []
    for raw in rows:
        if isinstance(raw, dict):
            out.append(_company_row_to_source(raw))
    return out


def _company_row_to_source(row: dict[str, Any]) -> CollectSource:
    source_id = str(row.get("id") or "").strip().lower()
    company = str(row.get("company") or "").strip()
    if not source_id or not company:
        msg = "company_ats.yaml row needs id and company"
        raise ValueError(msg)
    ats = str(row.get("ats") or "").strip().lower()
    slug = str(row.get("slug") or "").strip()
    careers_url = str(row.get("careers_url") or "").strip()
    try:
        ats_key, slug_key = resolve_board(ats=ats, slug=slug, careers_url=careers_url)
    except ValueError as exc:
        raise ValueError(f"{source_id}: {exc}") from exc
    label = str(row.get("label") or "").strip() or f"{company} Careers"
    enabled = bool(row["enabled"]) if "enabled" in row else True
    raw_market = str(row.get("market") or "").strip()
    if not raw_market:
        msg = f"{source_id}: market is required (cn, en, or global)"
        raise ValueError(msg)
    return CollectSource(
        id=source_id,
        label=label,
        kind="career_page",
        collector_id=source_id,
        integration="ats_board",
        market=raw_market,
        notes=str(row.get("notes") or "").strip(),
        enabled=enabled,
        ats=ats_key,
        slug=slug_key,
        company=company,
        careers_url=careers_url or None,
    )


def _merge_sources() -> tuple[CollectSource, ...]:
    yaml_sources = load_company_ats_sources()
    seen = {s.id for s in _BUILTIN_SOURCES}
    extra: list[CollectSource] = []
    for spec in yaml_sources:
        if spec.id in seen:
            msg = f"company_ats.yaml id {spec.id!r} collides with a built-in source"
            raise ValueError(msg)
        seen.add(spec.id)
        extra.append(spec)
    return (*_BUILTIN_SOURCES, *extra)


_SOURCES: tuple[CollectSource, ...] = _merge_sources()


def list_collect_sources(
    *,
    enabled_only: bool = True,
    market: str | None = None,
) -> list[CollectSource]:
    rows = [s for s in _SOURCES if s.enabled and s.runnable] if enabled_only else list(_SOURCES)
    if market is None or not str(market).strip():
        return rows
    mid = parse_market_id(market)
    if mid is None:
        raise ValueError(f"Unknown market: {market}")
    return [s for s in rows if source_in_view(s.market, mid)]


def get_collect_source(source_id: str) -> CollectSource | None:
    key = source_id.strip().lower()
    for spec in _SOURCES:
        if spec.id == key:
            return spec
    return None


def resolve_collect_sources(
    source_ids: list[str],
    *,
    market: str | None = None,
) -> list[CollectSource]:
    """Validate ids. Unknown or non-runnable ids raise ValueError (API maps this to 400)."""
    if not source_ids:
        raise ValueError("Select at least one source")
    resolved: list[CollectSource] = []
    seen: set[str] = set()
    unknown: list[str] = []
    for raw in source_ids:
        key = raw.strip().lower()
        if not key or key in seen:
            continue
        spec = get_collect_source(key)
        if spec is None or not spec.enabled or not spec.runnable:
            unknown.append(raw)
            continue
        seen.add(key)
        resolved.append(spec)
    if unknown:
        raise ValueError(f"Unknown collection source(s): {', '.join(unknown)}")
    if not resolved:
        raise ValueError("Select at least one source")
    if market is not None and str(market).strip():
        mid = parse_market_id(market)
        if mid is None:
            raise ValueError(f"Unknown market: {market}")
        allowed = {s.id for s in list_collect_sources(enabled_only=False, market=mid)}
        crossed = [s.id for s in resolved if s.id not in allowed]
        if crossed:
            raise ValueError(f"Source(s) not in market {mid}: {', '.join(crossed)}")
    return resolved
