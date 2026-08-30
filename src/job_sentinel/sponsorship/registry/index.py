"""Exact lookup of normalized company keys against cached registry rows."""

from __future__ import annotations

from job_sentinel.sponsorship.company import company_keys
from job_sentinel.sponsorship.registry import RegistryMatch, SponsorEmployer, SponsorIndexEntry


class SponsorIndex:
    """In-memory map: country → name_key → entry. Ambiguous keys never match."""

    def __init__(self) -> None:
        self._by_country: dict[str, dict[str, SponsorIndexEntry]] = {}

    def add(self, row: SponsorEmployer) -> None:
        keys = company_keys(row.employer_name)
        bucket = self._by_country.setdefault(row.country, {})
        for key in keys:
            existing = bucket.get(key)
            if existing is None:
                bucket[key] = SponsorIndexEntry(
                    country=row.country,
                    registry_id=row.registry_id,
                    registry_name=row.registry_name,
                    source_url=row.source_url,
                    employer_name=row.employer_name,
                    employer_id=row.employer_id,
                    visa_route=row.visa_route,
                )
                continue
            same_org = (
                existing.employer_id and row.employer_id and existing.employer_id == row.employer_id
            ) or existing.employer_name.casefold() == row.employer_name.casefold()
            if same_org:
                routes = {p.strip() for p in existing.visa_route.split(";") if p.strip()}
                if row.visa_route.strip():
                    routes.add(row.visa_route.strip())
                existing.visa_route = "; ".join(sorted(routes))
                continue
            existing.ambiguous = True

    def match(self, company: str, countries: frozenset[str]) -> RegistryMatch | None:
        for key in company_keys(company):
            for country in sorted(countries):
                entry = self._by_country.get(country, {}).get(key)
                if entry is None or entry.ambiguous:
                    continue
                return RegistryMatch(
                    country=entry.country,
                    registry_id=entry.registry_id,
                    registry_name=entry.registry_name,
                    source_url=entry.source_url,
                    matched_name=entry.employer_name,
                    matched_id=entry.employer_id,
                    visa_route=entry.visa_route,
                    keys=[key],
                )
        return None


def index_from_rows(rows: list[SponsorEmployer]) -> SponsorIndex:
    index = SponsorIndex()
    for row in rows:
        index.add(row)
    return index
