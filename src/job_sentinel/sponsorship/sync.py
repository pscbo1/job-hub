"""Download official sponsor lists into the local DB cache."""

from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger

from job_sentinel.sponsorship.registry import RegistrySyncMeta, SponsorRegistryProvider
from job_sentinel.sponsorship.registry.catalog import get_provider, list_providers
from job_sentinel.sponsorship.registry.store import record_registry_error, replace_registry_rows

if TYPE_CHECKING:
    from job_sentinel.db.repository import JobRepository


def sync_registries(
    repo: JobRepository,
    *,
    countries: list[str] | None = None,
) -> list[RegistrySyncMeta]:
    """Fetch selected (or all) official registries. One failure does not abort others."""
    providers = _select_providers(countries)
    results: list[RegistrySyncMeta] = []
    for provider in providers:
        results.append(_sync_one(repo, provider))
    return results


def _select_providers(countries: list[str] | None) -> list[SponsorRegistryProvider]:
    if not countries:
        return list(list_providers())
    out: list[SponsorRegistryProvider] = []
    missing: list[str] = []
    for raw in countries:
        provider = get_provider(raw)
        if provider is None:
            missing.append(raw)
            continue
        out.append(provider)
    if missing:
        raise ValueError(f"Unknown sponsor registry country/id: {', '.join(missing)}")
    return out


def _sync_one(repo: JobRepository, provider: SponsorRegistryProvider) -> RegistrySyncMeta:
    try:
        rows = provider.fetch_employers()
        downloaded = rows[0].downloaded_url if rows else provider.source_url
        meta = replace_registry_rows(
            repo,
            registry_id=provider.registry_id,
            country=provider.country,
            registry_name=provider.registry_name,
            source_url=provider.source_url,
            downloaded_url=downloaded,
            rows=rows,
        )
        logger.info(
            "Sponsor registry synced | {} | rows={}",
            provider.registry_id,
            meta.row_count,
        )
        return meta
    except Exception as exc:
        msg = str(exc)
        logger.warning("Sponsor registry {} failed: {}", provider.registry_id, msg)
        record_registry_error(
            repo,
            registry_id=provider.registry_id,
            country=provider.country,
            registry_name=provider.registry_name,
            source_url=provider.source_url,
            error=msg,
        )
        return RegistrySyncMeta(
            registry_id=provider.registry_id,
            country=provider.country,
            registry_name=provider.registry_name,
            source_url=provider.source_url,
            error=msg,
        )
