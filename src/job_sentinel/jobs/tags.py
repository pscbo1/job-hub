"""Light free-text direction tags on Application. Not a taxonomy."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Sequence

    from job_sentinel.core.models import Application

MAX_TAG_LENGTH = 40
MAX_APPLICATION_TAGS = 20


def normalize_application_tags(
    values: Sequence[object],
    *,
    known: Sequence[str] = (),
) -> list[str]:
    """Trim, drop empties, reuse known spellings, and cap length/count."""
    reused = {item.casefold(): item for item in known if item.strip()}
    out: list[str] = []
    seen: set[str] = set()
    for raw in values:
        text = " ".join(str(raw).split())
        if not text:
            continue
        text = text[:MAX_TAG_LENGTH]
        text = reused.get(text.casefold(), text)
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= MAX_APPLICATION_TAGS:
            break
    return out


def parse_stored_tags(value: object) -> list[str]:
    """Read a JSON list or a Python list from storage."""
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return normalize_application_tags(value)
    if isinstance(value, str):
        import json

        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return normalize_application_tags(parsed)
        return []
    return []


def unique_application_tags(apps: Sequence[Application]) -> list[str]:
    """First-seen unique tags from active applications. No admin vocabulary."""
    known: list[str] = []
    seen: set[str] = set()
    for app in apps:
        for tag in app.tags:
            key = tag.casefold()
            if key in seen:
                continue
            seen.add(key)
            known.append(tag)
    return known


def application_matches_tags(app: Application, selected: Sequence[str]) -> bool:
    """Empty filter matches all. Otherwise the application has any selected tag."""
    wanted = normalize_application_tags(selected)
    if not wanted:
        return True
    have = {tag.casefold() for tag in app.tags}
    return any(item.casefold() in have for item in wanted)
