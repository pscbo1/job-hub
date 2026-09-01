"""Typed sponsorship enrichment result. Independent of job source."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class SponsorshipStatus(StrEnum):
    """Role-level conclusion. Registry eligibility is not the same as a JD promise."""

    EXPLICIT_YES = "explicit_yes"
    EXPLICIT_NO = "explicit_no"
    EMPLOYER_ELIGIBLE = "employer_eligible"
    UNKNOWN = "unknown"


class SponsorshipEvidence(BaseModel):
    """One traceable fact (registry row or JD snippet)."""

    kind: str
    rule: str = ""
    snippet: str = ""
    country: str | None = None
    registry_name: str | None = None
    registry_source: str | None = None
    matched_name: str | None = None
    matched_id: str | None = None


class SponsorshipInfo(BaseModel):
    """Visa / work-permit / employer-sponsorship stored on ``jobs.sponsorship``.

    CN market jobs may leave this empty. EN and Global jobs should prefer filling
    it when a JD phrase or official register match is available. Never holds user
    country prefs. Display and enrichment live in ``job_sentinel.sponsorship``
    and the Job Pool toggle; do not remove or redesign them from pipeline PRs.
    """

    status: SponsorshipStatus = SponsorshipStatus.UNKNOWN
    country: str | None = None
    registry_match: bool = False
    registry_name: str | None = None
    visa_route: str | None = None
    relocation_support: bool | None = None
    evidence: list[SponsorshipEvidence] = Field(default_factory=list)
    confidence: float = 0.0
    enriched_at: datetime | None = None

    def as_store(self) -> dict[str, Any]:
        payload = self.model_dump(mode="json")
        payload["status"] = self.status.value
        return payload


def empty_sponsorship() -> SponsorshipInfo:
    return SponsorshipInfo()


def now_utc() -> datetime:
    return datetime.now(tz=UTC)
