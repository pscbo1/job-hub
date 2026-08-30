"""Combine JD parser + registry; priority and failure isolation."""

from __future__ import annotations

from typing import TYPE_CHECKING

from job_sentinel.core.models import Job
from job_sentinel.db.repository import JobRepository
from job_sentinel.ingestion.contract import CollectorRecord
from job_sentinel.ingestion.pipeline import ingest_records
from job_sentinel.sponsorship.enrich import enrich_and_store, enrich_job
from job_sentinel.sponsorship.models import SponsorshipStatus
from job_sentinel.sponsorship.registry.catalog import list_providers
from job_sentinel.sponsorship.registry.index import SponsorIndex, index_from_rows
from job_sentinel.sponsorship.registry.nl import parse_nl_html
from job_sentinel.sponsorship.registry.store import replace_registry_rows
from job_sentinel.sponsorship.registry.uk import parse_uk_csv

if TYPE_CHECKING:
    from pathlib import Path

    import pytest

_UK_CSV = """Organisation Name,Town/City,County,Type & Rating,Route
DeepMind Technologies Limited,London,,Worker (A rating),Skilled Worker
"""

_NL_HTML = """
<table>
<tr><th scope="row">Adyen N.V.</th><td>34259528</td></tr>
</table>
"""


def _index() -> SponsorIndex:
    return index_from_rows(parse_uk_csv(_UK_CSV) + parse_nl_html(_NL_HTML))


def _job(**kwargs: object) -> Job:
    base: dict[str, object] = {
        "source": "linkedin",
        "source_job_id": "1",
        "title": "Engineer",
        "company": "Acme",
        "location": "London, United Kingdom",
        "country": "GB",
        "description": "Build things.",
    }
    base.update(kwargs)
    return Job(**base)  # type: ignore[arg-type]


def test_explicit_yes() -> None:
    info = enrich_job(
        _job(description="Visa sponsorship available for this role."),
        _index(),
    )
    assert info.status is SponsorshipStatus.EXPLICIT_YES
    assert info.evidence


def test_explicit_no_overrides_registry() -> None:
    info = enrich_job(
        _job(
            company="DeepMind Technologies Limited",
            description="We cannot provide visa sponsorship for this role.",
        ),
        _index(),
    )
    assert info.status is SponsorshipStatus.EXPLICIT_NO
    assert info.registry_match is True


def test_employer_eligible() -> None:
    info = enrich_job(
        _job(company="DeepMind Technologies Limited", description="Python backend."),
        _index(),
    )
    assert info.status is SponsorshipStatus.EMPLOYER_ELIGIBLE
    assert info.country == "GB"
    assert info.registry_name


def test_nl_employer_eligible() -> None:
    info = enrich_job(
        _job(
            company="Adyen N.V.",
            location="Amsterdam, Netherlands",
            country="NL",
            description="Payments platform.",
        ),
        _index(),
    )
    assert info.status is SponsorshipStatus.EMPLOYER_ELIGIBLE
    assert info.country == "NL"


def test_unknown_without_evidence() -> None:
    info = enrich_job(_job(company="No Such Co", location="Austin, TX", country="US"), _index())
    assert info.status is SponsorshipStatus.UNKNOWN
    assert info.registry_match is False


def test_relocation_separated() -> None:
    info = enrich_job(
        _job(description="We offer a relocation package. Python role."),
        _index(),
    )
    assert info.status is SponsorshipStatus.UNKNOWN
    assert info.relocation_support is True


def test_providers_are_pluggable() -> None:
    countries = {p.country for p in list_providers()}
    assert countries == {"GB", "NL"}


def test_same_company_two_sources(tmp_path: Path) -> None:
    repo = JobRepository(tmp_path / "jobs.db")
    try:
        rows = parse_uk_csv(_UK_CSV)
        replace_registry_rows(
            repo,
            registry_id=rows[0].registry_id,
            country="GB",
            registry_name=rows[0].registry_name,
            source_url=rows[0].source_url,
            downloaded_url="fixture",
            rows=rows,
        )
        linkedin = repo.upsert_job(
            _job(source="linkedin", source_job_id="li-1", company="DeepMind Technologies Limited")
        )
        ats = repo.upsert_job(
            _job(source="greenhouse", source_job_id="gh-1", company="DeepMind Technologies Limited")
        )
        a = enrich_and_store(repo, linkedin)
        b = enrich_and_store(repo, ats)
        assert a.sponsorship.status is SponsorshipStatus.EMPLOYER_ELIGIBLE
        assert b.sponsorship.status is SponsorshipStatus.EMPLOYER_ELIGIBLE
        assert a.sponsorship.registry_name == b.sponsorship.registry_name
    finally:
        repo.close()


def test_enrichment_failure_does_not_block_ingest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = JobRepository(tmp_path / "jobs.db")

    def boom(*_args: object, **_kwargs: object) -> Job:
        raise RuntimeError("registry down")

    monkeypatch.setattr("job_sentinel.ingestion.pipeline.enrich_and_store", boom)  # type: ignore[arg-type]
    try:
        result = ingest_records(
            repo,
            [
                CollectorRecord(
                    channel_key="linkedin",
                    title="SWE",
                    company="Acme",
                    source_url="https://www.linkedin.com/jobs/view/999888777",
                    location="London, UK",
                )
            ],
        )
        assert result.jobs_created == 1
        assert repo._db["jobs"].count == 1
    finally:
        repo.close()
