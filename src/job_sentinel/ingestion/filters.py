"""Deterministic Job Pool exclusion rules. User-configurable; not collector logic."""

from __future__ import annotations

import json
import re
import unicodedata
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field, field_validator

if TYPE_CHECKING:
    from job_sentinel.core.models import Job
    from job_sentinel.db.repository import JobRepository

FILTER_STATE_INCLUDED = "included"
FILTER_STATE_EXCLUDED = "excluded"
REASON_OUTSOURCING = "outsourcing"
REASON_PART_TIME = "part_time"
REASON_INTERNSHIP = "internship"
REASON_CUSTOM_KEYWORD = "custom_keyword"
REASON_EXCLUDED_COMPANY = "excluded_company"

_META_KEY = "hub_filter_settings"

_COMPANY_SUFFIXES = (
    "股份有限公司",
    "有限责任公司",
    "有限公司",
    "集团公司",
    "集团",
    "inc.",
    "inc",
    "ltd.",
    "ltd",
    "llc",
    "co.",
    "corp.",
    "corp",
)

_OUTSOURCING_TERMS = (
    "外包",
    "派遣",
    "劳务派遣",
    "人力外包",
    "it外包",
    "outsourcing",
    "labor dispatch",
)
_PART_TIME_RE = re.compile(r"兼职|part[\s-]?time", re.IGNORECASE)
_INTERNSHIP_RE = re.compile(r"实习|intern(?:ship|s)?\b", re.IGNORECASE)


class FilterSettings(BaseModel):
    """Personal exclusion preferences stored in SQLite meta — not in collectors."""

    exclude_outsourcing: bool = True
    exclude_part_time: bool = True
    exclude_internship: bool = True
    custom_keywords: list[str] = Field(default_factory=list)
    excluded_companies: list[str] = Field(default_factory=list)

    @field_validator("custom_keywords", "excluded_companies", mode="before")
    @classmethod
    def _split_list(cls, v: object) -> object:
        if v is None:
            return []
        if isinstance(v, str):
            return split_user_list(v)
        if isinstance(v, list):
            out: list[str] = []
            for item in v:
                out.extend(split_user_list(str(item)))
            return out
        return v


class FilterDecision(BaseModel):
    filter_state: str = FILTER_STATE_INCLUDED
    filter_reasons: list[str] = Field(default_factory=list)


class ReapplyResult(BaseModel):
    scanned: int = 0
    included: int = 0
    excluded: int = 0


def split_user_list(text: str) -> list[str]:
    """Split comma / newline / semicolon lists from the Search page."""
    parts = re.split(r"[\n,;\uFF0C\uFF1B]+", text)
    seen: set[str] = set()
    out: list[str] = []
    for part in parts:
        item = " ".join(part.split()).strip()
        if not item:
            continue
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def normalize_company_name(name: str) -> str:
    """Whitespace, case, and obvious legal-suffix normalization for V0 matching."""
    text = unicodedata.normalize("NFKC", name or "").strip().lower()
    text = re.sub(r"[^\w\u4e00-\u9fff]+", " ", text, flags=re.UNICODE)
    text = " ".join(text.split())
    changed = True
    while text and changed:
        changed = False
        for suffix in _COMPANY_SUFFIXES:
            if text.endswith(suffix) and len(text) > len(suffix):
                text = text[: -len(suffix)].rstrip()
                changed = True
                break
    return text


def haystack_for_job(job: Job) -> str:
    """Inspectable blob: title, company, employment_type, description."""
    return " ".join(
        [
            job.title or "",
            job.company or "",
            job.employment_type or "",
            job.description or "",
        ]
    )


def _contains_term(haystack: str, term: str) -> bool:
    needle = term.strip()
    if not needle:
        return False
    if any("\u4e00" <= ch <= "\u9fff" for ch in needle):
        return needle in haystack
    return needle.casefold() in haystack.casefold()


def evaluate_job(job: Job, settings: FilterSettings) -> FilterDecision:
    """Return included/excluded plus why. Multiple reasons may apply."""
    blob = haystack_for_job(job)
    reasons: list[str] = []
    if settings.exclude_outsourcing and any(_contains_term(blob, t) for t in _OUTSOURCING_TERMS):
        reasons.append(REASON_OUTSOURCING)
    if settings.exclude_part_time and _PART_TIME_RE.search(blob):
        reasons.append(REASON_PART_TIME)
    if settings.exclude_internship and _INTERNSHIP_RE.search(blob):
        reasons.append(REASON_INTERNSHIP)
    if settings.custom_keywords and any(
        _contains_term(blob, kw) for kw in settings.custom_keywords
    ):
        reasons.append(REASON_CUSTOM_KEYWORD)
    job_company = normalize_company_name(job.company)
    if job_company:
        for name in settings.excluded_companies:
            excluded = normalize_company_name(name)
            if not excluded:
                continue
            if job_company == excluded or job_company.startswith(excluded):
                reasons.append(REASON_EXCLUDED_COMPANY)
                break
    if reasons:
        return FilterDecision(filter_state=FILTER_STATE_EXCLUDED, filter_reasons=reasons)
    return FilterDecision(filter_state=FILTER_STATE_INCLUDED, filter_reasons=[])


def load_filter_settings(repo: JobRepository) -> FilterSettings:
    raw = repo.get_meta(_META_KEY)
    if not raw:
        return FilterSettings()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return FilterSettings()
    if not isinstance(data, dict):
        return FilterSettings()
    return FilterSettings.model_validate(data)


def save_filter_settings(repo: JobRepository, settings: FilterSettings) -> FilterSettings:
    repo.set_meta(_META_KEY, settings.model_dump_json())
    return settings


def apply_filter_to_job(repo: JobRepository, job: Job, settings: FilterSettings) -> FilterDecision:
    decision = evaluate_job(job, settings)
    repo.update_hub_job_filter(
        job.id, filter_state=decision.filter_state, filter_reasons=decision.filter_reasons
    )
    return decision


def reapply_filters(repo: JobRepository, settings: FilterSettings | None = None) -> ReapplyResult:
    """Re-evaluate stored jobs. Does not scrape. Protects status / scores / discovered_at."""
    rules = settings if settings is not None else load_filter_settings(repo)
    result = ReapplyResult()
    for job in repo.list_all_hub_jobs():
        decision = apply_filter_to_job(repo, job, rules)
        result.scanned += 1
        if decision.filter_state == FILTER_STATE_EXCLUDED:
            result.excluded += 1
        else:
            result.included += 1
    return result
