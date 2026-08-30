"""Collectable source registry.

V0 lists CN platforms that mcp-jobs already implements. Later sources
(company career pages, vertical channels) register here with a ``kind``;
Job Pool and the ingest pipeline stay unchanged.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

CollectKind = Literal["platform", "career_page", "vertical"]
SourceGroup = Literal["platform", "vertical", "company_careers"]

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
    integration: Literal["mcp_jobs"] = "mcp_jobs"
    notes: str = ""
    enabled: bool = True
    runnable: bool = True
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
_SOURCES: tuple[CollectSource, ...] = (
    CollectSource(
        id="zhaopin",
        label="Zhaopin",
        kind="platform",
        collector_id="zhaopin",
        notes="智联招聘",
    ),
    CollectSource(
        id="liepin",
        label="Liepin",
        kind="platform",
        collector_id="liepin",
        notes="猎聘",
    ),
    CollectSource(
        id="boss",
        label="Boss",
        kind="platform",
        collector_id="boss",
        notes="BOSS直聘 — uses the existing local Chrome profile / login",
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
