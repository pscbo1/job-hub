"""Country registry plugins. Add a provider here — do not copy the enrichment pipeline."""

from __future__ import annotations

from typing import TYPE_CHECKING

from job_sentinel.sponsorship.registry.nl import NlIndRecognisedSponsors
from job_sentinel.sponsorship.registry.uk import UkLicensedSponsors

if TYPE_CHECKING:
    from job_sentinel.sponsorship.registry import SponsorRegistryProvider

_PROVIDERS: tuple[SponsorRegistryProvider, ...] = (
    UkLicensedSponsors(),
    NlIndRecognisedSponsors(),
)


def list_providers() -> tuple[SponsorRegistryProvider, ...]:
    return _PROVIDERS


def get_provider(country_or_id: str) -> SponsorRegistryProvider | None:
    key = country_or_id.strip()
    upper = key.upper()
    lower = key.lower()
    for provider in _PROVIDERS:
        if provider.country == upper or provider.registry_id == lower:
            return provider
    return None
