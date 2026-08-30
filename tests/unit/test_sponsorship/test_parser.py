"""Deterministic JD sponsorship phrases."""

from __future__ import annotations

from job_sentinel.sponsorship.models import SponsorshipStatus
from job_sentinel.sponsorship.parser import parse_job_text


def test_positive_phrases() -> None:
    samples = [
        "Visa sponsorship available for this role.",
        "Sponsorship provided.",
        "We can sponsor skilled workers.",
        "Relocation and visa support is offered.",
        "Skilled Worker sponsorship is available.",
        "Work visa sponsorship for qualified hires.",
        "The team offers visa support.",
    ]
    for text in samples:
        parsed = parse_job_text(text)
        assert parsed.status is SponsorshipStatus.EXPLICIT_YES, text
        assert parsed.evidence


def test_negative_phrases() -> None:
    samples = [
        "No sponsorship.",
        "We are unable to sponsor.",
        "Sponsorship is not available.",
        "No visa sponsorship available.",
        "Applicants must already have the right to work in the UK.",
        "Must have unrestricted work authorization.",
        "We cannot provide visa sponsorship for this role.",
    ]
    for text in samples:
        parsed = parse_job_text(text)
        assert parsed.status is SponsorshipStatus.EXPLICIT_NO, text


def test_negative_overrides_positive() -> None:
    text = "We can sponsor in some teams. No visa sponsorship available for this role."
    assert parse_job_text(text).status is SponsorshipStatus.EXPLICIT_NO


def test_relocation_is_not_sponsorship() -> None:
    parsed = parse_job_text("We offer a relocation package for this role.")
    assert parsed.status is None
    assert parsed.relocation is True


def test_ambiguous_not_forced() -> None:
    parsed = parse_job_text("Questions about visas can be sent to HR.")
    assert parsed.status is None
