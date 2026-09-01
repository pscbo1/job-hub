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
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

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


class JobEngagement(StrEnum):
    """Job-side follow-up intent. Not an application lifecycle.

    ``None`` in the DB means Discovery-only (new ingest). Applied / interview /
    offer / closed live on Application, never on Job.
    """

    REFERENCE = "reference"
    UNDER_STUDY = "under_study"
    TO_DO = "to_do"


class CloseReason(StrEnum):
    """Application close reasons. Never ``rejected``."""

    NOT_SELECTED = "not_selected"
    NO_RESPONSE = "no_response"
    WITHDREW = "withdrew"
    OTHER = "other"


CLOSE_REASON_LABELS_ZH: dict[CloseReason, str] = {
    CloseReason.NOT_SELECTED: "未录用",
    CloseReason.NO_RESPONSE: "无回复",
    CloseReason.WITHDREW: "主动结束",
    CloseReason.OTHER: "其他",
}


class JobTask(BaseModel):
    """Checklist item on a Job (OA, interview prep). Not an Application stage."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    job_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    due_at: date | None = Field(default=None)
    done: bool = Field(default=False)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))

    @field_validator("title", mode="before")
    @classmethod
    def _strip_title(cls, v: object) -> str:
        return str(v).strip() if v else ""

    @field_validator("due_at", mode="before")
    @classmethod
    def _blank_due(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return v

    model_config = {"frozen": False}


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
    engagement: JobEngagement | None = Field(default=None)
    favorite: bool = Field(default=False, description="Product Save. Independent of engagement.")
    comment: str = Field(default="")
    next_step: str = Field(default="")
    deadline: datetime | None = Field(default=None)
    follow_up_at: datetime | None = Field(default=None)
    dismissed_at: datetime | None = Field(default=None)
    dismissed_note: str = Field(default="")
    archived_at: datetime | None = Field(default=None)
    archive_reason: str = Field(default="")
    last_activity_at: datetime | None = Field(
        default=None,
        description="Last user tracking or task edit. Collectors never bump this.",
    )
    tasks: list[JobTask] = Field(default_factory=list)
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

    @model_validator(mode="before")
    @classmethod
    def _accept_legacy_status(cls, data: object) -> object:
        """Map constructor ``status`` onto ``engagement``. Reject lifecycle values."""
        if not isinstance(data, dict):
            return data
        if "engagement" in data:
            data.pop("status", None)
            return data
        if "status" not in data:
            return data
        raw = data.pop("status")
        if raw is None or raw == "":
            data["engagement"] = None
            return data
        value = raw.value if isinstance(raw, StrEnum) else str(raw)
        if value == "saved":
            data.setdefault("favorite", True)
            data["engagement"] = None
            return data
        data["engagement"] = value
        return data

    @field_validator("engagement", mode="before")
    @classmethod
    def _blank_engagement_is_none(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return v

    @computed_field  # type: ignore[prop-decorator]
    @property
    def status(self) -> JobEngagement | None:
        """Serialized alias of engagement for older Job Pool clients."""
        return self.engagement

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
    """Application lifecycle. Packet is not a stage. No rejected / archived stage."""

    DRAFT = "draft"
    APPLIED = "applied"
    INTERVIEW = "interview"
    OFFER = "offer"
    CLOSED = "closed"


_LEGACY_APPLICATION_STAGES: dict[str, ApplicationStage] = {
    "saved": ApplicationStage.DRAFT,
    "draft": ApplicationStage.DRAFT,
    "applied": ApplicationStage.APPLIED,
    "interviewing": ApplicationStage.INTERVIEW,
    "interview": ApplicationStage.INTERVIEW,
    "offer": ApplicationStage.OFFER,
    "closed": ApplicationStage.CLOSED,
    # Never keep rejected as a stage — map to closed; caller should set close_reason.
    "rejected": ApplicationStage.CLOSED,
    "archived": ApplicationStage.CLOSED,
}


class PacketSnapshot(BaseModel):
    """MaterialVersion bindings captured at Mark Submitted. Packet is not a stage."""

    binding_ids: list[str] = Field(default_factory=list)
    material_version_ids: list[str] = Field(default_factory=list)
    note: str = Field(default="")


class ApplicationSubmission(BaseModel):
    """One Mark Submitted / re-apply event. History is append-only."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    application_id: str
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    channel: str = Field(default="")
    packet_snapshot: PacketSnapshot = Field(default_factory=PacketSnapshot)
    notes: str = Field(default="")
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


class ApplicationEvent(BaseModel):
    """Append-only stage / close history. Current Application fields are a projection."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    application_id: str
    kind: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


class Application(BaseModel):
    """One Application per Job. Stage is draft | applied | interview | offer | closed."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    job_id: str | None = Field(default=None)
    title: str = Field(default="")
    employer: str = Field(default="")
    location: str = Field(default="")
    url: str = Field(default="")
    source: str = Field(default="")
    stage: ApplicationStage = Field(default=ApplicationStage.DRAFT)
    salary: str = Field(default="")
    applied_date: str = Field(default="")
    deadline: str = Field(default="")
    notes: str = Field(default="")
    close_reason: CloseReason | None = Field(default=None)
    close_note: str = Field(default="")
    posting_id: str | None = Field(default=None)
    resume_document_id: str | None = Field(default=None)
    deleted_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    raw_data: dict[str, Any] = Field(default_factory=dict)
    submissions: list[ApplicationSubmission] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _remap_legacy_stage(cls, data: object) -> object:
        if not isinstance(data, dict) or "stage" not in data:
            return data
        raw = data["stage"]
        if raw is None or raw == "":
            data["stage"] = ApplicationStage.DRAFT
            return data
        value = raw.value if isinstance(raw, StrEnum) else str(raw)
        if value in _LEGACY_APPLICATION_STAGES:
            data["stage"] = _LEGACY_APPLICATION_STAGES[value]
            if value == "rejected" and not data.get("close_reason"):
                data["close_reason"] = CloseReason.NOT_SELECTED
        return data

    @field_validator(
        "title",
        "employer",
        "location",
        "url",
        "source",
        "salary",
        "applied_date",
        "deadline",
        "notes",
        "close_note",
        mode="before",
    )
    @classmethod
    def _strip(cls, v: object) -> str:
        return str(v).strip() if v else ""

    @field_validator("job_id", "close_reason", mode="before")
    @classmethod
    def _blank_optional(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return v

    def touch(self) -> None:
        """Update ``updated_at`` to now (UTC)."""
        object.__setattr__(self, "updated_at", datetime.now(tz=UTC))

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    @property
    def has_been_submitted(self) -> bool:
        return bool(self.submissions) or self.stage != ApplicationStage.DRAFT

    model_config = {"frozen": False}


class Material(BaseModel):
    """Materials Library item. Full UI is out of scope; schema stub only."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    title: str = Field(default="")
    kind: str = Field(default="other")
    notes: str = Field(default="")
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


class MaterialVersion(BaseModel):
    """A version of a Material. Application Packet binds these, not the parent."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    material_id: str
    version_label: str = Field(default="")
    file_ref: str = Field(default="")
    url: str = Field(default="")
    notes: str = Field(default="")
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


class ApplicationMaterialBinding(BaseModel):
    """Packet membership: Application ↔ MaterialVersion."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    application_id: str
    material_version_id: str
    role: str = Field(default="")
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


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
