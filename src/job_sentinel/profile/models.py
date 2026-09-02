"""
profile/models.py
──────────────────
Pydantic models for the **universal profile** — the single source of truth for
everything that can appear on a CV.

The profile is intentionally a superset: you keep *every* bullet, role, and
project here, and a tailored resume is produced by *selecting and ordering* a
subset for a given job posting (see ``documents/``). Adding a section type is a
new model here; the YAML store and the LaTeX template pick it up.

Design notes
────────────
- Every list defaults to empty, every optional field to ``None``/"" — so a
  half-filled profile still validates. You grow it over time.
- ``tags`` on the item models drive relevance matching later (Phase 2): a
  bullet tagged ``python, ml`` can be promoted for a posting that mentions them.
- Dates are free-form strings ("2024", "May 2025", "Present") so we never fight
  a parser over how a school formatted a date — ATS parsers read them as text.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from pydantic import BaseModel, Field


class _Item(BaseModel):
    """Common base: optional relevance tags used by the tailoring layer."""

    tags: list[str] = Field(default_factory=list, description="Keywords for job matching")


class Link(BaseModel):
    """A labelled URL (GitHub, LinkedIn, portfolio, …)."""

    label: str
    url: str


class Basics(BaseModel):
    """Identity and contact block shown in the resume header."""

    name: str = ""
    headline: str = Field(default="", description="e.g. 'CS Undergraduate · Aspiring SWE'")
    email: str = ""
    phone: str = ""
    location: str = ""
    links: list[Link] = Field(default_factory=list)
    summary: str = Field(default="", description="Short professional summary / objective")


class Education(_Item):
    institution: str = ""
    degree: str = Field(default="", description="e.g. 'B.S. in Computer Science'")
    location: str = ""
    start: str = ""
    end: str = ""
    gpa: str = ""
    highlights: list[str] = Field(default_factory=list, description="Coursework, honors, etc.")


class Experience(_Item):
    company: str = ""
    role: str = ""
    location: str = ""
    start: str = ""
    end: str = ""
    bullets: list[str] = Field(default_factory=list, description="Accomplishment bullet points")


class Project(_Item):
    name: str = ""
    description: str = ""
    url: str = ""
    bullets: list[str] = Field(default_factory=list)


class SkillGroup(BaseModel):
    """A named cluster of skills, e.g. 'Languages: Python, Go, SQL'."""

    category: str = ""
    skills: list[str] = Field(default_factory=list)


class Certification(_Item):
    name: str = ""
    issuer: str = ""
    date: str = ""


class Award(_Item):
    title: str = ""
    issuer: str = ""
    date: str = ""
    description: str = ""


class Publication(_Item):
    title: str = ""
    venue: str = ""
    date: str = ""
    url: str = ""


class Profile(BaseModel):
    """The complete universal profile."""

    basics: Basics = Field(default_factory=Basics)
    education: list[Education] = Field(default_factory=list)
    experience: list[Experience] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    skills: list[SkillGroup] = Field(default_factory=list)
    certifications: list[Certification] = Field(default_factory=list)
    awards: list[Award] = Field(default_factory=list)
    publications: list[Publication] = Field(default_factory=list)

    def is_empty(self) -> bool:
        """True if nothing but defaults — used to nudge the user to fill it in."""
        return not (
            self.basics.name or self.education or self.experience or self.projects or self.skills
        )


class ProfileVersion(BaseModel):
    """A user-created immutable snapshot of the current master profile."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    version_number: int = Field(default=1, ge=1)
    profile: Profile
    profile_schema_version: int = Field(default=1, ge=1)
    version_label: str = ""
    notes: str = ""
    version_date: date
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    request_id: str
    request_hash: str
