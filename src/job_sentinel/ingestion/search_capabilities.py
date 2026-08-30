"""Per-source search fields for Collect / Search presets.

Adapters declare what they actually consume. Common filters express user intent;
each adapter only receives the intersection of that intent and its capabilities,
then source_overrides for that source only. Unknown or stale fields are dropped.
"""

from __future__ import annotations

from typing import Any, Literal

SearchFilterKey = Literal[
    "keywords",
    "location",
    "remote",
    "date_posted_days",
    "max_results",
]

COMMON_FILTER_KEYS: tuple[SearchFilterKey, ...] = (
    "keywords",
    "location",
    "remote",
    "date_posted_days",
    "max_results",
)

DEFAULT_SEARCH_FIELDS: frozenset[str] = frozenset({"keywords", "location", "max_results"})

# Built-in collect source ids. Company ATS ids (yaml) fall back to DEFAULT.
SOURCE_CAPABILITIES: dict[str, frozenset[str]] = {
    "linkedin": DEFAULT_SEARCH_FIELDS | {"remote", "date_posted_days"},
    "hiring_cafe": DEFAULT_SEARCH_FIELDS,
    "boss": DEFAULT_SEARCH_FIELDS,
    "liepin": DEFAULT_SEARCH_FIELDS,
    "zhaopin": DEFAULT_SEARCH_FIELDS,
    "impactpool": DEFAULT_SEARCH_FIELDS,
    "tencent": DEFAULT_SEARCH_FIELDS,
}

_OVERRIDE_VALUE_TYPES = (str, int, float, bool, type(None))


def capabilities_for(source_id: str) -> frozenset[str]:
    key = source_id.strip().lower()
    return SOURCE_CAPABILITIES.get(key, DEFAULT_SEARCH_FIELDS)


def ordered_search_fields(source_id: str) -> list[str]:
    caps = capabilities_for(source_id)
    return [key for key in COMMON_FILTER_KEYS if key in caps]


def _truthy_common(key: str, value: object) -> bool:
    if value is None:
        return False
    if key in {"keywords", "location"} and isinstance(value, str) and not value.strip():
        return False
    if key == "remote" and value is False:
        return False
    if key != "date_posted_days":
        return True
    return isinstance(value, int) and value > 0


def sanitize_overrides(raw: object) -> dict[str, dict[str, Any]]:
    """Keep source → {field: primitive} maps; drop anything else."""
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for source_id, payload in raw.items():
        if not isinstance(source_id, str):
            continue
        sid = source_id.strip().lower()
        if not sid or not isinstance(payload, dict):
            continue
        fields: dict[str, Any] = {}
        for key, value in payload.items():
            name = str(key).strip()
            if not name or not isinstance(value, _OVERRIDE_VALUE_TYPES):
                continue
            fields[name] = value
        if fields:
            out[sid] = fields
    return out


def resolve_source_query(
    source_id: str,
    *,
    keywords: str,
    location: str,
    max_results: int,
    remote: bool | None = None,
    date_posted_days: int | None = None,
    source_overrides: dict[str, dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """Build adapter kwargs for one source. Never raises on stale fields.

    Returns ``(params, dropped)`` where ``dropped`` names ignored common keys
    and ``source.field`` override keys.
    """
    caps = capabilities_for(source_id)
    dropped: list[str] = []
    common: dict[str, Any] = {
        "keywords": keywords,
        "location": location,
        "max_results": max_results,
        "remote": remote,
        "date_posted_days": date_posted_days,
    }
    params: dict[str, Any] = {}
    for key in COMMON_FILTER_KEYS:
        value = common[key]
        if not _truthy_common(key, value) and key != "max_results":
            continue
        if key == "max_results":
            params[key] = max(1, min(int(max_results), 200))
            continue
        if key in caps:
            params[key] = value
        elif _truthy_common(key, value):
            dropped.append(key)

    overrides = sanitize_overrides(source_overrides).get(source_id.strip().lower(), {})
    for field, value in overrides.items():
        if field in caps:
            params[field] = value
        else:
            dropped.append(f"{source_id.strip().lower()}.{field}")
    return params, dropped
