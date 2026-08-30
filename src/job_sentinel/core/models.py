"""
core/models.py
──────────────
Core domain models for Job Sentinel.

All data flowing through the system — scraper → db → bot → notifier —
is typed as **pydantic v2** models.  This gives us:

  • Automatic validation and coercion at every boundary
  • JSON serialise / deserialise with ``model.model_dump_json()``
  • IDE autocompletion throughout the codebase
  • A clear, self-documenting API contract

Design note — why Pydantic v2 here instead of plain dataclasses?
  The scraper pulls raw strings from HTML.  Pydantic's validators let us
  normalise dates, strip whitespace, and enforce constraints at the point
  of construction rather than scattered across scraper + db + bot code.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator

from job_sentinel.sponsorship.models import SponsorshipInfo

# ─────────────────────────────────────────────────────────────────────────────
# Enumerations
# ─────────────────────────────────────────────────────────────────────────────


class ApplicationStatus(StrEnum):
    """
    Lifecycle stages of a job posting from the user's perspective.

    String values are stored verbatim in SQLite so the DB is
    human-readable with any external viewer.

    State machine:
        NEW → SEEN → APPLIED
              SEEN → IGNORED
        any  → CLOSED  (portal removed it)
    """

    NEW = "new"  # Just discovered; alert not yet sent
    SEEN = "seen"  # Alert sent via Telegram
    APPLIED = "applied"  # User marked as applied (/applied command)
    IGNORED = "ignored"  # User dismissed (/ignore command)
    CLOSED = "closed"  # No longer visible on the portal


class JobStatus(StrEnum):
    """V0 Job Pool lifecycle. ``None`` in the DB means unset (new ingest)."""

    SAVED = "saved"
    TO_DO = "to_do"
    APPLIED = "applied"
    CLOSED = "closed"
    REFERENCE = "reference"


def compute_job_fingerprint(company: str, title: str, location: str) -> str:
    """SHA-1 of normalized ``company|title|location`` (index helper, not unique)."""
    parts = (
        " ".join(company.split()).lower(),
        " ".join(title.split()).lower(),
        " ".join(location.split()).lower(),
    )
    payload = "|".join(parts)
    return hashlib.sha1(payload.encode("utf-8"), usedforsecurity=False).hexdigest()


def source_job_id_from_canonical_url(canonical_url: str) -> str:
    """Stable fallback when a source does not provide ``source_job_id``."""
    digest = hashlib.sha1(canonical_url.encode("utf-8"), usedforsecurity=False).hexdigest()
    return f"url:{digest}"


# ─────────────────────────────────────────────────────────────────────────────
# Core domain model
# ─────────────────────────────────────────────────────────────────────────────


class JobPosting(BaseModel):
    """
    A single job posting scraped from a portal.

    Attributes
    ----------
    posting_id : str
        Unique identifier from the portal (primary key in our DB).
    title : str
        Job / position title.
    employer : str
        Company or department name.
    location : str
        Work location (city, "Remote", etc.).
    job_type : str
        e.g. "Full-Time", "Part-Time", "On-Campus".
    posted_date : str
        Date string as shown on the portal.
    deadline : str
        Application deadline (empty if not listed).
    description_snippet : str
        First ~350 characters of the job description.
    portal_url : str
        Direct link to this posting on the portal.
    status : ApplicationStatus
        Tracking lifecycle status.
    discovered_at : datetime
        UTC timestamp when the scraper first found this posting.
    updated_at : datetime
        UTC timestamp of the most recent status change.
    keywords_matched : list[str]
        Which keyword filters matched this posting.
    source_adapter : str
        The adapter ID that produced this record (e.g. "12twenty").
    raw_data : dict
        Catch-all for extra fields; stored as JSON in SQLite.
    """

    posting_id: str = Field(..., min_length=1, description="Portal-assigned unique ID")
    title: str = Field(default="Untitled Position", description="Job title")
    employer: str = Field(default="", description="Employer / department name")
    location: str = Field(default="", description="Work location")
    job_type: str = Field(default="", description="Employment type")
    posted_date: str = Field(default="", description="Date posted (as shown on portal)")
    deadline: str = Field(default="", description="Application deadline")
    description_snippet: str = Field(default="", max_length=500, description="Short description")
    portal_url: str = Field(default="", description="Direct URL to this posting")
    status: ApplicationStatus = Field(default=ApplicationStatus.NEW)
    discovered_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    keywords_matched: list[str] = Field(default_factory=list)
    source_adapter: str = Field(default="", description="Adapter that produced this record")
    raw_data: dict[str, Any] = Field(default_factory=dict)

    # ── Validators ────────────────────────────────────────────────────────

    @field_validator("title", "employer", "location", "job_type", mode="before")
    @classmethod
    def strip_whitespace(cls, v: object) -> str:
        return str(v).strip() if v else ""

    @field_validator("description_snippet", mode="before")
    @classmethod
    def truncate_snippet(cls, v: object) -> str:
        raw = str(v).strip() if v else ""
        return raw[:350] + "…" if len(raw) > 350 else raw

    # ── Business logic ────────────────────────────────────────────────────

    def matches_keywords(self, keywords: list[str]) -> bool:
        """
        Return ``True`` if any keyword (case-insensitive) matches the
        title, employer, job_type, or description_snippet.

        Side-effect: updates ``self.keywords_matched`` with the hits.
        Calling with an empty list always returns ``True`` (no filter).
        """
        if not keywords:
            return True

        haystack = " ".join(
            [
                self.title,
                self.employer,
                self.job_type,
                self.description_snippet,
            ]
        ).lower()

        hits = [kw for kw in keywords if kw.lower() in haystack]
        # pydantic v2 models are immutable by default — use object.__setattr__
        object.__setattr__(self, "keywords_matched", hits)
        return bool(hits)

    def touch(self) -> None:
        """Update ``updated_at`` to now (UTC)."""
        object.__setattr__(self, "updated_at", datetime.now(tz=UTC))

    def __str__(self) -> str:
        return (
            f"JobPosting(id={self.posting_id!r}, "
            f"title={self.title!r}, "
            f"employer={self.employer!r}, "
            f"status={self.status.value})"
        )

    model_config = {"frozen": False}  # allow touch() mutations


class Job(BaseModel):
    """Canonical V0 job-pool row (table ``jobs``). Independent of ``JobPosting``."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    source: str = Field(..., min_length=1)
    source_job_id: str = Field(default="")
    job_url: str = Field(default="")
    canonical_url: str = Field(default="")
    title: str = Field(default="")
    company: str = Field(default="")
    location: str = Field(default="")
    description: str = Field(default="")
    employment_type: str = Field(default="")
    salary: str = Field(default="")
    published_at: datetime | None = Field(default=None)
    discovered_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    fingerprint: str = Field(default="")
    status: JobStatus | None = Field(default=None)
    match_score: float | None = Field(default=None)
    market: str = Field(
        default="",
        description="source_market copied from the collect source (cn, en, or global).",
    )
    filter_state: str = Field(default="included")
    filter_reasons: list[str] = Field(default_factory=list)
    sponsorship: SponsorshipInfo = Field(default_factory=SponsorshipInfo)
    country: str = Field(
        default="",
        description="Job location country (ISO/EU/XX). Independent of source_market.",
    )
    country_name: str = Field(default="")
    is_remote: bool = Field(default=False)

    @field_validator("status", mode="before")
    @classmethod
    def _blank_status_is_none(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return v

    model_config = {"frozen": False}


class JobRaw(BaseModel):
    """Append-only raw ingest row (table ``jobs_raw``)."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    source: str = Field(..., min_length=1)
    source_job_id: str | None = Field(default=None)
    source_url: str = Field(default="")
    raw_payload: dict[str, Any] = Field(default_factory=dict)
    validation_state: str = Field(default="valid")
    validation_reasons: list[str] = Field(default_factory=list)
    collected_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    processed_at: datetime | None = Field(default=None)
    job_id: str | None = Field(default=None)
    run_id: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))

    @field_validator("source_job_id", mode="before")
    @classmethod
    def _blank_source_job_id(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return v

    model_config = {"frozen": False}


# ─────────────────────────────────────────────────────────────────────────────
# Application tracker
# ─────────────────────────────────────────────────────────────────────────────


class ApplicationStage(StrEnum):
    """
    Lifecycle stages for a tracked job application (Huntr/Teal-style).

    State machine is intentionally open-ended — the user drives transitions.
    """

    SAVED = "saved"
    APPLIED = "applied"
    INTERVIEWING = "interviewing"
    OFFER = "offer"
    REJECTED = "rejected"
    ARCHIVED = "archived"


class Application(BaseModel):
    """
    A tracked job application, either linked to a scraped JobPosting or entered
    manually.

    Attributes
    ----------
    id : str
        UUID4 hex, primary key.
    title : str
        Job/position title.
    employer : str
        Company or department name.
    location : str
        Work location.
    url : str
        Direct link to the posting.
    source : str
        Where the application came from (e.g. "12twenty", "manual", "adzuna").
    stage : ApplicationStage
        Current stage in the application funnel.
    salary : str
        Salary range / offer (free-form).
    applied_date : str
        ISO date string when the user submitted the application.
    deadline : str
        Application deadline.
    notes : str
        Free-form notes.
    posting_id : str | None
        FK into job_postings.posting_id when created from a scraped posting.
    resume_document_id : str | None
        FK into generated_documents.id for the résumé used.
    created_at : datetime
        UTC timestamp of record creation.
    updated_at : datetime
        UTC timestamp of the most recent update.
    raw_data : dict
        Catch-all for extra fields.
    """

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    title: str = Field(default="")
    employer: str = Field(default="")
    location: str = Field(default="")
    url: str = Field(default="")
    source: str = Field(default="")
    stage: ApplicationStage = Field(default=ApplicationStage.SAVED)
    salary: str = Field(default="")
    applied_date: str = Field(default="")
    deadline: str = Field(default="")
    notes: str = Field(default="")
    posting_id: str | None = Field(default=None)
    resume_document_id: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    raw_data: dict[str, Any] = Field(default_factory=dict)

    @field_validator("title", "employer", "location", mode="before")
    @classmethod
    def _strip(cls, v: object) -> str:
        return str(v).strip() if v else ""

    def touch(self) -> None:
        """Update ``updated_at`` to now (UTC)."""
        object.__setattr__(self, "updated_at", datetime.now(tz=UTC))

    model_config = {"frozen": False}


# ─────────────────────────────────────────────────────────────────────────────
# Generated document library
# ─────────────────────────────────────────────────────────────────────────────


class DocumentKind(StrEnum):
    """The type of generated document."""

    RESUME = "resume"
    COVER_LETTER = "cover_letter"


class GeneratedDocument(BaseModel):
    """
    A record of every résumé or cover-letter the engine builds.

    Attributes
    ----------
    id : str
        UUID4 hex, primary key.
    kind : DocumentKind
        Whether this is a résumé or cover letter.
    label : str
        Short user-visible label (optional).
    title : str
        Job title the document was tailored for.
    employer : str
        Company the document was tailored for.
    file_path : str
        Absolute or data-dir-relative path to the output PDF.
    tex_path : str | None
        Path to the intermediate .tex file, if kept.
    ats_score : float | None
        Keyword coverage score (0–100) from the tailor, if available.
    provider : str
        LLM provider/model used (e.g. "ollama/llama3"), or "deterministic".
    tailored : bool
        Whether an AI tailor was applied.
    job_snippet : str
        First ~300 chars of the JD used for tailoring.
    application_id : str | None
        FK into applications.id, if linked.
    posting_id : str | None
        FK into job_postings.posting_id, if linked.
    created_at : datetime
        UTC timestamp of generation.
    raw_data : dict
        Catch-all for extra metadata.
    """

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    kind: DocumentKind = Field(default=DocumentKind.RESUME)
    label: str = Field(default="")
    title: str = Field(default="")
    employer: str = Field(default="")
    file_path: str = Field(default="")
    tex_path: str | None = Field(default=None)
    ats_score: float | None = Field(default=None)
    provider: str = Field(default="")
    tailored: bool = Field(default=False)
    job_snippet: str = Field(default="")
    application_id: str | None = Field(default=None)
    posting_id: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    raw_data: dict[str, Any] = Field(default_factory=dict)

    model_config = {"frozen": False}


# ─────────────────────────────────────────────────────────────────────────────
# Supporting value objects
# ─────────────────────────────────────────────────────────────────────────────


class ScrapeResult(BaseModel):
    """
    Aggregated outcome of a single scrape cycle.

    Returned by the scheduler and used for logging / Telegram summaries.
    """

    adapter: str
    total_scraped: int = 0
    new_count: int = 0
    updated_count: int = 0
    closed_count: int = 0
    errors: list[str] = Field(default_factory=list)
    duration_seconds: float = 0.0

    @property
    def had_errors(self) -> bool:
        return bool(self.errors)

    def __str__(self) -> str:
        return (
            f"ScrapeResult(adapter={self.adapter}, "
            f"total={self.total_scraped}, new={self.new_count}, "
            f"errors={len(self.errors)})"
        )
