"""Company and vertical rows in ``source_registry``.

YAML ``company_ats.yaml`` (plus built-in career pages like Tencent) seeds the
company class once. Vertical channels are a separate class — never mixed into
the company table or Auto Collect. After seed, new rows are DB-only.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from job_sentinel.core.models import CompanySource
from job_sentinel.ingestion.ats_board_client import resolve_board
from job_sentinel.ingestion.collect_sources import (
    CollectSource,
    IntegrationMethod,
    load_company_ats_sources,
)
from job_sentinel.jobs.tags import normalize_application_tags

if TYPE_CHECKING:
    from collections.abc import Sequence

    from job_sentinel.db.repository import JobRepository
    from job_sentinel.markets import SourceMarket

_SEED_META_KEY = "source_registry_seeded"
_ID_SAFE = re.compile(r"[^a-z0-9]+")
MAX_COMPANY_TAGS = 20
VERTICAL_CHANNEL_TYPES = frozenset({"wechat", "community", "other"})
COMPANY_KIND = "company"
VERTICAL_KIND = "vertical"


class SourceRegistryError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def seed_source_registry(repo: JobRepository) -> None:
    """Copy YAML + built-in career pages into ``source_registry`` once."""
    if repo.get_meta(_SEED_META_KEY) == "1":
        return
    from job_sentinel.ingestion.collect_sources import builtin_career_page_sources

    existing = {row.id for row in repo.list_company_sources()}
    for spec in (*builtin_career_page_sources(), *load_company_ats_sources()):
        if spec.id in existing:
            continue
        repo.insert_company_source(_collect_to_company(spec))
        existing.add(spec.id)
    repo.set_meta(_SEED_META_KEY, "1")


def list_company_sources(
    repo: JobRepository,
    *,
    tag: str | None = None,
) -> list[CompanySource]:
    seed_source_registry(repo)
    rows = [row for row in repo.list_company_sources() if row.kind == COMPANY_KIND]
    wanted = (tag or "").strip()
    if not wanted:
        return rows
    key = wanted.casefold()
    return [row for row in rows if any(item.casefold() == key for item in row.tags)]


def unique_company_tags(rows: Sequence[CompanySource]) -> list[str]:
    return normalize_application_tags([tag for row in rows for tag in row.tags])


def list_company_collect_sources(repo: JobRepository) -> list[CollectSource]:
    """CollectSource rows for career pages currently in the table."""
    seed_source_registry(repo)
    return [
        _company_to_collect(row) for row in repo.list_company_sources() if row.kind == COMPANY_KIND
    ]


def list_vertical_channels(
    repo: JobRepository,
    *,
    tag: str | None = None,
    channel_type: str | None = None,
) -> list[CompanySource]:
    seed_source_registry(repo)
    rows = list(repo.list_source_registry(kind=VERTICAL_KIND))
    wanted_type = (channel_type or "").strip().casefold()
    if wanted_type:
        rows = [row for row in rows if row.channel_type.casefold() == wanted_type]
    wanted_tag = (tag or "").strip()
    if wanted_tag:
        key = wanted_tag.casefold()
        rows = [row for row in rows if any(item.casefold() == key for item in row.tags)]
    return rows


def create_vertical_channel(
    repo: JobRepository,
    *,
    name: str,
    channel_type: str = "other",
    handle: str = "",
    enabled: bool = True,
    tags: Sequence[object] = (),
    note: str = "",
) -> CompanySource:
    seed_source_registry(repo)
    label = name.strip()
    if not label:
        raise SourceRegistryError("Channel name is required")
    typed = _require_channel_type(channel_type)
    source_id = _unique_company_id(repo, label, fallback="channel")
    row = CompanySource(
        id=source_id,
        company=label,
        kind=VERTICAL_KIND,
        channel_type=typed,
        handle=handle.strip(),
        collect_cn=False,
        collect_en=False,
        enabled=enabled,
        include_in_run=False,
        tags=normalize_application_tags(tags)[:MAX_COMPANY_TAGS],
        note=note.strip(),
        runnable=False,
        collector_id=source_id,
        integration="ats_board",
    )
    return repo.insert_company_source(row)


def update_vertical_channel(
    repo: JobRepository,
    source_id: str,
    **fields: Any,
) -> CompanySource:
    seed_source_registry(repo)
    current = repo.get_company_source(source_id)
    if current is None or current.kind != VERTICAL_KIND:
        raise SourceRegistryError("Vertical channel not found", status_code=404)
    updates: dict[str, Any] = {}
    if "name" in fields and fields["name"] is not None:
        label = str(fields["name"]).strip()
        if not label:
            raise SourceRegistryError("Channel name is required")
        updates["company"] = label
    if "company" in fields and fields["company"] is not None:
        label = str(fields["company"]).strip()
        if not label:
            raise SourceRegistryError("Channel name is required")
        updates["company"] = label
    if "channel_type" in fields and fields["channel_type"] is not None:
        updates["channel_type"] = _require_channel_type(str(fields["channel_type"]))
    if "handle" in fields and fields["handle"] is not None:
        updates["handle"] = str(fields["handle"]).strip()
    if "enabled" in fields and fields["enabled"] is not None:
        updates["enabled"] = bool(fields["enabled"])
    if "tags" in fields and fields["tags"] is not None:
        updates["tags"] = normalize_application_tags(fields["tags"])[:MAX_COMPANY_TAGS]
    if "note" in fields and fields["note"] is not None:
        updates["note"] = str(fields["note"]).strip()
    updated = repo.update_company_source(source_id, **updates)
    if updated is None:
        raise SourceRegistryError("Vertical channel not found", status_code=404)
    return updated


def _require_channel_type(raw: str) -> str:
    value = raw.strip().casefold() or "other"
    if value not in VERTICAL_CHANNEL_TYPES:
        raise SourceRegistryError("Type must be wechat, community, or other")
    return value


def create_company_source(
    repo: JobRepository,
    *,
    company: str,
    collect_cn: bool = False,
    collect_en: bool = False,
    enabled: bool = True,
    include_in_run: bool = False,
    tags: Sequence[object] = (),
    note: str = "",
    careers_url: str = "",
) -> CompanySource:
    seed_source_registry(repo)
    name = company.strip()
    if not name:
        raise SourceRegistryError("Company name is required")
    cn, en = _require_markets(collect_cn, collect_en)
    source_id = _unique_company_id(repo, name)
    ats, slug, url, runnable, integration = _resolve_optional_board(careers_url)
    row = CompanySource(
        id=source_id,
        company=name,
        kind=COMPANY_KIND,
        collect_cn=cn,
        collect_en=en,
        enabled=enabled,
        include_in_run=include_in_run,
        tags=normalize_application_tags(tags)[:MAX_COMPANY_TAGS],
        note=note.strip(),
        careers_url=url,
        runnable=runnable,
        collector_id=source_id,
        integration=integration,
        ats=ats,
        slug=slug,
    )
    return repo.insert_company_source(row)


def update_company_source(
    repo: JobRepository,
    source_id: str,
    **fields: Any,
) -> CompanySource:
    seed_source_registry(repo)
    current = repo.get_company_source(source_id)
    if current is None or current.kind != COMPANY_KIND:
        raise SourceRegistryError("Company source not found", status_code=404)
    updates: dict[str, Any] = {}
    if "company" in fields and fields["company"] is not None:
        name = str(fields["company"]).strip()
        if not name:
            raise SourceRegistryError("Company name is required")
        updates["company"] = name
    if "collect_cn" in fields or "collect_en" in fields:
        cn = bool(fields["collect_cn"]) if "collect_cn" in fields else current.collect_cn
        en = bool(fields["collect_en"]) if "collect_en" in fields else current.collect_en
        cn, en = _require_markets(cn, en)
        updates["collect_cn"] = cn
        updates["collect_en"] = en
    if "enabled" in fields and fields["enabled"] is not None:
        updates["enabled"] = bool(fields["enabled"])
    if "include_in_run" in fields and fields["include_in_run"] is not None:
        updates["include_in_run"] = bool(fields["include_in_run"])
    if "tags" in fields and fields["tags"] is not None:
        updates["tags"] = normalize_application_tags(fields["tags"])[:MAX_COMPANY_TAGS]
    if "note" in fields and fields["note"] is not None:
        updates["note"] = str(fields["note"]).strip()
    if "careers_url" in fields and fields["careers_url"] is not None:
        ats, slug, url, runnable, integration = _resolve_optional_board(str(fields["careers_url"]))
        if current.integration == "http_json" and not url:
            # Keep wired collectors (Tencent) runnable without a public ATS URL.
            updates["careers_url"] = None
        else:
            updates["ats"] = ats
            updates["slug"] = slug
            updates["careers_url"] = url
            updates["runnable"] = runnable
            if integration == "ats_board" or current.integration == "ats_board":
                updates["integration"] = integration
    updated = repo.update_company_source(source_id, **updates)
    if updated is None:
        raise SourceRegistryError("Company source not found", status_code=404)
    return updated


def _require_markets(collect_cn: bool, collect_en: bool) -> tuple[bool, bool]:
    if not collect_cn and not collect_en:
        raise SourceRegistryError("Select CN, EN, or both")
    return collect_cn, collect_en


def _unique_company_id(repo: JobRepository, company: str, *, fallback: str = "company") -> str:
    base = _ID_SAFE.sub("-", company.strip().lower()).strip("-") or fallback
    candidate = base
    n = 2
    while repo.get_company_source(candidate) is not None:
        candidate = f"{base}-{n}"
        n += 1
    return candidate


def _resolve_optional_board(
    careers_url: str,
) -> tuple[str | None, str | None, str | None, bool, str]:
    url = careers_url.strip()
    if not url:
        return None, None, None, False, "ats_board"
    try:
        ats, slug = resolve_board(ats="", slug="", careers_url=url)
    except ValueError as exc:
        raise SourceRegistryError(str(exc)) from exc
    return ats, slug, url, True, "ats_board"


def _collect_to_company(spec: CollectSource) -> CompanySource:
    cn = spec.collect_cn
    en = spec.collect_en
    return CompanySource(
        id=spec.id,
        company=(spec.company or spec.label).strip() or spec.id,
        kind=COMPANY_KIND,
        collect_cn=cn,
        collect_en=en,
        enabled=spec.enabled,
        include_in_run=False,
        tags=[],
        note=spec.notes,
        careers_url=spec.careers_url,
        runnable=spec.runnable,
        collector_id=spec.collector_id,
        integration=spec.integration,
        ats=spec.ats,
        slug=spec.slug,
    )


def _as_integration(value: str) -> IntegrationMethod:
    if value in {"mcp_jobs", "ats_board", "http_json", "public_html", "ssr_json"}:
        return value  # type: ignore[return-value]
    return "ats_board"


def _company_to_collect(row: CompanySource) -> CollectSource:
    if row.kind != COMPANY_KIND:
        raise SourceRegistryError("Vertical channels are not collectable")
    return CollectSource(
        id=row.id,
        label=f"{row.company} Careers",
        kind="career_page",
        collector_id=row.collector_id or row.id,
        integration=_as_integration(row.integration),
        market=_market_from_flags(row.collect_cn, row.collect_en),
        notes=row.note,
        enabled=row.enabled,
        runnable=row.runnable,
        ats=row.ats,
        slug=row.slug,
        company=row.company,
        careers_url=row.careers_url,
        collect_cn=row.collect_cn,
        collect_en=row.collect_en,
        include_in_run=row.include_in_run,
        tags=list(row.tags),
    )


def _market_from_flags(collect_cn: bool, collect_en: bool) -> SourceMarket:
    if collect_cn and not collect_en:
        return "cn"
    if collect_en and not collect_cn:
        return "en"
    return "global"
