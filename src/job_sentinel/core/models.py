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
from typing import Any, Literal

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
    """Legacy Job-side intent. Read-compat only.

    Sealed Part 1 (2026-09-01): Reference is an independent boolean. Under Study
    and To Do are not user-facing. New writes should leave ``engagement`` null.
    Applied / interview / offer / closed live on Application, never on Job.
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


class TaskReminderKind(StrEnum):
    """In-app reminder node on a due-dated job_task. Not email or Job DDL."""

    ADVANCE = "advance"
    DUE = "due"


class TaskReminder(BaseModel):
    """One calendar-date reminder for a task + due-date cycle."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    task_id: str = Field(..., min_length=1)
    due_date: date
    reminder_on: date
    kind: TaskReminderKind = TaskReminderKind.ADVANCE
    enabled: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    in_app_triggered_at: datetime | None = None
    in_app_skipped_at: datetime | None = None
    read_at: datetime | None = None

    model_config = {"frozen": False}


class TaskAttachment(BaseModel):
    """File attached to one checklist task (interview or take-home material)."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    task_id: str = Field(..., min_length=1)
    original_filename: str = Field(default="")
    file_ref: str = Field(default="")
    content_type: str = Field(default="application/octet-stream")
    byte_size: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


class JobTask(BaseModel):
    """Checklist item on a Job (OA, interview prep). Not an Application stage.

    One ``job_tasks`` row can appear on Tasks and on a linked Application.
    Completing a task does not Mark submitted or change Application stage.
    """

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    job_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    due_at: date | None = Field(default=None)
    done: bool = Field(default=False)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    application_id: str | None = Field(default=None)
    notes: str | None = Field(default=None)
    source_url: str | None = Field(default=None)
    reminders: list[TaskReminder] = Field(default_factory=list)
    attachments: list[TaskAttachment] = Field(default_factory=list)

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

    @field_validator("application_id", "notes", "source_url", mode="before")
    @classmethod
    def _blank_optional(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return str(v).strip() if isinstance(v, str) else v

    model_config = {"frozen": False}


class ApplicationCommNote(BaseModel):
    """Lightweight communication note. Not a CRM timeline and never auto-sent.

    ``created_at`` is the occurred-at time and is never rewritten on Cancel Draft.
    ``job_id`` keeps the note visible from the Job after the Application is gone.
    """

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    application_id: str | None = Field(default=None)
    job_id: str | None = Field(default=None)
    body: str = Field(default="")
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))

    @field_validator("application_id", "job_id", mode="before")
    @classmethod
    def _blank_optional_id(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return str(v).strip() if isinstance(v, str) else v


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
    source_note: str = Field(
        default="",
        description="User-provided source context for manually added opportunities.",
    )
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
    engagement: JobEngagement | None = Field(
        default=None,
        description="Legacy read-compat only. New writes leave this null.",
    )
    favorite: bool = Field(default=False, description="Product Save. Independent of Reference.")
    reference: bool = Field(
        default=False,
        description="Independent keep-aside. Can coexist with Save and Application.",
    )
    comment: str = Field(default="")
    contact: str = Field(
        default="",
        description="Leftover Application contact after Cancel Draft. Never merged with comment.",
    )
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
    comm_notes: list[ApplicationCommNote] = Field(
        default_factory=list,
        description="Job-scoped communication notes, including leftover cancelled-draft notes.",
    )
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
        if value == "reference":
            data.setdefault("reference", True)
            data["engagement"] = None
            return data
        data["engagement"] = value
        return data

    @model_validator(mode="after")
    def _promote_legacy_reference_engagement(self) -> Job:
        """engagement=reference → reference=true, engagement=null."""
        if self.engagement == JobEngagement.REFERENCE:
            self.reference = True
            self.engagement = None
        return self

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


class PacketSnapshotItem(BaseModel):
    """Denormalized Packet row frozen at Mark Submitted. File refs stay immutable."""

    binding_id: str = Field(default="")
    material_id: str = Field(default="")
    material_version_id: str = Field(default="")
    title: str = Field(default="")
    kind: str = Field(default="other")
    version_number: int = Field(default=1)
    version_label: str = Field(default="")
    original_filename: str = Field(default="")
    file_ref: str = Field(default="")
    snapshot_file_ref: str = Field(default="")
    url: str = Field(default="")
    material_purpose: list[str] = Field(default_factory=list)
    version_purpose: list[str] = Field(default_factory=list)
    material_notes: str = Field(default="")
    version_notes: str = Field(default="")


class PacketSnapshot(BaseModel):
    """MaterialVersion bindings captured at Mark Submitted. Packet is not a stage."""

    binding_ids: list[str] = Field(default_factory=list)
    material_version_ids: list[str] = Field(default_factory=list)
    items: list[PacketSnapshotItem] = Field(default_factory=list)
    note: str = Field(default="")


class ApplicationSubmission(BaseModel):
    """One Mark Submitted / re-apply event. History is append-only."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    application_id: str
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    channel: str = Field(default="")
    packet_snapshot: PacketSnapshot = Field(default_factory=PacketSnapshot)
    notes: str = Field(default="")
    idempotency_key: str = Field(default="")
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


class SubmissionMaterialRevision(BaseModel):
    """Immutable correction of one submission's recorded materials."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    submission_id: str
    revision: int = Field(ge=1)
    packet_snapshot: PacketSnapshot = Field(default_factory=PacketSnapshot)
    note: str = Field(default="")
    idempotency_key: str
    request_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


class ApplicationSubmissionResponse(ApplicationSubmission):
    """API projection that exposes the effective corrected packet."""

    effective_packet_snapshot: PacketSnapshot = Field(default_factory=PacketSnapshot)
    material_revision: int = Field(default=0, ge=0)
    materials_corrected_at: datetime | None = Field(default=None)


class MaterialPresetItem(BaseModel):
    """One immutable material version or text block referenced by a preset."""

    material_version_id: str
    block_key: str | None = None


class MaterialUsePreset(BaseModel):
    """Named, ordered references to reusable material units."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    name: str
    items: list[MaterialPresetItem] = Field(default_factory=list)
    revision: int = Field(default=1, ge=1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


class ApplicationEvent(BaseModel):
    """Append-only stage / close history. Current Application fields are a projection."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    application_id: str
    kind: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))


class Application(BaseModel):
    """One Application per Job. Stage is draft | applied | interview | offer | closed.

    Closed is history/archive. ``close_reason`` is optional.
    """

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
    contact: str = Field(
        default="",
        description="Optional free-text contact (name, email, WeChat, or a link). Not required.",
    )
    tags: list[str] = Field(
        default_factory=list,
        description="Optional free-text direction tags. Not a taxonomy.",
    )
    close_reason: CloseReason | None = Field(default=None)
    close_note: str = Field(default="")
    posting_id: str | None = Field(default=None)
    resume_document_id: str | None = Field(default=None)
    deleted_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    raw_data: dict[str, Any] = Field(default_factory=dict)
    submissions: list[ApplicationSubmission] = Field(default_factory=list)
    current_material_count: int = Field(
        default=0,
        description="Count of current application↔material bindings (not history).",
    )
    comm_notes: list[ApplicationCommNote] = Field(default_factory=list)
    exclude_from_idle: bool = Field(
        default=False,
        description="Manual exemption from idle / no-update cleanup.",
    )
    stale_applied: bool = Field(
        default=False,
        description="Computed: Applied with no meaningful update for N days.",
    )
    next_step: str = Field(
        default="",
        description="Job.next_step projection for Applications list/detail. Not stored.",
    )
    job_deadline: str = Field(
        default="",
        description="Job.deadline (ISO date) projection. Distinct from Application.deadline.",
    )
    job_description: str = Field(
        default="",
        description="Job.description projection. Empty means the full JD was not saved.",
    )
    job_comment: str = Field(
        default="",
        description="Job.comment projection (Research notes). Never merged with Application.notes.",
    )
    apply_url: str = Field(
        default="",
        description="Existing apply URL when present in stored ingest payload. Never inferred.",
    )
    job_url: str = Field(
        default="",
        description="Job.job_url or canonical_url projection for Open source. Not stored.",
    )

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


class MaterialKind(StrEnum):
    """Library kinds. File kinds live under Materials → Files; Knowledge under Knowledge."""

    RESUME = "resume"
    COVER_LETTER = "cover_letter"
    PORTFOLIO = "portfolio"
    TRANSCRIPT = "transcript"
    OTHER = "other"
    MESSAGE_TEMPLATE = "message_template"
    APPLICATION_ANSWER = "application_answer"


FILE_MATERIAL_KINDS = frozenset(
    {
        MaterialKind.RESUME.value,
        MaterialKind.COVER_LETTER.value,
        MaterialKind.PORTFOLIO.value,
        MaterialKind.TRANSCRIPT.value,
        MaterialKind.OTHER.value,
    }
)
KNOWLEDGE_MATERIAL_KINDS = frozenset(
    {
        MaterialKind.MESSAGE_TEMPLATE.value,
        MaterialKind.APPLICATION_ANSWER.value,
    }
)


class MaterialVersion(BaseModel):
    """A version of a Material. Application Packet binds these, not the parent."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    material_id: str
    version_number: int = Field(default=1, ge=1)
    version_label: str = Field(default="")
    version_date: date | None = Field(default=None)
    purpose: list[str] = Field(default_factory=list)
    file_ref: str = Field(default="")
    original_filename: str = Field(default="")
    content_type: str = Field(default="")
    byte_size: int = Field(default=0, ge=0)
    url: str = Field(default="")
    notes: str = Field(default="")
    request_id: str | None = Field(default=None)
    request_hash: str | None = Field(default=None)
    text: str = Field(
        default="",
        description="Loaded markdown body for Knowledge versions (content.md). Not a DB column.",
    )
    archived_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))

    @computed_field  # type: ignore[prop-decorator]
    @property
    def display_label(self) -> str:
        extra = self.version_label.strip()
        return f"v{self.version_number} · {extra}" if extra else f"v{self.version_number}"


class Material(BaseModel):
    """Materials Library item. Versions hold the takeable files or URLs."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    title: str = Field(default="")
    kind: str = Field(default="other")
    direction: str | None = Field(default=None)
    language: Literal["zh", "en"] | None = Field(default=None)
    purpose: list[str] = Field(default_factory=list)
    notes: str = Field(default="")
    is_pinned: bool = Field(default=False)
    archived_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    versions: list[MaterialVersion] = Field(default_factory=list)

    def touch(self) -> None:
        object.__setattr__(self, "updated_at", datetime.now(tz=UTC))


class ApplicationMaterialBinding(BaseModel):
    """Packet membership: Application ↔ one Version of a Material."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    application_id: str
    material_id: str
    material_version_id: str
    sort_order: int = Field(default=0)
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


class CompanySource(BaseModel):
    """One ``source_registry`` row. ``kind`` is company or vertical — never mixed in UI."""

    id: str
    company: str
    kind: Literal["company", "vertical"] = "company"
    channel_type: str = ""
    handle: str = ""
    collect_cn: bool = False
    collect_en: bool = False
    enabled: bool = True
    include_in_run: bool = False
    tags: list[str] = Field(default_factory=list)
    note: str = ""
    careers_url: str | None = None
    runnable: bool = True
    collector_id: str = ""
    integration: str = "ats_board"
    ats: str | None = None
    slug: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))

    @field_validator("company", "note", "collector_id", "integration", "handle", mode="before")
    @classmethod
    def _strip_text(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class NotebookPage(BaseModel):
    """Free-writing page. Not a journal, material, or application packet item."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    title: str = ""
    markdown_body: str = ""
    sort_order: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    topics: list[str] = Field(default_factory=list)

    @field_validator("title", "markdown_body", mode="before")
    @classmethod
    def _strip_optional(cls, v: object) -> object:
        return v if v is None or not isinstance(v, str) else v
