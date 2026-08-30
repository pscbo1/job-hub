"""Combine JD parser + official registry match. Isolated from collect failures."""

from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger

from job_sentinel.sponsorship.country import infer_countries
from job_sentinel.sponsorship.models import (
    SponsorshipEvidence,
    SponsorshipInfo,
    SponsorshipStatus,
    now_utc,
)
from job_sentinel.sponsorship.parser import parse_job_text
from job_sentinel.sponsorship.registry.store import load_index

if TYPE_CHECKING:
    from job_sentinel.core.models import Job
    from job_sentinel.db.repository import JobRepository
    from job_sentinel.sponsorship.registry.index import SponsorIndex

_CONF = {
    SponsorshipStatus.EXPLICIT_NO: 0.9,
    SponsorshipStatus.EXPLICIT_YES: 0.9,
    SponsorshipStatus.EMPLOYER_ELIGIBLE: 0.7,
    SponsorshipStatus.UNKNOWN: 0.0,
}


def enrich_job(job: Job, index: SponsorIndex) -> SponsorshipInfo:
    """Compute sponsorship for one job. Never raises for match/parse misses."""
    jd = parse_job_text(job.title, job.description)
    countries = _countries_for_job(job)
    hit = index.match(job.company, countries) if countries else None

    evidence: list[SponsorshipEvidence] = list(jd.evidence)
    if hit is not None:
        evidence.append(
            SponsorshipEvidence(
                kind="registry",
                rule="employer_on_register",
                snippet=hit.matched_name,
                country=hit.country,
                registry_name=hit.registry_name,
                registry_source=hit.source_url,
                matched_name=hit.matched_name,
                matched_id=hit.matched_id or None,
            )
        )

    if jd.status is SponsorshipStatus.EXPLICIT_NO:
        status = SponsorshipStatus.EXPLICIT_NO
        country = hit.country if hit is not None else _one_country(countries)
    elif jd.status is SponsorshipStatus.EXPLICIT_YES:
        status = SponsorshipStatus.EXPLICIT_YES
        country = hit.country if hit is not None else _one_country(countries)
    elif hit is not None:
        status = SponsorshipStatus.EMPLOYER_ELIGIBLE
        country = hit.country
    else:
        status = SponsorshipStatus.UNKNOWN
        country = _one_country(countries)

    visa_route = jd.visa_route or (hit.visa_route if hit is not None else None)
    if visa_route == "":
        visa_route = None

    return SponsorshipInfo(
        status=status,
        country=country,
        registry_match=hit is not None,
        registry_name=hit.registry_name if hit is not None else None,
        visa_route=visa_route,
        relocation_support=jd.relocation,
        evidence=evidence,
        confidence=_CONF[status],
        enriched_at=now_utc(),
    )


def enrich_and_store(repo: JobRepository, job: Job, index: SponsorIndex | None = None) -> Job:
    """Write enrichment onto the job row. Failures are logged and ignored."""
    try:
        info = enrich_job(job, index if index is not None else load_index(repo))
        stored = repo.update_hub_job_sponsorship(job.id, info)
        return stored if stored is not None else job
    except Exception as exc:
        logger.warning("Sponsorship enrichment skipped for job {}: {}", job.id, exc)
        return job


def enrich_stored_jobs(repo: JobRepository) -> int:
    """Recompute sponsorship for every canonical job using the local registry cache."""
    index = load_index(repo)
    updated = 0
    for job in repo.list_all_hub_jobs():
        enrich_and_store(repo, job, index)
        updated += 1
    return updated


def _countries_for_job(job: Job) -> frozenset[str]:
    found = set(infer_countries(job.location))
    code = (job.country or "").strip().upper()
    if code in {"GB", "UK"}:
        found.add("GB")
    elif code == "NL":
        found.add("NL")
    return frozenset(found)


def _one_country(countries: frozenset[str]) -> str | None:
    if len(countries) == 1:
        return next(iter(countries))
    return None
