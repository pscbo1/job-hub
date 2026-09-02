"""
api/app.py
───────────
A thin, local FastAPI layer over the existing typed core. The web UI is just a
surface over this — there is **no business logic here**, only HTTP plumbing that
calls the same profile/repository/tailor code the CLI uses. That keeps a single
source of truth and means the UI can never drift from the engine.

Run it:
    uv run uvicorn job_sentinel.api.app:app --reload      # or: job-sentinel serve

Local-first: it binds to localhost and only allows local origins, so nothing is
exposed off the machine. ``create_app`` takes optional profile/DB paths so tests
never touch the user's real ``data/`` files.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

from fastapi import FastAPI, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field, field_validator

from job_sentinel.api.chat import ChatMessage, ChatReply
from job_sentinel.api.chat import answer as chat_answer
from job_sentinel.api.ops import OpsConfigError, OpsConflictError, get_runner
from job_sentinel.core.models import (
    ApplicationCommNote,
    ApplicationStage,
    ApplicationStatus,
    CloseReason,
    DocumentKind,
    GeneratedDocument,
    Job,
    JobEngagement,
    JobPosting,
    JobTask,
    PacketSnapshot,
)
from job_sentinel.documents.match import MatchResult, match_profile_to_job
from job_sentinel.documents.tailor import KeywordTailor, TailorResult
from job_sentinel.profile import DEFAULT_PROFILE_PATH, Profile, load_profile, save_profile

if TYPE_CHECKING:
    from job_sentinel.documents.llm import OllamaClient
    from job_sentinel.documents.tailor import Tailor

# data/ lives at the repo root (src/job_sentinel/api/app.py -> parents[3]).
_DATA_DIR = Path(__file__).resolve().parents[3] / "data"

# The local Next.js dev server (and a future packaged UI) call this API.
# Next picks the next free port when 3000 is taken, so accept any localhost
# port rather than a fixed list — the API still only binds to 127.0.0.1.
# Extension origins are also allowed so the browser extension can POST
# directly to the local API without a CORS preflight failure.
_LOCAL_ORIGIN_REGEX = (
    r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
    r"|chrome-extension://[a-p]{32}"
    r"|moz-extension://[0-9a-f-]+"
)


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "job-sentinel-api"


class AuthLoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class AuthCreateUserRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=8, description="At least 8 characters")
    is_admin: bool = False


class ProfileSummary(BaseModel):
    name: str
    education: int
    experience: int
    projects: int
    skills: int
    certifications: int
    awards: int
    publications: int


class TailorRequest(BaseModel):
    job_description: str = Field(min_length=1, description="The job text to tailor toward")


class MatchRequest(BaseModel):
    job_description: str | None = Field(default=None, description="Raw job-description text")
    posting_id: str | None = Field(default=None, description="ID of a stored JobPosting to match")
    ai: bool = Field(default=True, description="Generate an AI-grounded rationale (if available)")


class BuildRequest(BaseModel):
    job_description: str = Field(default="", description="Optional JD to tailor toward")
    ai: bool = Field(default=False, description="Use the local LLM to rephrase (if available)")


class StatusRequest(BaseModel):
    status: ApplicationStatus


class HubJobStatusRequest(BaseModel):
    """Job Pool tracking patch. ``status`` is accepted as a legacy engagement alias."""

    engagement: JobEngagement | None = None
    status: JobEngagement | None = None
    favorite: bool | None = None
    reference: bool | None = None
    comment: str | None = None
    next_step: str | None = None
    deadline: datetime | None = None
    follow_up_at: datetime | None = None

    @field_validator("engagement", "status", mode="before")
    @classmethod
    def _blank_engagement(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return v

    @field_validator("deadline", "follow_up_at", mode="before")
    @classmethod
    def _blank_dates(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return v


class JobTaskCreateRequest(BaseModel):
    title: str = Field(..., min_length=1)
    due_at: date | None = None
    notes: str | None = None
    source_url: str | None = None
    application_id: str | None = None

    @field_validator("title", mode="before")
    @classmethod
    def _strip_title(cls, v: object) -> object:
        return str(v).strip() if v is not None else v

    @field_validator("due_at", mode="before")
    @classmethod
    def _blank_due(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return v

    @field_validator("notes", "source_url", "application_id", mode="before")
    @classmethod
    def _blank_optional(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return str(v).strip() if isinstance(v, str) else v


class JobTaskPatchRequest(BaseModel):
    title: str | None = None
    due_at: date | None = None
    done: bool | None = None
    sort_order: int | None = None
    notes: str | None = None
    source_url: str | None = None

    @field_validator("title", mode="before")
    @classmethod
    def _strip_title(cls, v: object) -> object:
        return str(v).strip() if isinstance(v, str) else v

    @field_validator("due_at", mode="before")
    @classmethod
    def _blank_due(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return v

    @field_validator("notes", "source_url", mode="before")
    @classmethod
    def _blank_optional(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return str(v).strip() if isinstance(v, str) else v


class CollectJobsRequest(BaseModel):
    """Search page → mcp-jobs collection criteria."""

    keywords: str = Field(min_length=1)
    location: str = ""
    sources: list[str] = Field(min_length=1)
    max_results: int = Field(default=100, ge=1, le=200)
    remote: bool | None = None
    date_posted_days: int | None = Field(default=None, ge=1, le=365)
    exclude_outsourcing: bool = True
    exclude_part_time: bool = True
    exclude_internship: bool = True
    custom_keywords: str = ""
    excluded_companies: str = ""
    market: str = ""
    source_overrides: dict[str, dict[str, Any]] = Field(default_factory=dict)

    @field_validator("keywords", "location", "custom_keywords", "excluded_companies", mode="before")
    @classmethod
    def _strip_text(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("sources", mode="before")
    @classmethod
    def _clean_sources(cls, v: object) -> object:
        if not isinstance(v, list):
            return v
        return [str(item).strip() for item in v if str(item).strip()]

    @field_validator("source_overrides", mode="before")
    @classmethod
    def _clean_overrides(cls, v: object) -> object:
        from job_sentinel.ingestion.search_capabilities import sanitize_overrides

        return sanitize_overrides(v)


class FilterSettingsRequest(BaseModel):
    exclude_outsourcing: bool = True
    exclude_part_time: bool = True
    exclude_internship: bool = True
    custom_keywords: str | list[str] = ""
    excluded_companies: str | list[str] = ""
    apply: bool = True


class SearchPresetWriteRequest(BaseModel):
    name: str
    market: str
    sources: list[str] = Field(min_length=1)
    common_filters: dict[str, Any] = Field(default_factory=dict)
    source_overrides: dict[str, dict[str, Any]] = Field(default_factory=dict)


class SearchPresetPatchRequest(BaseModel):
    name: str | None = None
    sources: list[str] | None = None
    common_filters: dict[str, Any] | None = None
    source_overrides: dict[str, dict[str, Any]] | None = None


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)


class LoginRequest(BaseModel):
    timeout: int = Field(default=300, ge=30, le=900, description="Seconds to wait for sign-in")


class ScrapeRequest(BaseModel):
    send: bool = Field(default=False, description="Send alerts (default: dry run)")


class CoverRequest(BaseModel):
    job_description: str = Field(default="", description="Optional JD to target")
    role: str = Field(default="", description="Role title for the opening line")
    company: str = Field(default="", description="Company / department name")
    ai: bool = Field(default=False, description="Polish with the local LLM (if available)")


class InterviewQuestionsRequest(BaseModel):
    job_description: str = Field(default="", description="Job description text to tailor questions")
    role: str = Field(default="", description="Role title (used when no JD is supplied)")
    count: int = Field(default=10, ge=1, le=30, description="Number of questions to generate")
    ai: bool = Field(default=True, description="Use local LLM when available")


class InterviewQuestion(BaseModel):
    category: str  # e.g. "Behavioural", "Technical", "Role-specific", "Culture fit"
    question: str


class InterviewQuestionsResponse(BaseModel):
    questions: list[InterviewQuestion]
    source: str  # "llm" | "deterministic"
    role_hint: str  # the role / JD title we detected


class _SourceConfigKeys(BaseModel):
    ADZUNA_APP_ID: str | None = None
    ADZUNA_APP_KEY: str | None = None
    ADZUNA_COUNTRY: str | None = None
    USAJOBS_API_KEY: str | None = None
    USAJOBS_EMAIL: str | None = None
    THEMUSE_API_KEY: str | None = None


class SourceConfigRequest(BaseModel):
    enabled_sources: list[str] | None = None
    keys: _SourceConfigKeys | None = None


class SourceSearchRequest(BaseModel):
    keywords: str = ""
    location: str = ""
    remote: bool | None = None
    job_type: str = ""
    salary_min: int | None = None
    date_posted_days: int | None = None
    radius_km: int | None = None
    seniority: str = ""
    company: str = ""
    limit: int = Field(default=50, ge=1)
    sources: list[str] | None = None  # restrict to specific source IDs


class CompanyBoardRequest(BaseModel):
    ats: str
    slug: str


class ApplicationCreateRequest(BaseModel):
    # From a tracked posting — if provided, fields are copied from it.
    job_id: str | None = Field(default=None)
    posting_id: str | None = Field(default=None)
    # Manual fields (also used when overriding posting-sourced values).
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
    resume_document_id: str | None = Field(default=None)


class ManualApplicationCreateRequest(BaseModel):
    request_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=200)
    company: str = Field(..., min_length=1, max_length=200)
    job_url: str = Field(default="", max_length=2048)
    location: str = Field(default="")
    source_note: str = Field(default="")
    market: str = Field(default="cn")
    create_separately: bool = False

    @field_validator("title", "company", "job_url", "location", "source_note", mode="before")
    @classmethod
    def _strip_manual_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("job_url")
    @classmethod
    def _validate_job_url(cls, value: str) -> str:
        if not value:
            return value
        parts = urlsplit(value)
        if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
            raise ValueError("Enter a full http(s) link with a host")
        return value

    @field_validator("market")
    @classmethod
    def _validate_manual_market(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"cn", "en"}:
            raise ValueError("Market must be cn or en")
        return normalized


class ApplicationPatchRequest(BaseModel):
    stage: ApplicationStage | None = Field(default=None)
    notes: str | None = Field(default=None)
    contact: str | None = Field(default=None)
    tags: list[str] | None = Field(default=None)
    applied_date: str | None = Field(default=None)
    deadline: str | None = Field(default=None)
    salary: str | None = Field(default=None)
    resume_document_id: str | None = Field(default=None)
    title: str | None = Field(default=None)
    employer: str | None = Field(default=None)
    location: str | None = Field(default=None)
    url: str | None = Field(default=None)
    source: str | None = Field(default=None)
    close_reason: CloseReason | None = Field(default=None)
    close_note: str | None = Field(default=None)
    exclude_from_idle: bool | None = Field(default=None)


class MarkSubmittedRequest(BaseModel):
    channel: str = ""
    notes: str = ""
    packet_snapshot: PacketSnapshot | None = None
    confirm_empty: bool = False
    expected_version_ids: list[str] | None = None
    idempotency_key: str = ""


class CloseApplicationRequest(BaseModel):
    close_reason: CloseReason | None = None
    close_note: str = ""


class ArchiveJobRequest(BaseModel):
    reason: str = ""


class ArchiveSettingsRequest(BaseModel):
    enabled: bool = False
    idle_days: int = Field(default=14, ge=1, le=365)
    force: bool = False
    dry_run: bool = False


class IdleCleanupSettingsRequest(BaseModel):
    enabled: bool = False
    idle_days: int = Field(default=14, ge=1, le=365)


class MaterialWriteRequest(BaseModel):
    title: str = ""
    kind: str = "other"
    purpose: list[str] = Field(default_factory=list)
    notes: str = ""
    url: str = ""
    version_label: str = ""
    version_purpose: list[str] = Field(default_factory=list)
    version_notes: str = ""
    content: str = ""


class MaterialPatchRequest(BaseModel):
    title: str | None = None
    kind: str | None = None
    purpose: list[str] | None = None
    notes: str | None = None


class MaterialVersionWriteRequest(BaseModel):
    url: str = ""
    version_label: str = ""
    purpose: list[str] = Field(default_factory=list)
    notes: str = ""
    content: str = ""


class MaterialVersionPatchRequest(BaseModel):
    version_label: str | None = None
    purpose: list[str] | None = None
    notes: str | None = None


class PacketReplaceRequest(BaseModel):
    material_version_ids: list[str] = Field(default_factory=list)


class PacketBindRequest(BaseModel):
    material_version_id: str


class CommNoteWriteRequest(BaseModel):
    body: str = ""


def _summary(p: Profile) -> ProfileSummary:
    return ProfileSummary(
        name=p.basics.name,
        education=len(p.education),
        experience=len(p.experience),
        projects=len(p.projects),
        skills=len(p.skills),
        certifications=len(p.certifications),
        awards=len(p.awards),
        publications=len(p.publications),
    )


def _job_action(db_path: Path, job_id: str, op: Any) -> Job:
    from job_sentinel.db.repository import JobRepository
    from job_sentinel.jobs.actions import TrackingError

    repo = JobRepository(db_path)
    try:
        try:
            job = op(repo)
        except TrackingError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    finally:
        repo.close()
    if not isinstance(job, Job):
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


def _parse_purpose_json(raw: str) -> list[str]:
    import json

    try:
        parsed = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    if isinstance(parsed, list):
        return [str(item).strip() for item in parsed if str(item).strip()]
    return []


def _json_object(model: BaseModel) -> dict[str, Any]:
    dumped = model.model_dump(mode="json")
    if not isinstance(dumped, dict):
        raise TypeError("expected JSON object")
    return dumped


def _parse_since(value: str | None) -> datetime | None:
    """Parse ``YYYY-MM-DD`` or ISO datetime as UTC start bound."""
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        if len(text) == 10 and text[4] == "-" and text[7] == "-":
            return datetime.fromisoformat(text).replace(tzinfo=UTC)
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid since timestamp") from exc
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def _parse_market_param(value: str | None) -> str | None:
    from job_sentinel.markets import parse_market_id

    if value is None or not value.strip():
        return None
    mid = parse_market_id(value)
    if mid is None:
        raise HTTPException(status_code=422, detail="Unknown market")
    return mid


def _parse_source_list(value: str | None) -> list[str] | None:
    if value is None or not value.strip():
        return None
    items = [part.strip() for part in value.split(",") if part.strip()]
    return items or None


def _posted_since(days: int | None) -> datetime | None:
    if days is None:
        return None
    if days < 1 or days > 365:
        raise HTTPException(status_code=422, detail="posted_days must be between 1 and 365")
    return datetime.now(tz=UTC) - timedelta(days=days)


def create_app(
    profile_path: Path | None = None,
    db_path: Path | None = None,
    auth_dir: Path | None = None,
    materials_dir: Path | None = None,
) -> FastAPI:
    """Build the FastAPI app. Paths are injectable so tests stay isolated."""
    profile_path = profile_path or DEFAULT_PROFILE_PATH
    db_path = db_path or (_DATA_DIR / "jobs.db")
    auth_dir = auth_dir or _DATA_DIR
    materials_dir = materials_dir or (_DATA_DIR / "materials")

    app = FastAPI(
        title="Job Sentinel API",
        version="1.3.0",
        summary="Local API over the job-sentinel core (profile, jobs, résumé tailoring).",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=_LOCAL_ORIGIN_REGEX,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # ── Authentication (AUTH_MODE: off | demo | required) ─────────────────
    import os

    from job_sentinel.api.auth import AuthError, TokenIssuer, User, UserStore

    auth_mode = os.environ.get("AUTH_MODE", "off").strip().lower()
    if auth_mode not in ("off", "demo", "required"):
        auth_mode = "off"
    user_store = UserStore(auth_dir / "users.json")
    token_issuer = TokenIssuer(auth_dir / "auth_secret")

    def _bearer_user(request: Request) -> User | None:
        header = request.headers.get("authorization", "")
        if not header.lower().startswith("bearer "):
            return None
        try:
            return token_issuer.verify(header[7:].strip())
        except AuthError:
            return None

    # Paths that never need a token (health, docs, and the auth flow itself).
    _public_paths = ("/health", "/docs", "/openapi.json", "/api/auth/")

    @app.middleware("http")
    async def auth_gate(request: Request, call_next):  # type: ignore[no-untyped-def]
        """demo: writes need a login · required: everything needs a login."""
        path = request.url.path
        if (
            auth_mode == "off"
            or request.method == "OPTIONS"
            or any(path.startswith(p) for p in _public_paths)
            or (auth_mode == "demo" and request.method in ("GET", "HEAD"))
        ):
            return await call_next(request)
        user = _bearer_user(request)
        if user is None:
            return JSONResponse(
                status_code=401,
                content={"detail": "Login required — POST /api/auth/login for a token."},
            )
        request.state.user = user
        return await call_next(request)

    @app.get("/api/auth/status")
    def auth_status(request: Request) -> dict[str, Any]:
        user = _bearer_user(request)
        return {
            "mode": auth_mode,
            "users_exist": user_store.has_users(),
            "user": user.model_dump() if user else None,
        }

    @app.post("/api/auth/login")
    def auth_login(req: AuthLoginRequest) -> dict[str, Any]:
        try:
            user = user_store.authenticate(req.username, req.password)
        except AuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        return {"token": token_issuer.issue(user), "user": user.model_dump()}

    @app.post("/api/auth/users")
    def auth_create_user(req: AuthCreateUserRequest, request: Request) -> dict[str, Any]:
        """Admin-only: create an account (how you invite someone to your instance)."""
        actor = _bearer_user(request)
        if user_store.has_users() and (actor is None or not actor.is_admin):
            raise HTTPException(status_code=403, detail="Only an admin can create accounts.")
        try:
            user = user_store.add_user(
                req.username,
                req.password,
                is_admin=req.is_admin if user_store.has_users() else True,
            )
        except AuthError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"user": user.model_dump()}

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    @app.get("/api/profile", response_model=Profile)
    def get_profile() -> Profile:
        return load_profile(profile_path)

    @app.put("/api/profile", response_model=Profile)
    def put_profile(profile: Profile) -> Profile:
        """Replace the stored profile (validated by pydantic) and persist it."""
        save_profile(profile, profile_path)
        return profile

    @app.post("/api/profile/import-resume", response_model=Profile)
    async def import_resume(file: UploadFile, ai: bool = True) -> Profile:
        """
        Parse an uploaded resume PDF into a Profile **draft**.

        Nothing is saved — the UI loads the result into the editor so the
        user reviews and saves explicitly. ``ai=true`` (default) uses the
        local LLM when available; otherwise the heuristic parser runs.
        """
        from job_sentinel.documents.resume_import import (
            ResumeImportError,
            extract_pdf_text,
            parse_resume_text,
        )

        if file.content_type not in ("application/pdf", "application/octet-stream", None):
            raise HTTPException(status_code=415, detail="Upload a PDF file.")
        data = await file.read()
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="PDF is larger than 10 MB.")
        try:
            text = extract_pdf_text(data)
        except ResumeImportError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        client = _resolve_ollama() if ai else None
        return parse_resume_text(text, client=client)

    @app.get("/api/profile/summary", response_model=ProfileSummary)
    def profile_summary() -> ProfileSummary:
        return _summary(load_profile(profile_path))

    @app.get("/api/jobs", response_model=list[Job])
    def list_jobs(
        limit: int = 50,
        since: str | None = None,
        filter_state: str = "included",
        market: str | None = None,
        country: str | None = None,
        sources: str | None = None,
        remote: bool | None = None,
        posted_days: int | None = None,
        view: str = "discover",
        include_dismissed: bool = False,
        include_archived: bool = False,
        q: str = "",
        has_draft: bool | None = None,
    ) -> list[Job]:
        """Job Pool: canonical ``jobs`` rows (not legacy ``job_postings``)."""
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.ingestion.collect_sources import list_collect_sources as list_cs
        from job_sentinel.markets import (
            SourceMarket,
            job_in_market_view,
            parse_market_id,
            parse_source_market,
            source_in_view,
        )

        state = filter_state.strip().lower()
        if state not in {"included", "excluded", "all"}:
            raise HTTPException(
                status_code=422, detail="filter_state must be included, excluded, or all"
            )
        view_key = view.strip().lower()
        if view_key == "my_jobs":
            view_key = "tasks"
        if view_key not in {"discover", "tasks"}:
            raise HTTPException(status_code=422, detail="view must be discover or tasks")
        since_dt = _parse_since(since)
        mid = _parse_market_param(market)
        source_filter = _parse_source_list(sources)
        specs = list_cs(enabled_only=False)
        registry: dict[str, SourceMarket] = {}
        for spec in specs:
            sm = parse_source_market(spec.market)
            if sm is not None:
                registry[spec.id] = sm
        view_sources: list[str] | None = None
        view_id = parse_market_id(mid) if mid else None
        if view_id is not None:
            view_sources = [s.id for s in specs if source_in_view(s.market, view_id)]
        if view_sources is not None:
            allowed = set(view_sources)
            if source_filter:
                view_sources = [s for s in source_filter if s in allowed]
            if not view_sources:
                view_sources = ["__no_such_source__"]
        elif source_filter:
            view_sources = source_filter
        repo = JobRepository(db_path)
        try:
            jobs = repo.list_hub_jobs(
                limit=limit,
                since=since_dt,
                filter_state=state,
                sources=view_sources,
                posted_since=_posted_since(posted_days),
                country=country,
                remote=remote,
                view=view_key,
                include_dismissed=include_dismissed,
                include_archived=include_archived,
                q=q,
                has_draft=has_draft,
            )
        finally:
            repo.close()
        if view_id is not None:
            jobs = [j for j in jobs if job_in_market_view(j, view_id, registry)]
        return jobs

    @app.patch("/api/jobs/{job_id}", response_model=Job)
    def patch_hub_job(job_id: str, req: HubJobStatusRequest) -> Job:
        """Update Job tracking: Save, Reference, comment, next step, deadline."""
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.actions import TrackingError, save_job, set_reference

        repo = JobRepository(db_path)
        try:
            if repo.get_hub_job(job_id) is None:
                raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
            job = repo.get_hub_job(job_id)
            assert job is not None
            try:
                if req.favorite is not None:
                    job = save_job(repo, job_id, saved=req.favorite)
                if req.reference is not None:
                    job = set_reference(repo, job_id, referenced=req.reference)
                fields_set = req.model_fields_set
                if "engagement" in fields_set or (
                    "status" in fields_set and req.favorite is None and req.engagement is None
                ):
                    requested = req.engagement if "engagement" in fields_set else req.status
                    if requested == JobEngagement.REFERENCE:
                        job = set_reference(repo, job_id, referenced=True)
                    elif requested in {JobEngagement.UNDER_STUDY, JobEngagement.TO_DO}:
                        raise HTTPException(
                            status_code=422,
                            detail="under_study and to_do are not writable.",
                        )
                    elif requested is None:
                        job = repo.update_hub_job_tracking(job_id, engagement=None) or job
                tracking: dict[str, Any] = {}
                if req.comment is not None:
                    tracking["comment"] = req.comment
                if req.next_step is not None:
                    tracking["next_step"] = req.next_step
                if req.deadline is not None or "deadline" in fields_set:
                    tracking["deadline"] = req.deadline
                if req.follow_up_at is not None or "follow_up_at" in fields_set:
                    tracking["follow_up_at"] = req.follow_up_at
                if tracking:
                    job = repo.update_hub_job_tracking(job_id, **tracking) or job
            except TrackingError as exc:
                raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        finally:
            repo.close()
        return job

    @app.post("/api/jobs/{job_id}/save", response_model=Job)
    def save_hub_job(job_id: str) -> Job:
        from job_sentinel.jobs.actions import save_job

        return _job_action(db_path, job_id, lambda repo: save_job(repo, job_id, saved=True))

    @app.post("/api/jobs/{job_id}/unsave", response_model=Job)
    def unsave_hub_job(job_id: str) -> Job:
        from job_sentinel.jobs.actions import save_job

        return _job_action(db_path, job_id, lambda repo: save_job(repo, job_id, saved=False))

    @app.post("/api/jobs/{job_id}/start-review", response_model=Job)
    def start_review_hub_job(job_id: str) -> Job:
        del job_id
        raise HTTPException(
            status_code=410,
            detail="Start Review / Under Study is not part of the sealed workflow.",
        )

    @app.post("/api/jobs/{job_id}/reference", response_model=Job)
    def reference_hub_job(job_id: str) -> Job:
        from job_sentinel.jobs.actions import set_reference

        return _job_action(
            db_path, job_id, lambda repo: set_reference(repo, job_id, referenced=True)
        )

    @app.post("/api/jobs/{job_id}/unreference", response_model=Job)
    def unreference_hub_job(job_id: str) -> Job:
        from job_sentinel.jobs.actions import set_reference

        return _job_action(
            db_path, job_id, lambda repo: set_reference(repo, job_id, referenced=False)
        )

    @app.get("/api/jobs/{job_id}/tasks", response_model=list[JobTask])
    def list_hub_job_tasks(job_id: str) -> list[JobTask]:
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            if repo.get_hub_job(job_id) is None:
                raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
            return repo.list_job_tasks(job_id)
        finally:
            repo.close()

    @app.get("/api/jobs/{job_id}/comm-notes", response_model=list[ApplicationCommNote])
    def list_hub_job_comm_notes(job_id: str) -> list[ApplicationCommNote]:
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            if repo.get_hub_job(job_id) is None:
                raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
            return repo.list_comm_notes_for_job(job_id)
        finally:
            repo.close()

    @app.post("/api/jobs/{job_id}/tasks", response_model=JobTask)
    def create_hub_job_task(job_id: str, req: JobTaskCreateRequest) -> JobTask:
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            task = repo.create_job_task(
                job_id,
                title=req.title,
                due_at=req.due_at,
                notes=req.notes,
                source_url=req.source_url,
                application_id=req.application_id,
            )
        except ValueError as exc:
            detail = str(exc)
            status = 404 if detail == "Application not found" else 400
            raise HTTPException(status_code=status, detail=detail) from exc
        finally:
            repo.close()
        if task is None:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        return task

    @app.patch("/api/jobs/{job_id}/tasks/{task_id}", response_model=JobTask)
    def patch_hub_job_task(job_id: str, task_id: str, req: JobTaskPatchRequest) -> JobTask:
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            task = repo.update_job_task(job_id, task_id, req.model_dump(exclude_unset=True))
        finally:
            repo.close()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        return task

    @app.delete("/api/jobs/{job_id}/tasks/{task_id}")
    def delete_hub_job_task(job_id: str, task_id: str) -> dict[str, bool]:
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            deleted = repo.delete_job_task(job_id, task_id)
        finally:
            repo.close()
        if not deleted:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"ok": True}

    @app.post("/api/jobs/{job_id}/start-application")
    def start_application_hub_job(job_id: str) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.actions import TrackingError, start_application

        repo = JobRepository(db_path)
        try:
            job, app = start_application(repo, job_id)
        except TrackingError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        finally:
            repo.close()
        return {"job": job.model_dump(mode="json"), "application": app.model_dump(mode="json")}

    @app.post("/api/jobs/{job_id}/archive", response_model=Job)
    def archive_hub_job(job_id: str, req: ArchiveJobRequest) -> Job:
        from job_sentinel.jobs.actions import archive_job

        return _job_action(
            db_path, job_id, lambda repo: archive_job(repo, job_id, reason=req.reason)
        )

    @app.post("/api/jobs/{job_id}/unarchive", response_model=Job)
    def unarchive_hub_job(job_id: str) -> Job:
        from job_sentinel.jobs.actions import restore_archive

        return _job_action(db_path, job_id, lambda repo: restore_archive(repo, job_id))

    @app.post("/api/jobs/{job_id}/dismiss", response_model=Job)
    def dismiss_hub_job_route(job_id: str) -> Job:
        """Dismiss is Discovery noise. Clears Save and engagement."""
        from job_sentinel.jobs.actions import dismiss_job

        return _job_action(db_path, job_id, lambda repo: dismiss_job(repo, job_id))

    @app.post("/api/jobs/{job_id}/undismiss", response_model=Job)
    def undismiss_hub_job_route(job_id: str) -> Job:
        """Clear dismissed_at only. Does not restore Save or engagement."""
        from job_sentinel.jobs.actions import restore_dismiss

        return _job_action(db_path, job_id, lambda repo: restore_dismiss(repo, job_id))

    @app.post("/api/jobs/{posting_id}/status", response_model=JobPosting)
    def set_job_status(posting_id: str, req: StatusRequest) -> JobPosting:
        """Legacy portal ``job_postings`` status (12twenty watcher)."""
        from job_sentinel.db.repository import JobRepository

        if not db_path.is_file():
            raise HTTPException(status_code=404, detail="No job database yet")
        repo = JobRepository(db_path)
        try:
            if not repo.update_status(posting_id, req.status):
                raise HTTPException(status_code=404, detail=f"Posting {posting_id} not found")
            job = repo.get_job(posting_id)
        finally:
            repo.close()
        if job is None:  # pragma: no cover - defensive
            raise HTTPException(status_code=404, detail=f"Posting {posting_id} not found")
        return job

    @app.get("/api/archive-settings")
    def get_archive_settings() -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.archive import load_archive_settings

        repo = JobRepository(db_path)
        try:
            return load_archive_settings(repo).model_dump()
        finally:
            repo.close()

    @app.put("/api/archive-settings")
    def put_archive_settings(req: ArchiveSettingsRequest) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.archive import ArchiveSettings, save_archive_settings

        repo = JobRepository(db_path)
        try:
            settings = save_archive_settings(
                repo, ArchiveSettings(enabled=req.enabled, idle_days=req.idle_days)
            )
            return settings.model_dump()
        finally:
            repo.close()

    @app.get("/api/idle-cleanup-settings")
    def get_idle_cleanup_settings() -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.idle import load_idle_cleanup_settings

        repo = JobRepository(db_path)
        try:
            return load_idle_cleanup_settings(repo).model_dump()
        finally:
            repo.close()

    @app.put("/api/idle-cleanup-settings")
    def put_idle_cleanup_settings(req: IdleCleanupSettingsRequest) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.idle import IdleCleanupSettings, save_idle_cleanup_settings

        repo = JobRepository(db_path)
        try:
            settings = save_idle_cleanup_settings(
                repo, IdleCleanupSettings(enabled=req.enabled, idle_days=req.idle_days)
            )
            return settings.model_dump()
        finally:
            repo.close()

    @app.post("/api/jobs/archive-run")
    def run_archive_now(req: ArchiveSettingsRequest) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.archive import run_idle_archive

        repo = JobRepository(db_path)
        try:
            result = run_idle_archive(repo, force=req.force, dry_run=req.dry_run)
            return result.model_dump()
        finally:
            repo.close()

    @app.get("/api/collect/sources")
    def list_collect_sources(market: str | None = None) -> dict[str, Any]:
        """Selectable collection sources for Search. Later kinds append here."""
        from job_sentinel.ingestion.collect_sources import list_collect_sources as list_sources

        mid = _parse_market_param(market)
        try:
            listed = list_sources(market=mid)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {"sources": [s.model_dump() for s in listed]}

    @app.post("/api/collect/jobs")
    def collect_jobs(req: CollectJobsRequest) -> dict[str, Any]:
        """Run mcp-jobs with UI criteria, then ingest into jobs_raw / jobs."""
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.ingestion.collect import collect_and_ingest
        from job_sentinel.ingestion.filters import FilterSettings

        repo = JobRepository(db_path)
        try:
            outcome = collect_and_ingest(
                repo,
                keywords=req.keywords,
                location=req.location,
                source_ids=req.sources,
                max_results=req.max_results,
                remote=req.remote,
                date_posted_days=req.date_posted_days,
                market=req.market or None,
                source_overrides=req.source_overrides,
                filter_settings=FilterSettings(
                    exclude_outsourcing=req.exclude_outsourcing,
                    exclude_part_time=req.exclude_part_time,
                    exclude_internship=req.exclude_internship,
                    custom_keywords=req.custom_keywords,
                    excluded_companies=req.excluded_companies,
                ),
            )
        finally:
            repo.close()
        return outcome.model_dump()

    @app.get("/api/search/presets")
    def list_search_presets(market: str | None = None) -> dict[str, Any]:
        """Saved Search configs for one market. Does not include results."""
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.ingestion.search_presets import load_presets

        mid = _parse_market_param(market)
        repo = JobRepository(db_path)
        try:
            try:
                rows = load_presets(repo, market=mid)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        finally:
            repo.close()
        return {"presets": [row.model_dump() for row in rows]}

    @app.post("/api/search/presets")
    def create_search_preset(req: SearchPresetWriteRequest) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.ingestion.search_presets import SearchPresetWrite, create_preset

        repo = JobRepository(db_path)
        try:
            try:
                preset = create_preset(repo, SearchPresetWrite.model_validate(req.model_dump()))
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        finally:
            repo.close()
        return preset.model_dump()

    @app.patch("/api/search/presets/{preset_id}")
    def patch_search_preset(preset_id: str, req: SearchPresetPatchRequest) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.ingestion.search_presets import SearchPresetPatch, update_preset

        repo = JobRepository(db_path)
        try:
            try:
                preset = update_preset(
                    repo,
                    preset_id,
                    SearchPresetPatch.model_validate(req.model_dump(exclude_unset=True)),
                )
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        finally:
            repo.close()
        if preset is None:
            raise HTTPException(status_code=404, detail="Saved search not found")
        return preset.model_dump()

    @app.delete("/api/search/presets/{preset_id}")
    def delete_search_preset(preset_id: str) -> dict[str, bool]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.ingestion.search_presets import delete_preset

        repo = JobRepository(db_path)
        try:
            deleted = delete_preset(repo, preset_id)
        finally:
            repo.close()
        if not deleted:
            raise HTTPException(status_code=404, detail="Saved search not found")
        return {"ok": True}

    @app.get("/api/filters")
    def get_filter_settings() -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.ingestion.filters import load_filter_settings

        repo = JobRepository(db_path)
        try:
            return load_filter_settings(repo).model_dump()
        finally:
            repo.close()

    @app.put("/api/filters")
    def put_filter_settings(req: FilterSettingsRequest) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.ingestion.filters import (
            FilterSettings,
            reapply_filters,
            save_filter_settings,
        )

        settings = FilterSettings(
            exclude_outsourcing=req.exclude_outsourcing,
            exclude_part_time=req.exclude_part_time,
            exclude_internship=req.exclude_internship,
            custom_keywords=req.custom_keywords,
            excluded_companies=req.excluded_companies,
        )
        repo = JobRepository(db_path)
        try:
            save_filter_settings(repo, settings)
            applied = reapply_filters(repo, settings) if req.apply else None
        finally:
            repo.close()
        body: dict[str, Any] = {"settings": settings.model_dump()}
        if applied is not None:
            body["reapplied"] = applied.model_dump()
        return body

    @app.post("/api/ingest/jobs")
    def ingest_collector_jobs(payload: dict[str, Any] | list[Any]) -> dict[str, Any]:
        """Accept mcp-jobs / contract JSON and write jobs_raw then jobs."""
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.ingestion.mcp_jobs import parse_ingest_payload
        from job_sentinel.ingestion.pipeline import ingest_records

        records = parse_ingest_payload(payload)
        repo = JobRepository(db_path)
        try:
            result = ingest_records(repo, records)
        finally:
            repo.close()
        return result.model_dump()

    @app.get("/api/stats")
    def db_stats() -> dict[str, int]:
        """Counts per tracking status — the UI twin of `job-sentinel db stats`."""
        from job_sentinel.db.repository import JobRepository

        if not db_path.is_file():
            return {}
        repo = JobRepository(db_path)
        try:
            return repo.get_stats()
        finally:
            repo.close()

    # ── documents directory (sibling of db_path) ─────────────────────────
    _docs_dir = db_path.parent / "documents"
    _docs_dir.mkdir(parents=True, exist_ok=True)

    # ── Applications ──────────────────────────────────────────────────────

    @app.get("/api/applications/stats")
    def applications_stats() -> dict[str, int]:
        """Count of tracked applications per stage plus total."""
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            return repo.application_stats()
        finally:
            repo.close()

    @app.get("/api/applications/analytics")
    def applications_analytics() -> dict[str, object]:
        """
        Richer analytics over the local application tracker:
        - funnel: stage counts + pct_of_applied conversion rates
        - overall_response_rate: % of applied that reached interviewing/offer
        - by_source: per-source response rates (which boards convert best)
        - weekly_volume: application cadence over the last 8 weeks
        """
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            return repo.application_analytics()
        finally:
            repo.close()

    @app.get("/api/applications")
    def list_applications(
        stage: ApplicationStage | None = None,
        limit: int = 200,
        view: str = "all",
        stale_applied: bool = False,
        tag: str = "",
    ) -> list[dict[str, Any]]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.membership import OPEN_APPLICATION_STAGES, enrich_application_stale
        from job_sentinel.jobs.tags import application_matches_tags

        view_key = view.strip().lower()
        if view_key not in {"all", "open", "closed"}:
            raise HTTPException(status_code=422, detail="view must be all, open, or closed")
        repo = JobRepository(db_path)
        try:
            apps = repo.list_applications(stage=stage, limit=limit)
            apps = [enrich_application_stale(repo, a) for a in apps]
        finally:
            repo.close()
        if view_key == "open":
            apps = [a for a in apps if a.stage in OPEN_APPLICATION_STAGES]
        elif view_key == "closed":
            apps = [a for a in apps if a.stage == ApplicationStage.CLOSED]
        if stale_applied:
            apps = [a for a in apps if a.stale_applied]
        if tag.strip():
            apps = [a for a in apps if application_matches_tags(a, [tag])]
        return [a.model_dump(mode="json") for a in apps]

    @app.get("/api/applications/tags")
    def list_application_tags() -> dict[str, list[str]]:
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            return {"tags": repo.list_application_tags()}
        finally:
            repo.close()

    @app.post("/api/applications")
    def create_application(req: ApplicationCreateRequest, request: Request) -> dict[str, Any]:
        """Create a draft via Start Application. Requires a stable job_id."""
        if auth_mode != "off" and _bearer_user(request) is None:
            raise HTTPException(status_code=401, detail="Login required.")

        if not req.job_id:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Application drafts are created with Start Application on a Job. "
                    "Pass job_id, or POST /api/jobs/{id}/start-application. "
                    "Search results cannot create an orphan draft."
                ),
            )

        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.actions import TrackingError, start_application

        repo = JobRepository(db_path)
        try:
            _job, app = start_application(repo, req.job_id)
        except TrackingError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        finally:
            repo.close()
        return app.model_dump(mode="json")

    @app.post("/api/applications/manual")
    def create_manual_application_route(
        req: ManualApplicationCreateRequest,
        request: Request,
    ) -> JSONResponse:
        """Create one manual Job + Draft transaction, with replay and URL conflict handling."""
        if auth_mode != "off" and _bearer_user(request) is None:
            raise HTTPException(status_code=401, detail="Login required.")

        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.actions import create_manual_application

        repo = JobRepository(db_path)
        try:
            outcome = create_manual_application(
                repo,
                request_id=str(req.request_id),
                title=req.title,
                company=req.company,
                job_url=req.job_url,
                location=req.location,
                source_note=req.source_note,
                market=req.market,
                create_separately=req.create_separately,
            )
            if outcome.status == "duplicate":
                duplicate = outcome.duplicate_job
                duplicate_app = outcome.duplicate_application
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "duplicate_candidate",
                        "message": "An opportunity with this link already exists.",
                        "duplicate_candidate": (
                            {
                                "job": {
                                    "id": duplicate.id,
                                    "title": duplicate.title,
                                    "company": duplicate.company,
                                    "location": duplicate.location,
                                    "job_url": duplicate.job_url,
                                    "market": duplicate.market,
                                },
                                "application": (
                                    {
                                        "id": duplicate_app.id,
                                        "stage": duplicate_app.stage.value,
                                        "deleted": duplicate_app.deleted_at is not None,
                                    }
                                    if duplicate_app is not None
                                    else None
                                ),
                            }
                            if duplicate is not None
                            else None
                        ),
                    },
                )
            if outcome.status == "cancelled":
                return JSONResponse(
                    status_code=200,
                    content={
                        "job": None,
                        "application": None,
                        "replayed": True,
                        "cancelled": True,
                    },
                )
            if outcome.job is None or outcome.application is None:
                raise HTTPException(status_code=500, detail="Manual application result is missing")
            return JSONResponse(
                status_code=200 if outcome.replayed else 201,
                content={
                    "job": outcome.job.model_dump(mode="json"),
                    "application": outcome.application.model_dump(mode="json"),
                    "replayed": outcome.replayed,
                    "cancelled": False,
                },
            )
        finally:
            repo.close()

    @app.get("/api/applications/export")
    def export_applications(fmt: str = "csv") -> StreamingResponse:
        """Export all tracked applications as CSV or JSON.

        Query params
        ------------
        fmt : "csv" (default) | "json"
        """
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            apps = repo.list_applications(limit=10_000)
        finally:
            repo.close()

        if fmt == "json":
            import json

            payload = json.dumps(
                [a.model_dump(mode="json") for a in apps],
                indent=2,
            )
            return StreamingResponse(
                io.BytesIO(payload.encode()),
                media_type="application/json",
                headers={"Content-Disposition": "attachment; filename=applications.json"},
            )

        # CSV (default)
        csv_fields = [
            "id",
            "title",
            "employer",
            "location",
            "url",
            "source",
            "stage",
            "salary",
            "applied_date",
            "deadline",
            "notes",
            "created_at",
            "updated_at",
        ]
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=csv_fields, extrasaction="ignore")
        writer.writeheader()
        for a in apps:
            row = a.model_dump(mode="json")
            row["stage"] = a.stage.value if hasattr(a.stage, "value") else str(a.stage)
            writer.writerow(row)
        return StreamingResponse(
            io.BytesIO(buf.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=applications.csv"},
        )

    @app.get("/api/applications/{app_id}")
    def get_application(app_id: str) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            app = repo.get_application(app_id)
        finally:
            repo.close()
        if app is None or app.deleted_at is not None:
            raise HTTPException(status_code=404, detail=f"Application {app_id} not found.")
        return app.model_dump(mode="json")

    @app.post("/api/applications/{app_id}/submit")
    def submit_application(app_id: str, req: MarkSubmittedRequest) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.actions import TrackingError, mark_submitted

        repo = JobRepository(db_path)
        try:
            app = mark_submitted(
                repo,
                app_id,
                channel=req.channel,
                notes=req.notes,
                materials_dir=materials_dir,
                confirm_empty=req.confirm_empty,
                expected_version_ids=req.expected_version_ids,
                idempotency_key=req.idempotency_key,
            )
        except TrackingError as err:
            detail: object = err.message
            if err.code:
                detail = {"code": err.code, "message": err.message}
            raise HTTPException(status_code=err.status_code, detail=detail) from err
        finally:
            repo.close()
        return app.model_dump(mode="json")

    @app.post("/api/applications/{app_id}/close")
    def close_application_route(app_id: str, req: CloseApplicationRequest) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.actions import TrackingError, close_application

        repo = JobRepository(db_path)
        try:
            app = close_application(repo, app_id, reason=req.close_reason, note=req.close_note)
        except TrackingError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        finally:
            repo.close()
        return app.model_dump(mode="json")

    @app.post("/api/applications/{app_id}/abandon")
    def abandon_application(app_id: str) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.actions import TrackingError, abandon_draft

        repo = JobRepository(db_path)
        try:
            job = abandon_draft(repo, app_id)
        except TrackingError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        finally:
            repo.close()
        return {
            "ok": True,
            "job": job.model_dump(mode="json") if job is not None else None,
        }

    @app.patch("/api/applications/{app_id}")
    def patch_application(
        app_id: str,
        req: ApplicationPatchRequest,
        request: Request,
    ) -> dict[str, Any]:
        if auth_mode != "off" and _bearer_user(request) is None:
            raise HTTPException(status_code=401, detail="Login required.")

        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.actions import TrackingError, set_application_stage

        updates = {
            k: v
            for k, v in req.model_dump(exclude_unset=True).items()
            if v is not None and k not in {"stage", "close_reason", "close_note"}
        }
        repo = JobRepository(db_path)
        try:
            if req.stage is not None:
                try:
                    set_application_stage(
                        repo,
                        app_id,
                        req.stage,
                        close_reason=req.close_reason,
                        close_note=req.close_note or "",
                    )
                except TrackingError as exc:
                    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
            if updates:
                found = repo.update_application(app_id, **updates)
                if not found:
                    raise HTTPException(status_code=404, detail=f"Application {app_id} not found.")
            app = repo.get_application(app_id)
        finally:
            repo.close()
        if app is None:
            raise HTTPException(status_code=404, detail=f"Application {app_id} not found.")
        return app.model_dump(mode="json")

    @app.delete("/api/applications/{app_id}")
    def delete_application(app_id: str, request: Request) -> dict[str, bool]:
        if auth_mode != "off" and _bearer_user(request) is None:
            raise HTTPException(status_code=401, detail="Login required.")

        from job_sentinel.db.repository import JobRepository
        from job_sentinel.jobs.actions import (
            TrackingError,
            abandon_draft,
            application_was_submitted,
        )

        repo = JobRepository(db_path)
        try:
            app = repo.get_application(app_id)
            if app is None or app.deleted_at is not None:
                raise HTTPException(status_code=404, detail=f"Application {app_id} not found.")
            if application_was_submitted(app):
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Submitted applications cannot be deleted. Close the Application instead."
                    ),
                )
            try:
                abandon_draft(repo, app_id)
            except TrackingError as exc:
                raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        finally:
            repo.close()
        return {"ok": True}

    def _materials() -> Any:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.materials.service import MaterialsService
        from job_sentinel.materials.storage import MaterialStorage

        repo = JobRepository(db_path)
        return repo, MaterialsService(repo, MaterialStorage(materials_dir))

    @app.get("/api/materials")
    def list_materials(include_archived: bool = False) -> list[dict[str, Any]]:
        repo, service = _materials()
        try:
            rows = repo.list_materials(include_archived=include_archived)
            rows = [service.hydrate_material(m) for m in rows]
        finally:
            repo.close()
        return [m.model_dump(mode="json") for m in rows]

    @app.post("/api/materials")
    def create_material(req: MaterialWriteRequest) -> dict[str, Any]:
        from job_sentinel.materials.service import MaterialsError

        repo, service = _materials()
        try:
            material = service.create_material(
                title=req.title,
                kind=req.kind,
                purpose=req.purpose,
                notes=req.notes,
                url=req.url,
                version_label=req.version_label,
                version_purpose=req.version_purpose,
                version_notes=req.version_notes,
                content=req.content,
            )
        except MaterialsError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        finally:
            repo.close()
        return _json_object(material)

    @app.post("/api/materials/upload")
    async def upload_material(
        file: UploadFile,
        title: str = Form(""),
        kind: str = Form("other"),
        purpose: str = Form("[]"),
        notes: str = Form(""),
        version_label: str = Form(""),
        version_purpose: str = Form("[]"),
        version_notes: str = Form(""),
    ) -> dict[str, Any]:
        from job_sentinel.materials.service import MaterialsError

        data = await file.read()
        repo, service = _materials()
        try:
            material = service.create_material(
                title=title,
                kind=kind,
                purpose=_parse_purpose_json(purpose),
                notes=notes,
                version_label=version_label,
                version_purpose=_parse_purpose_json(version_purpose),
                version_notes=version_notes,
                filename=file.filename or "upload",
                data=data,
                content_type=file.content_type or "",
            )
        except MaterialsError as extra:
            raise HTTPException(status_code=extra.status_code, detail=extra.message) from extra
        finally:
            repo.close()
        return _json_object(material)

    @app.get("/api/materials/{material_id}")
    def get_material(material_id: str, include_archived: bool = True) -> dict[str, Any]:
        repo, service = _materials()
        try:
            material = repo.get_material(material_id, include_archived=include_archived)
            if material is None:
                raise HTTPException(status_code=404, detail="Material not found")
            return _json_object(service.hydrate_material(material))
        finally:
            repo.close()

    @app.patch("/api/materials/{material_id}")
    def patch_material(material_id: str, req: MaterialPatchRequest) -> dict[str, Any]:
        from job_sentinel.materials.service import MaterialsError

        repo, service = _materials()
        try:
            material = service.update_material(
                material_id,
                title=req.title,
                kind=req.kind,
                purpose=req.purpose,
                notes=req.notes,
            )
        except MaterialsError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        finally:
            repo.close()
        return _json_object(material)

    @app.post("/api/materials/{material_id}/archive")
    def archive_material(material_id: str) -> dict[str, Any]:
        return _material_archive(material_id, archived=True)

    @app.post("/api/materials/{material_id}/restore")
    def restore_material(material_id: str) -> dict[str, Any]:
        return _material_archive(material_id, archived=False)

    def _material_archive(material_id: str, *, archived: bool) -> dict[str, Any]:
        from job_sentinel.materials.service import MaterialsError

        repo, service = _materials()
        try:
            material = service.set_material_archived(material_id, archived)
        except MaterialsError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        finally:
            repo.close()
        return _json_object(material)

    @app.post("/api/materials/{material_id}/versions")
    def add_material_version(material_id: str, req: MaterialVersionWriteRequest) -> dict[str, Any]:
        from job_sentinel.materials.service import MaterialsError

        repo, service = _materials()
        try:
            version = service.add_version(
                material_id,
                url=req.url,
                version_label=req.version_label,
                purpose=req.purpose,
                notes=req.notes,
                content=req.content,
            )
        except MaterialsError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        finally:
            repo.close()
        return _json_object(version)

    @app.post("/api/materials/{material_id}/versions/upload")
    async def upload_material_version(
        material_id: str,
        file: UploadFile,
        version_label: str = Form(""),
        purpose: str = Form("[]"),
        notes: str = Form(""),
    ) -> dict[str, Any]:
        from job_sentinel.materials.service import MaterialsError

        data = await file.read()
        repo, service = _materials()
        try:
            version = service.add_version(
                material_id,
                version_label=version_label,
                purpose=_parse_purpose_json(purpose),
                notes=notes,
                filename=file.filename or "upload",
                data=data,
                content_type=file.content_type or "",
            )
        except MaterialsError as extra:
            raise HTTPException(status_code=extra.status_code, detail=extra.message) from extra
        finally:
            repo.close()
        return _json_object(version)

    @app.patch("/api/material-versions/{version_id}")
    def patch_material_version(version_id: str, req: MaterialVersionPatchRequest) -> dict[str, Any]:
        from job_sentinel.materials.service import MaterialsError

        repo, service = _materials()
        try:
            version = service.update_version(
                version_id,
                version_label=req.version_label,
                purpose=req.purpose,
                notes=req.notes,
            )
        except MaterialsError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        finally:
            repo.close()
        return _json_object(version)

    @app.post("/api/material-versions/{version_id}/archive")
    def archive_material_version(version_id: str) -> dict[str, Any]:
        return _version_archive(version_id, archived=True)

    @app.post("/api/material-versions/{version_id}/restore")
    def restore_material_version(version_id: str) -> dict[str, Any]:
        return _version_archive(version_id, archived=False)

    def _version_archive(version_id: str, *, archived: bool) -> dict[str, Any]:
        from job_sentinel.materials.service import MaterialsError

        repo, service = _materials()
        try:
            version = service.set_version_archived(version_id, archived)
        except MaterialsError as extra:
            raise HTTPException(status_code=extra.status_code, detail=extra.message) from extra
        finally:
            repo.close()
        return _json_object(version)

    @app.get("/api/material-versions/{version_id}/file")
    def material_version_file(version_id: str) -> FileResponse:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.materials.storage import MaterialStorage, StorageError

        repo = JobRepository(db_path)
        try:
            version = repo.get_material_version(version_id)
        finally:
            repo.close()
        if version is None or not version.file_ref:
            raise HTTPException(status_code=404, detail="File not found")
        storage = MaterialStorage(materials_dir)
        try:
            path = storage.resolve(version.file_ref)
        except StorageError as exc:
            raise HTTPException(status_code=404, detail="File not found") from exc
        if not path.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        filename = version.original_filename or path.name
        return FileResponse(
            path,
            media_type=version.content_type or "application/octet-stream",
            filename=filename,
        )

    @app.get("/api/applications/{app_id}/packet")
    def get_packet(app_id: str) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            app = repo.get_application(app_id)
            if app is None or app.deleted_at is not None:
                raise HTTPException(status_code=404, detail="Application not found")
            bindings = repo.list_application_bindings(app_id)
            items = []
            for binding in bindings:
                version = repo.get_material_version(binding.material_version_id)
                material = repo.get_material(binding.material_id, include_archived=True)
                items.append(
                    {
                        "binding": binding.model_dump(mode="json"),
                        "material": material.model_dump(mode="json") if material else None,
                        "version": version.model_dump(mode="json") if version else None,
                    }
                )
        finally:
            repo.close()
        return {"application_id": app_id, "items": items}

    @app.put("/api/applications/{app_id}/packet")
    def replace_packet(app_id: str, req: PacketReplaceRequest) -> dict[str, Any]:
        from job_sentinel.materials.service import MaterialsError

        repo, service = _materials()
        try:
            service.replace_packet(app_id, req.material_version_ids)
        except MaterialsError as extra:
            raise HTTPException(status_code=extra.status_code, detail=extra.message) from extra
        finally:
            repo.close()
        return get_packet(app_id)

    @app.post("/api/applications/{app_id}/packet/bindings")
    def add_packet_binding(app_id: str, req: PacketBindRequest) -> dict[str, Any]:
        from job_sentinel.materials.service import MaterialsError

        repo, service = _materials()
        try:
            binding = service.add_binding(app_id, req.material_version_id)
        except MaterialsError as extra:
            raise HTTPException(status_code=extra.status_code, detail=extra.message) from extra
        finally:
            repo.close()
        return _json_object(binding)

    @app.patch("/api/applications/{app_id}/packet/bindings/{binding_id}")
    def change_packet_version(
        app_id: str, binding_id: str, req: PacketBindRequest
    ) -> dict[str, Any]:
        from job_sentinel.materials.service import MaterialsError

        repo, service = _materials()
        try:
            binding = service.change_binding_version(app_id, binding_id, req.material_version_id)
        except MaterialsError as extra:
            raise HTTPException(status_code=extra.status_code, detail=extra.message) from extra
        finally:
            repo.close()
        return _json_object(binding)

    @app.delete("/api/applications/{app_id}/packet/bindings/{binding_id}")
    def delete_packet_binding(app_id: str, binding_id: str) -> dict[str, bool]:
        from job_sentinel.materials.service import MaterialsError

        repo, service = _materials()
        try:
            service.remove_binding(app_id, binding_id)
        except MaterialsError as extra:
            raise HTTPException(status_code=extra.status_code, detail=extra.message) from extra
        finally:
            repo.close()
        return {"ok": True}

    @app.get("/api/applications/{app_id}/submissions/{sub_id}/items/{index}/file")
    def submission_snapshot_file(app_id: str, sub_id: str, index: int) -> FileResponse:
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.materials.storage import MaterialStorage, StorageError

        repo = JobRepository(db_path)
        try:
            submission = repo.get_application_submission(app_id, sub_id)
        finally:
            repo.close()
        if submission is None:
            raise HTTPException(status_code=404, detail="当次材料未记录")
        items = submission.packet_snapshot.items
        if index < 0 or index >= len(items):
            raise HTTPException(status_code=404, detail="当次材料未记录")
        item = items[index]
        storage = MaterialStorage(materials_dir)
        ref = item.snapshot_file_ref or item.file_ref
        if not ref:
            raise HTTPException(status_code=404, detail="当次材料未记录")
        try:
            path = storage.resolve(ref)
        except StorageError as extra:
            raise HTTPException(status_code=404, detail="当次材料未记录") from extra
        if not path.is_file():
            raise HTTPException(status_code=404, detail="当次材料未记录")
        filename = item.original_filename or path.name
        return FileResponse(
            path,
            media_type="application/octet-stream",
            filename=filename,
        )

    @app.get("/api/applications/{app_id}/comm-notes")
    def list_comm_notes(app_id: str) -> list[dict[str, Any]]:
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            app = repo.get_application(app_id)
            if app is None or app.deleted_at is not None:
                raise HTTPException(status_code=404, detail="Application not found")
            notes = repo.list_comm_notes(app_id)
        finally:
            repo.close()
        return [n.model_dump(mode="json") for n in notes]

    @app.post("/api/applications/{app_id}/comm-notes")
    def add_comm_note(app_id: str, req: CommNoteWriteRequest) -> dict[str, Any]:
        from job_sentinel.db.repository import JobRepository

        body = req.body.strip()
        if not body:
            raise HTTPException(status_code=400, detail="Note text is required")
        repo = JobRepository(db_path)
        try:
            app = repo.get_application(app_id)
            if app is None or app.deleted_at is not None:
                raise HTTPException(status_code=404, detail="Application not found")
            note = repo.create_comm_note(ApplicationCommNote(application_id=app_id, body=body))
        finally:
            repo.close()
        return _json_object(note)

    @app.delete("/api/applications/{app_id}/comm-notes/{note_id}")
    def delete_comm_note(app_id: str, note_id: str) -> dict[str, bool]:
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            ok = repo.delete_comm_note(app_id, note_id)
        finally:
            repo.close()
        if not ok:
            raise HTTPException(status_code=404, detail="Note not found")
        return {"ok": True}

    # ── Generated Documents ───────────────────────────────────────────────

    @app.get("/api/documents")
    def list_documents(
        kind: DocumentKind | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            docs = repo.list_documents(kind=kind, limit=limit)
        finally:
            repo.close()
        return [d.model_dump(mode="json") for d in docs]

    @app.get("/api/documents/{doc_id}/file")
    def document_file(doc_id: str) -> FileResponse:
        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            doc = repo.get_document(doc_id)
        finally:
            repo.close()
        if doc is None:
            raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")
        p = Path(doc.file_path)
        if not p.is_file():
            raise HTTPException(status_code=404, detail="File not found on disk.")
        return FileResponse(p, media_type="application/pdf", filename=p.name)

    @app.delete("/api/documents/{doc_id}")
    def delete_document(doc_id: str, request: Request) -> dict[str, bool]:
        if auth_mode != "off" and _bearer_user(request) is None:
            raise HTTPException(status_code=401, detail="Login required.")

        from job_sentinel.db.repository import JobRepository

        repo = JobRepository(db_path)
        try:
            doc = repo.get_document(doc_id)
            if doc is None:
                raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")
            repo.delete_document(doc_id)
        finally:
            repo.close()
        # Best-effort file removal.
        if doc.file_path:
            import contextlib

            with contextlib.suppress(OSError):
                Path(doc.file_path).unlink(missing_ok=True)
        return {"ok": True}

    @app.get("/api/ops/status")
    def ops_status() -> dict[str, Any]:
        """Session/login/scrape/watcher state in one snapshot (polled by the UI)."""
        return get_runner().status()

    @app.post("/api/ops/login")
    def ops_login(req: LoginRequest) -> dict[str, bool]:
        """Start the interactive portal login (opens a browser on this machine)."""
        try:
            get_runner().start_login(timeout=req.timeout)
        except OpsConflictError as exc:
            raise HTTPException(
                status_code=409,
                detail="That operation can't run right now — another job is in progress "
                "(or a login browser is open). Wait for it to finish, then retry.",
            ) from exc
        except OpsConfigError as exc:
            raise HTTPException(
                status_code=503,
                detail="Configuration error — check your .env (PORTAL_* / TELEGRAM_* "
                "variables are required).",
            ) from exc
        return {"started": True}

    @app.post("/api/ops/session/check")
    def ops_session_check() -> dict[str, Any]:
        """Headless probe: is the saved portal session still valid?"""
        try:
            return get_runner().check_session()
        except OpsConflictError as exc:
            raise HTTPException(
                status_code=409,
                detail="That operation can't run right now — another job is in progress "
                "(or a login browser is open). Wait for it to finish, then retry.",
            ) from exc
        except OpsConfigError as exc:
            raise HTTPException(
                status_code=503,
                detail="Configuration error — check your .env (PORTAL_* / TELEGRAM_* "
                "variables are required).",
            ) from exc

    @app.post("/api/ops/scrape")
    def ops_scrape(req: ScrapeRequest) -> dict[str, bool]:
        """Run one scrape cycle in the background (dry-run unless `send`)."""
        try:
            get_runner().start_scrape(send=req.send)
        except OpsConflictError as exc:
            raise HTTPException(
                status_code=409,
                detail="That operation can't run right now — another job is in progress "
                "(or a login browser is open). Wait for it to finish, then retry.",
            ) from exc
        except OpsConfigError as exc:
            raise HTTPException(
                status_code=503,
                detail="Configuration error — check your .env (PORTAL_* / TELEGRAM_* "
                "variables are required).",
            ) from exc
        return {"started": True}

    @app.post("/api/ops/watcher/start")
    def ops_watcher_start() -> dict[str, bool]:
        """Start continuous monitoring (the UI twin of `job-sentinel run`)."""
        try:
            get_runner().start_watcher()
        except OpsConflictError as exc:
            raise HTTPException(
                status_code=409,
                detail="That operation can't run right now — another job is in progress "
                "(or a login browser is open). Wait for it to finish, then retry.",
            ) from exc
        except OpsConfigError as exc:
            raise HTTPException(
                status_code=503,
                detail="Configuration error — check your .env (PORTAL_* / TELEGRAM_* "
                "variables are required).",
            ) from exc
        return {"running": True}

    @app.post("/api/ops/watcher/stop")
    def ops_watcher_stop() -> dict[str, bool]:
        """Stop continuous monitoring."""
        try:
            get_runner().stop_watcher()
        except OpsConflictError as exc:
            raise HTTPException(
                status_code=409,
                detail="That operation can't run right now — another job is in progress "
                "(or a login browser is open). Wait for it to finish, then retry.",
            ) from exc
        return {"running": False}

    @app.get("/api/llm/status")
    def llm_status() -> dict[str, Any]:
        """
        LLM provider health snapshot.

        Legacy keys (base_url, reachable, chat_model, chat_ready,
        embed_model, embed_ready) are preserved for the existing web UI.
        New keys (chat, embed sub-objects) expose the provider detail.
        """
        from job_sentinel.config.settings import LLMSettings
        from job_sentinel.documents.providers import build_chat_backend, build_embed_backend

        cfg = LLMSettings()
        chat_be = build_chat_backend(cfg)
        embed_be = build_embed_backend(cfg)

        chat_reachable = chat_be.available()
        chat_ready = chat_be.ready()
        embed_reachable = embed_be.available()
        embed_ready = embed_be.ready()

        # Legacy keys — do NOT remove (web/studio uses them).
        legacy_base = cfg.chat_base_url_resolved
        return {
            "base_url": legacy_base,
            "reachable": chat_reachable,
            "chat_model": cfg.chat_model_resolved,
            "chat_ready": chat_ready,
            "embed_model": cfg.embed_model_resolved,
            "embed_ready": embed_ready,
            # New keys for the richer UI panel.
            "chat": {
                "provider": cfg.chat_provider,
                "model": cfg.chat_model_resolved,
                "base_url": cfg.chat_base_url_resolved,
                "reachable": chat_reachable,
                "ready": chat_ready,
            },
            "embed": {
                "provider": cfg.embed_provider,
                "model": cfg.embed_model_resolved,
                "base_url": cfg.embed_base_url_resolved,
                "reachable": embed_reachable,
                "ready": embed_ready,
            },
        }

    @app.get("/api/llm/config")
    def llm_config() -> dict[str, Any]:
        """Return current LLM config (API keys masked, never raw)."""
        from job_sentinel.config.settings import LLMSettings
        from job_sentinel.documents.providers import PROVIDER_DEFAULTS

        cfg = LLMSettings()
        return {
            "chat": {
                "provider": cfg.chat_provider,
                "model": cfg.chat_model_resolved,
                "base_url": cfg.chat_base_url_resolved,
                "api_key_set": bool(cfg.chat_api_key),
                "api_key_masked": _mask_key(cfg.chat_api_key),
            },
            "embed": {
                "provider": cfg.embed_provider,
                "model": cfg.embed_model_resolved,
                "base_url": cfg.embed_base_url_resolved,
                "api_key_set": bool(cfg.embed_api_key),
                "api_key_masked": _mask_key(cfg.embed_api_key),
            },
            "providers": [
                {
                    "id": pid,
                    "label": info.label,
                    "default_base_url": info.base_url,
                    "requires_key": info.requires_key,
                    "supports_embeddings": info.supports_embeddings,
                }
                for pid, info in PROVIDER_DEFAULTS.items()
            ],
        }

    class _LLMSideInput(BaseModel):
        provider: str = ""
        model: str = ""
        base_url: str = ""
        api_key: str | None = None  # None = leave unchanged; "" = clear

    class LLMConfigPutRequest(BaseModel):
        chat: _LLMSideInput = _LLMSideInput()
        embed: _LLMSideInput = _LLMSideInput()

    class LLMTestRequest(BaseModel):
        target: str  # "chat" | "embed"

    @app.put("/api/llm/config")
    def llm_config_put(req: LLMConfigPutRequest, request: Request) -> dict[str, Any]:
        """
        Persist LLM provider settings to .env (atomic write).

        Only the LLM-related keys are touched; unrelated lines are preserved.
        Clears the settings cache so the next request picks up the new values.
        """
        # Require auth for mutating config when auth is enabled.
        if auth_mode != "off" and _bearer_user(request) is None:
            raise HTTPException(status_code=401, detail="Login required to change LLM config.")
        updates: dict[str, str] = {}
        if req.chat.provider:
            updates["CHAT_PROVIDER"] = req.chat.provider
        if req.chat.model:
            updates["CHAT_MODEL"] = req.chat.model
        if req.chat.base_url is not None:
            updates["CHAT_BASE_URL"] = req.chat.base_url
        if req.chat.api_key is not None:
            updates["CHAT_API_KEY"] = req.chat.api_key

        if req.embed.provider:
            updates["EMBED_PROVIDER"] = req.embed.provider
        if req.embed.model:
            updates["EMBED_MODEL"] = req.embed.model
        if req.embed.base_url is not None:
            updates["EMBED_BASE_URL"] = req.embed.base_url
        if req.embed.api_key is not None:
            updates["EMBED_API_KEY"] = req.embed.api_key

        _update_env_file(updates)

        from job_sentinel.config.settings import get_settings

        get_settings.cache_clear()
        return llm_config()

    @app.post("/api/llm/test")
    def llm_test(req: LLMTestRequest, request: Request) -> dict[str, Any]:
        """
        Live test of the configured chat or embed backend.

        Builds the backend from the current saved config, makes a minimal
        call, and returns {ok, detail, latency_ms}.  Never exposes secrets
        in the detail message.
        """
        import time

        if auth_mode != "off" and _bearer_user(request) is None:
            raise HTTPException(status_code=401, detail="Login required to test LLM config.")
        from job_sentinel.config.settings import LLMSettings
        from job_sentinel.documents.providers import build_chat_backend, build_embed_backend

        cfg = LLMSettings()
        start = time.monotonic()
        try:
            if req.target == "chat":
                backend = build_chat_backend(cfg)
                if not backend.available():
                    return {"ok": False, "detail": "Backend not reachable.", "latency_ms": None}
                backend.chat(
                    "You are a test assistant.", [{"role": "user", "content": "Say 'ok'."}]
                )
            elif req.target == "embed":
                backend_e = build_embed_backend(cfg)
                if not backend_e.available():
                    return {
                        "ok": False,
                        "detail": "Embed backend not reachable.",
                        "latency_ms": None,
                    }
                backend_e.embed(["ping"])
            else:
                return {
                    "ok": False,
                    "detail": "target must be 'chat' or 'embed'.",
                    "latency_ms": None,
                }
        except Exception as exc:
            # Never include the exception repr directly — it could contain API key fragments.
            safe = type(exc).__name__
            return {"ok": False, "detail": f"Request failed: {safe}", "latency_ms": None}
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {"ok": True, "detail": "ok", "latency_ms": elapsed_ms}

    # ── Job Sources ───────────────────────────────────────────────────────────

    @app.get("/api/sources")
    def list_sources_status() -> dict[str, Any]:
        """Return status info for every known job source."""
        from job_sentinel.config.settings import get_settings
        from job_sentinel.sources.registry import all_sources_status

        settings = get_settings()
        return {"sources": all_sources_status(settings)}

    @app.put("/api/sources/config")
    def put_sources_config(req: SourceConfigRequest, request: Request) -> dict[str, Any]:
        """
        Persist job-source settings to .env and return updated status.

        API keys are written via _update_env_file — raw keys are never
        echoed back; the response returns configured booleans only.
        """
        if auth_mode != "off" and _bearer_user(request) is None:
            raise HTTPException(status_code=401, detail="Login required to change source config.")

        from job_sentinel.config.settings import get_settings

        updates: dict[str, str] = {}
        if req.enabled_sources is not None:
            updates["JOB_SOURCES_ENABLED"] = ",".join(req.enabled_sources)
        if req.keys is not None:
            keys_map = {
                "ADZUNA_APP_ID": req.keys.ADZUNA_APP_ID,
                "ADZUNA_APP_KEY": req.keys.ADZUNA_APP_KEY,
                "ADZUNA_COUNTRY": req.keys.ADZUNA_COUNTRY,
                "USAJOBS_API_KEY": req.keys.USAJOBS_API_KEY,
                "USAJOBS_EMAIL": req.keys.USAJOBS_EMAIL,
                "THEMUSE_API_KEY": req.keys.THEMUSE_API_KEY,
            }
            for env_key, val in keys_map.items():
                if val is not None:
                    updates[env_key] = val

        if updates:
            _update_env_file(updates)
            get_settings.cache_clear()

        return list_sources_status()

    @app.post("/api/sources/search")
    def sources_search(req: SourceSearchRequest) -> dict[str, Any]:
        """
        Search for jobs across enabled sources.

        Results are ephemeral — not written to the DB. Collect into Discover,
        then Save / Start Review / Start Application on the Job.
        """
        from job_sentinel.config.settings import get_settings
        from job_sentinel.sources.base import JobQuery
        from job_sentinel.sources.registry import build_enabled_sources
        from job_sentinel.sources.search import aggregate_search

        settings = get_settings()
        capped_limit = min(req.limit, 100)

        query = JobQuery(
            keywords=req.keywords,
            location=req.location,
            remote=req.remote,
            job_type=req.job_type,
            salary_min=req.salary_min,
            date_posted_days=req.date_posted_days,
            radius_km=req.radius_km,
            seniority=req.seniority,
            company=req.company,
            limit=capped_limit,
        )

        if req.sources:
            # Restrict to explicitly requested source IDs
            sources = []
            for sid in req.sources:
                try:
                    instance = _instantiate_source_for_api(sid, settings)
                    sources.append(instance)
                except Exception as exc:
                    from loguru import logger as _log

                    _log.debug("Could not instantiate source '{}': {}", sid, exc)
        else:
            sources = build_enabled_sources(settings)

        response = aggregate_search(query, sources)
        return {
            "results": [j.model_dump(mode="json") for j in response.results],
            "errors": [e.model_dump() for e in response.errors],
            "counts": response.counts,
        }

    @app.post("/api/sources/company")
    def sources_company(req: CompanyBoardRequest) -> dict[str, Any]:
        """Fetch all current openings from a company's public ATS board."""
        from job_sentinel.sources.company_boards import SUPPORTED_ATS, fetch_company_board

        ats = req.ats.strip().lower()
        slug = req.slug.strip()

        if not ats or not slug:
            raise HTTPException(status_code=400, detail="Both 'ats' and 'slug' are required.")
        if ats not in SUPPORTED_ATS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported ATS: {ats!r}. Supported: {sorted(SUPPORTED_ATS)}",
            )

        try:
            jobs = fetch_company_board(ats, slug)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            # Log the cause server-side; return a generic message so internal
            # detail (URLs, transport errors, traces) never reaches the client.
            from loguru import logger as _log

            _log.warning("Company board fetch failed for {}/{}: {}", ats, slug, exc)
            raise HTTPException(
                status_code=404,
                detail=f"Could not fetch the {ats} board for {slug!r}.",
            ) from exc

        return {"results": [j.model_dump(mode="json") for j in jobs]}

    @app.post("/api/resume/tailor", response_model=TailorResult)
    def tailor_resume(req: TailorRequest) -> TailorResult:
        return KeywordTailor().tailor(load_profile(profile_path), req.job_description)

    @app.post("/api/match", response_model=MatchResult)
    def match_job(req: MatchRequest) -> MatchResult:
        """
        Score how well the stored profile fits a job.

        Supply either ``job_description`` (raw text) or ``posting_id`` (loads
        the stored JobPosting and extracts its description).  Returns a
        :class:`MatchResult` with a blended ATS + semantic score, verdict,
        and an optional AI-grounded rationale.
        """
        # ── Resolve job text ──────────────────────────────────────────────────
        jd: str = ""
        if req.posting_id:
            from job_sentinel.db.repository import JobRepository

            if not db_path.is_file():
                raise HTTPException(status_code=404, detail="No job database yet.")
            repo = JobRepository(db_path)
            try:
                job = repo.get_job(req.posting_id)
            finally:
                repo.close()
            if job is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Posting {req.posting_id!r} not found.",
                )
            # Build text from all available fields — richer than snippet alone.
            parts: list[str] = [job.title, job.employer, job.job_type]
            raw_data = job.raw_data or {}
            detail = raw_data.get("detail") or {}
            if isinstance(detail, dict):
                desc = detail.get("description") or ""
                if desc:
                    parts.append(str(desc))
            if job.description_snippet:
                parts.append(job.description_snippet)
            jd = " ".join(p for p in parts if p)
        elif req.job_description is not None:
            jd = req.job_description.strip()

        if not jd:
            raise HTTPException(
                status_code=400,
                detail="Provide a non-empty 'job_description' or a valid 'posting_id'.",
            )

        # ── Load profile ──────────────────────────────────────────────────────
        profile = load_profile(profile_path)
        if profile.is_empty():
            raise HTTPException(status_code=400, detail="Profile is empty; create one first.")

        return match_profile_to_job(profile, jd, use_ai=req.ai)

    @app.post("/api/resume/build")
    def build_resume(req: BuildRequest) -> FileResponse:
        """Render a PDF and return it. 503 if the LaTeX engine isn't installed."""
        from job_sentinel.db.repository import JobRepository
        from job_sentinel.documents import RenderError, build_resume_pdf

        profile = load_profile(profile_path)
        if profile.is_empty():
            raise HTTPException(status_code=400, detail="Profile is empty; create one first.")

        tailor_result = None
        if req.job_description:
            tailor = _resolve_tailor(use_ai=req.ai)
            tailor_result = tailor.tailor(profile, req.job_description)
            profile = tailor_result.profile

        doc_id = uuid.uuid4().hex
        out = _docs_dir / f"{doc_id}.pdf"
        try:
            pdf = build_resume_pdf(profile, out)
        except RenderError as exc:
            # Log the underlying LaTeX/subprocess error server-side; return a
            # generic, actionable message so internal paths/traces never leak.
            from loguru import logger as _log

            _log.warning("PDF render failed: {}", exc)
            raise HTTPException(
                status_code=503,
                detail="Could not render the PDF — is the LaTeX engine (Tectonic) installed?",
            ) from exc

        # Persist a GeneratedDocument record.
        provider_str = _resolve_provider_str(use_ai=req.ai)
        doc = GeneratedDocument(
            id=doc_id,
            kind=DocumentKind.RESUME,
            file_path=str(pdf),
            ats_score=tailor_result.score_pct if tailor_result else None,
            provider=provider_str,
            tailored=req.ai,
            job_snippet=req.job_description[:300],
        )
        tex_candidate = pdf.with_suffix(".tex")
        if tex_candidate.is_file():
            doc.tex_path = str(tex_candidate)

        repo = JobRepository(db_path)
        try:
            repo.create_document(doc)
        finally:
            repo.close()

        file_resp = FileResponse(pdf, media_type="application/pdf", filename="resume.pdf")
        file_resp.headers["X-Document-Id"] = doc_id
        return file_resp

    @app.post("/api/chat", response_model=ChatReply)
    def chat(req: ChatRequest) -> ChatReply:
        """The Sentinel assistant: data questions answered from real state, rest via local LLM."""
        if req.messages[-1].role != "user":
            raise HTTPException(status_code=422, detail="The last message must be from the user.")
        return chat_answer(
            req.messages,
            profile_path=profile_path,
            db_path=db_path,
            client_factory=_resolve_ollama,
        )

    @app.post("/api/interview/questions", response_model=InterviewQuestionsResponse)
    def interview_questions(req: InterviewQuestionsRequest) -> InterviewQuestionsResponse:
        """
        Generate mock interview questions for a given job description + profile.

        Uses the local LLM if available; falls back to a curated set of
        universal questions derived from role keywords so the endpoint is
        always useful even without Ollama running.
        """
        profile = load_profile(profile_path)
        return _generate_interview_questions(req, profile)

    @app.post("/api/resume/cover")
    def build_cover(req: CoverRequest) -> FileResponse:
        """Render a cover-letter PDF. 503 if the LaTeX engine isn't installed."""
        from datetime import date

        from job_sentinel.db.repository import JobRepository
        from job_sentinel.documents import (
            RenderError,
            build_cover_letter_pdf,
            cover_letter_paragraphs,
        )

        profile = load_profile(profile_path)
        if profile.is_empty():
            raise HTTPException(status_code=400, detail="Profile is empty; create one first.")

        client = _resolve_ollama() if req.ai else None
        paragraphs = cover_letter_paragraphs(
            profile,
            role=req.role,
            company=req.company,
            job_description=req.job_description,
            client=client,
        )
        doc_id = uuid.uuid4().hex
        out = _docs_dir / f"{doc_id}.pdf"
        try:
            pdf = build_cover_letter_pdf(
                profile,
                paragraphs,
                out,
                role=req.role,
                company=req.company,
                today=date.today().strftime("%B %d, %Y"),
            )
        except RenderError as exc:
            # Log the underlying LaTeX/subprocess error server-side; return a
            # generic, actionable message so internal paths/traces never leak.
            from loguru import logger as _log

            _log.warning("PDF render failed: {}", exc)
            raise HTTPException(
                status_code=503,
                detail="Could not render the PDF — is the LaTeX engine (Tectonic) installed?",
            ) from exc

        provider_str = _resolve_provider_str(use_ai=req.ai)
        doc = GeneratedDocument(
            id=doc_id,
            kind=DocumentKind.COVER_LETTER,
            title=req.role,
            employer=req.company,
            file_path=str(pdf),
            provider=provider_str,
            tailored=req.ai,
            job_snippet=req.job_description[:300],
        )
        tex_candidate = pdf.with_suffix(".tex")
        if tex_candidate.is_file():
            doc.tex_path = str(tex_candidate)

        repo = JobRepository(db_path)
        try:
            repo.create_document(doc)
        finally:
            repo.close()

        file_resp = FileResponse(pdf, media_type="application/pdf", filename="cover_letter.pdf")
        file_resp.headers["X-Document-Id"] = doc_id
        return file_resp

    return app


def _instantiate_source_for_api(source_id: str, settings: Any) -> Any:
    """Instantiate a single source with keys from settings (used by sources_search)."""
    from job_sentinel.sources.registry import _instantiate_source

    return _instantiate_source(source_id, settings)


def _resolve_ollama() -> OllamaClient | None:
    """
    Return a ready chat backend as an OllamaClient-compatible object, or None.

    Uses the multi-provider factory so this path benefits from CHAT_PROVIDER /
    CHAT_MODEL overrides while remaining backward-compatible with callers that
    only need available() / has_model() / chat() / chat_json().
    """
    from job_sentinel.config.settings import LLMSettings
    from job_sentinel.documents.providers import build_chat_backend

    cfg = LLMSettings()
    backend = build_chat_backend(cfg)
    return backend if (backend.available() and backend.ready()) else None  # type: ignore[return-value]


def _resolve_provider_str(*, use_ai: bool) -> str:
    """Return a human-readable provider/model string for document records."""
    if not use_ai:
        return "deterministic"
    try:
        from job_sentinel.config.settings import LLMSettings

        cfg = LLMSettings()
        return f"{cfg.chat_provider}/{cfg.chat_model_resolved}"
    except Exception:
        return "deterministic"


def _resolve_tailor(*, use_ai: bool) -> Tailor:
    """Pick the LLM tailor if requested and reachable, else the keyword tailor."""
    base: Tailor = KeywordTailor()
    if not use_ai:
        return base
    from job_sentinel.config.settings import LLMSettings
    from job_sentinel.documents.llm import LLMTailor
    from job_sentinel.documents.providers import build_chat_backend

    cfg = LLMSettings()
    backend = build_chat_backend(cfg)
    if backend.available() and backend.ready():
        return LLMTailor(backend)
    return base


_B = "Behavioural"
_C = "Culture fit"
_T = "Technical"
_R = "Role-specific"
_FALLBACK_QUESTIONS: list[dict[str, str]] = [
    {"category": _B, "question": "Tell me about a time you had to learn a new technology quickly."},
    {"category": _B, "question": "Describe a project where you had to collaborate across teams."},
    {
        "category": _B,
        "question": "How do you handle disagreements with teammates about technical decisions?",
    },
    {
        "category": _B,
        "question": "Tell me about a time you received critical feedback. How did you respond?",
    },
    {
        "category": _B,
        "question": "Walk me through a challenging bug you debugged and how you found the root cause.",  # noqa: E501
    },
    {"category": _C, "question": "Why are you interested in this role and company specifically?"},
    {"category": _C, "question": "What does a healthy engineering culture look like to you?"},
    {"category": _C, "question": "How do you stay current with developments in your field?"},
    {
        "category": _T,
        "question": "How would you design a system that needs to scale to millions of users?",
    },
    {"category": _T, "question": "Explain the trade-offs between SQL and NoSQL databases."},
    {"category": _T, "question": "How do you approach writing testable code?"},
    {"category": _T, "question": "What's your process for reviewing someone else's code?"},
    {"category": _R, "question": "What's the most complex project you've shipped end-to-end?"},
    {
        "category": _R,
        "question": "How do you balance shipping fast with maintaining code quality?",
    },
    {
        "category": _R,
        "question": "Walk me through how you'd approach a brand-new codebase you've never seen.",
    },
]


def _generate_interview_questions(
    req: InterviewQuestionsRequest,
    profile: Any,
) -> InterviewQuestionsResponse:
    """
    Generate interview questions for the given JD + profile.

    LLM path: build a compact profile summary + JD excerpt, ask the model to
    produce categorised questions as a JSON array, return them.
    Fallback: slice the curated universal list to the requested count.
    """
    from job_sentinel.core.text import strip_html

    jd = strip_html(req.job_description)[:3000] if req.job_description else ""
    role_hint = req.role or (jd.splitlines()[0][:80] if jd else "Software Engineer")

    # ── Build profile summary for grounding ──────────────────────────────────
    profile_lines: list[str] = []
    if not profile.is_empty():
        if hasattr(profile, "basics") and profile.basics:
            b = profile.basics
            profile_lines.append(f"Candidate: {b.name}")
            if b.headline:
                profile_lines.append(f"Headline: {b.headline}")
        if hasattr(profile, "skills") and profile.skills:
            skill_list = [s for grp in profile.skills for s in grp.skills]
            profile_lines.append(f"Skills: {', '.join(skill_list[:20])}")
        if hasattr(profile, "experience") and profile.experience:
            recent = profile.experience[:2]
            for exp in recent:
                profile_lines.append(f"Role: {exp.role} at {exp.company}")
    profile_summary = "\n".join(profile_lines) if profile_lines else "No profile loaded."

    # ── Try LLM path ─────────────────────────────────────────────────────────
    if req.ai:
        try:
            from job_sentinel.config.settings import LLMSettings
            from job_sentinel.documents.providers import build_chat_backend

            cfg = LLMSettings()
            backend = build_chat_backend(cfg)
            if backend.available() and backend.ready():
                system = (
                    "You are an interview-prep assistant. Generate mock interview questions "
                    "tailored to the candidate's profile and the job description. "
                    "Return ONLY a JSON array, no prose, no markdown fences. "
                    "Each element must have exactly two string fields: "
                    '"category" (one of: Behavioural, Technical, Role-specific, Culture fit) '
                    f'and "question". Produce exactly {req.count} questions.'
                )
                user_parts = [f"Profile:\n{profile_summary}"]
                if jd:
                    user_parts.append(f"\nJob description (excerpt):\n{jd[:2000]}")
                else:
                    user_parts.append(f"\nRole: {role_hint}")
                user_parts.append(
                    f"\nGenerate exactly {req.count} interview questions as a JSON array."
                )
                raw = backend.chat(system, [{"role": "user", "content": "\n".join(user_parts)}])
                # Strip markdown fences if present
                raw = raw.strip()
                if raw.startswith("```"):
                    raw = "\n".join(raw.splitlines()[1:])
                    if raw.endswith("```"):
                        raw = raw[: raw.rfind("```")]
                import json

                items = json.loads(raw)
                questions = [
                    InterviewQuestion(
                        category=str(item.get("category", "General")),
                        question=str(item.get("question", "")),
                    )
                    for item in items
                    if item.get("question")
                ]
                if questions:
                    return InterviewQuestionsResponse(
                        questions=questions[: req.count],
                        source="llm",
                        role_hint=role_hint,
                    )
        except Exception as exc:
            logger.debug("Interview LLM path failed, using fallback: {}", exc)

    # ── Deterministic fallback ────────────────────────────────────────────────
    fallback = [InterviewQuestion(**q) for q in _FALLBACK_QUESTIONS]
    return InterviewQuestionsResponse(
        questions=fallback[: req.count],
        source="deterministic",
        role_hint=role_hint,
    )


def _mask_key(key: str) -> str:
    """Return a masked representation: 'sk-…XXXX' or '' if unset."""
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return key[:3] + "…" + key[-4:]


def _update_env_file(updates: dict[str, str]) -> None:
    """
    Atomically update or append LLM-related keys in the .env file.

    Reads the existing file, updates only the specified keys, then writes
    via a temp-file + rename to avoid partial writes.  Lines for unrelated
    keys are preserved verbatim.
    """
    import os
    import tempfile

    from job_sentinel.config.settings import _ENV_FILE

    env_path = Path(_ENV_FILE)
    existing_lines: list[str] = []
    if env_path.is_file():
        existing_lines = env_path.read_text(encoding="utf-8").splitlines(keepends=True)

    remaining = dict(updates)  # keys still to be written
    new_lines: list[str] = []
    for line in existing_lines:
        stripped = line.strip()
        if stripped.startswith("#") or "=" not in stripped:
            new_lines.append(line)
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in remaining:
            new_lines.append(f"{key}={remaining.pop(key)}\n")
        else:
            new_lines.append(line)

    # Append any keys that weren't already in the file.
    for key, value in remaining.items():
        new_lines.append(f"{key}={value}\n")

    # Atomic write via temp file in the same directory.
    fd, tmp = tempfile.mkstemp(dir=env_path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.writelines(new_lines)
        Path(tmp).replace(env_path)
    except Exception:
        Path(tmp).unlink(missing_ok=True)
        raise


app = create_app()
