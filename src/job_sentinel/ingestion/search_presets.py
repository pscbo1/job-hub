"""Named Search / Collect presets. Stored in SQLite meta — not jobs / jobs_raw."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from loguru import logger
from pydantic import BaseModel, Field, ValidationError, field_validator

from job_sentinel.ingestion.search_capabilities import sanitize_overrides
from job_sentinel.markets import parse_market_id

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository

_META_KEY = "hub_search_presets"
_MAX_PRESETS = 50
_NAME_MAX = 80


class CommonSearchFilters(BaseModel):
    keywords: str = ""
    location: str = ""
    remote: bool | None = None
    date_posted_days: int | None = Field(default=None, ge=1, le=365)
    max_results: int = Field(default=100, ge=1, le=200)

    @field_validator("keywords", "location", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class SearchPreset(BaseModel):
    id: str
    name: str
    market: str
    sources: list[str] = Field(min_length=1)
    common_filters: CommonSearchFilters = Field(default_factory=CommonSearchFilters)
    source_overrides: dict[str, dict[str, Any]] = Field(default_factory=dict)
    created_at: str
    updated_at: str

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        return v.strip()[:_NAME_MAX]

    @field_validator("market", mode="before")
    @classmethod
    def _market(cls, v: object) -> object:
        mid = parse_market_id(str(v) if v is not None else "")
        if mid is None:
            raise ValueError("market must be cn or en")
        return mid

    @field_validator("sources", mode="before")
    @classmethod
    def _sources(cls, v: object) -> object:
        if not isinstance(v, list):
            return v
        seen: set[str] = set()
        out: list[str] = []
        for item in v:
            key = str(item).strip().lower()
            if key and key not in seen:
                seen.add(key)
                out.append(key)
        return out

    @field_validator("source_overrides", mode="before")
    @classmethod
    def _overrides(cls, v: object) -> object:
        return sanitize_overrides(v)


class SearchPresetWrite(BaseModel):
    name: str
    market: str
    sources: list[str] = Field(min_length=1)
    common_filters: CommonSearchFilters = Field(default_factory=CommonSearchFilters)
    source_overrides: dict[str, dict[str, Any]] = Field(default_factory=dict)

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        return v.strip()[:_NAME_MAX]

    @field_validator("market", mode="before")
    @classmethod
    def _market(cls, v: object) -> object:
        mid = parse_market_id(str(v) if v is not None else "")
        if mid is None:
            raise ValueError("market must be cn or en")
        return mid

    @field_validator("sources", mode="before")
    @classmethod
    def _sources(cls, v: object) -> object:
        if not isinstance(v, list):
            return v
        seen: set[str] = set()
        out: list[str] = []
        for item in v:
            key = str(item).strip().lower()
            if key and key not in seen:
                seen.add(key)
                out.append(key)
        return out

    @field_validator("source_overrides", mode="before")
    @classmethod
    def _overrides(cls, v: object) -> object:
        return sanitize_overrides(v)


class SearchPresetPatch(BaseModel):
    name: str | None = None
    sources: list[str] | None = None
    common_filters: CommonSearchFilters | None = None
    source_overrides: dict[str, dict[str, Any]] | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v: object) -> object:
        if v is None or not isinstance(v, str):
            return v
        return v.strip()[:_NAME_MAX]

    @field_validator("sources", mode="before")
    @classmethod
    def _sources(cls, v: object) -> object:
        if v is None or not isinstance(v, list):
            return v
        seen: set[str] = set()
        out: list[str] = []
        for item in v:
            key = str(item).strip().lower()
            if key and key not in seen:
                seen.add(key)
                out.append(key)
        return out

    @field_validator("source_overrides", mode="before")
    @classmethod
    def _overrides(cls, v: object) -> object:
        if v is None:
            return v
        return sanitize_overrides(v)


def _now() -> str:
    return datetime.now(tz=UTC).isoformat().replace("+00:00", "Z")


def _scoped_overrides(
    sources: list[str], overrides: dict[str, dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    allowed = set(sources)
    return {sid: fields for sid, fields in overrides.items() if sid in allowed}


def load_presets(repo: JobRepository, *, market: str | None = None) -> list[SearchPreset]:
    raw = repo.get_meta(_META_KEY)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    rows: list[SearchPreset] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            rows.append(SearchPreset.model_validate(item))
        except ValidationError:
            logger.debug("Skipping invalid search preset row")
            continue
    if market is None or not str(market).strip():
        return rows
    mid = parse_market_id(market)
    if mid is None:
        raise ValueError(f"Unknown market: {market}")
    return [row for row in rows if row.market == mid]


def _save_all(repo: JobRepository, rows: list[SearchPreset]) -> None:
    repo.set_meta(_META_KEY, json.dumps([row.model_dump() for row in rows], ensure_ascii=False))


def create_preset(repo: JobRepository, write: SearchPresetWrite) -> SearchPreset:
    if not write.name.strip():
        raise ValueError("name is required")
    if not write.sources:
        raise ValueError("Select at least one source")
    all_rows = load_presets(repo)
    market_count = sum(1 for row in all_rows if row.market == write.market)
    if market_count >= _MAX_PRESETS:
        raise ValueError(f"At most {_MAX_PRESETS} saved searches per market")
    stamp = _now()
    preset = SearchPreset(
        id=str(uuid.uuid4()),
        name=write.name.strip(),
        market=write.market,
        sources=write.sources,
        common_filters=write.common_filters,
        source_overrides=_scoped_overrides(write.sources, write.source_overrides),
        created_at=stamp,
        updated_at=stamp,
    )
    all_rows.append(preset)
    _save_all(repo, all_rows)
    return preset


def get_preset(repo: JobRepository, preset_id: str) -> SearchPreset | None:
    key = preset_id.strip()
    for row in load_presets(repo):
        if row.id == key:
            return row
    return None


def update_preset(
    repo: JobRepository, preset_id: str, patch: SearchPresetPatch
) -> SearchPreset | None:
    all_rows = load_presets(repo)
    found: SearchPreset | None = None
    for row in all_rows:
        if row.id == preset_id.strip():
            found = row
            break
    if found is None:
        return None
    data = found.model_dump()
    if patch.name is not None:
        if not patch.name.strip():
            raise ValueError("name is required")
        data["name"] = patch.name.strip()
    if patch.sources is not None:
        if not patch.sources:
            raise ValueError("Select at least one source")
        data["sources"] = patch.sources
    if patch.common_filters is not None:
        data["common_filters"] = patch.common_filters.model_dump()
    if patch.source_overrides is not None:
        data["source_overrides"] = patch.source_overrides
    data["source_overrides"] = _scoped_overrides(data["sources"], data["source_overrides"])
    data["updated_at"] = _now()
    updated = SearchPreset.model_validate(data)
    next_rows = [updated if row.id == updated.id else row for row in all_rows]
    _save_all(repo, next_rows)
    return updated


def delete_preset(repo: JobRepository, preset_id: str) -> bool:
    all_rows = load_presets(repo)
    next_rows = [row for row in all_rows if row.id != preset_id.strip()]
    if len(next_rows) == len(all_rows):
        return False
    _save_all(repo, next_rows)
    return True
