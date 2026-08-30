"""Collectable source registry.

Each source declares how it is collected. Search lists only runnable sources.
Job Pool and the ingest pipeline stay unchanged — adapters emit CollectorRecord.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

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


class CollectSource(BaseModel):
    """One selectable collection source in the Search UI."""

    id: str
    label: str
    kind: CollectKind
    collector_id: str = Field(
        description="Id passed to the collector (mcp-jobs provider name or alias)."
    )
    integration: IntegrationMethod = "mcp_jobs"
    market: str = "CN"
    runnable: bool = True
    notes: str = ""
    enabled: bool = True
    ats: str | None = None
    slug: str | None = None
    company: str | None = None
    source_group: SourceGroup | None = Field(
        default=None,
        description="Collect Jobs UI group. Defaults from kind when omitted.",
    )
    collection_group: str | None = Field(
        default=None,
        description="Reserved for a later custom grouping layer; unused in V0.",
    )

    @model_validator(mode="after")
    def _default_source_group(self) -> CollectSource:
        if self.source_group is None:
            self.source_group = _KIND_TO_SOURCE_GROUP[self.kind]
        return self


# Stable V0 ids. New sources append here; do not reuse ids.
# FAO Careers (Taleo) and LinkedIn Jobs are intentionally omitted — not runnable.
_SOURCES: tuple[CollectSource, ...] = (
    CollectSource(
        id="zhaopin",
        label="Zhaopin",
        kind="platform",
        collector_id="zhaopin",
        integration="mcp_jobs",
        notes="智联招聘",
    ),
    CollectSource(
        id="liepin",
        label="Liepin",
        kind="platform",
        collector_id="liepin",
        integration="mcp_jobs",
        notes="猎聘",
    ),
    CollectSource(
        id="boss",
        label="Boss",
        kind="platform",
        collector_id="boss",
        integration="mcp_jobs",
        notes="BOSS直聘 — uses the existing local Chrome profile / login",
    ),
    CollectSource(
        id="impactpool",
        label="Impactpool",
        kind="vertical",
        collector_id="impactpool",
        integration="public_html",
        market="GLOBAL",
        notes="Impact-sector board — latest public listings, then keyword filter",
    ),
    CollectSource(
        id="dimagi",
        label="Dimagi Careers",
        kind="career_page",
        collector_id="dimagi",
        integration="ats_board",
        market="GLOBAL",
        ats="greenhouse",
        slug="dimagi",
        company="Dimagi",
        notes="Greenhouse public board API",
    ),
    CollectSource(
        id="automattic",
        label="Automattic Careers",
        kind="career_page",
        collector_id="automattic",
        integration="ats_board",
        market="GLOBAL",
        ats="greenhouse",
        slug="automatticcareers",
        company="Automattic",
        notes="Greenhouse public board API",
    ),
    CollectSource(
        id="tencent",
        label="Tencent Careers",
        kind="career_page",
        collector_id="tencent",
        integration="http_json",
        market="CN",
        company="Tencent",
        notes="careers.tencent.com public Query API — try SSV / 公益 / Tech for Good",
    ),
    CollectSource(
        id="hiring_cafe",
        label="HiringCafe",
        kind="platform",
        collector_id="hiring_cafe",
        integration="ssr_json",
        market="GLOBAL",
        notes="Public SSR job island on hiring.cafe — keyword filter is client-side",
    ),
)


def list_collect_sources(*, enabled_only: bool = True) -> list[CollectSource]:
    if enabled_only:
        return [s for s in _SOURCES if s.enabled and s.runnable]
    return list(_SOURCES)


def get_collect_source(source_id: str) -> CollectSource | None:
    key = source_id.strip().lower()
    for spec in _SOURCES:
        if spec.id == key:
            return spec
    return None


def resolve_collect_sources(source_ids: list[str]) -> list[CollectSource]:
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
    return resolved
