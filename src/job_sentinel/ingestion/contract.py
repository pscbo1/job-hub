"""Canonical collector record (PRD §13.2) plus ingest-run summary."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class CollectorRecord(BaseModel):
    """One item from a CN collector, before Job Hub persistence."""

    channel_key: str = Field(..., min_length=1)
    market: str = Field(default="CN")
    source_job_id: str | None = Field(default=None)
    source_url: str = Field(default="")
    application_url: str = Field(default="")
    title: str = Field(default="")
    company: str = Field(default="")
    location: str = Field(default="")
    description: str = Field(default="")
    requirements: str | None = Field(default=None)
    published_at: datetime | None = Field(default=None)
    collected_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    raw_payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("channel_key", "market", "title", "company", "location", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("source_job_id", "requirements", mode="before")
    @classmethod
    def _blank_optional(cls, v: object) -> object:
        if v is None or v == "":
            return None
        return v.strip() if isinstance(v, str) else v


class IngestResult(BaseModel):
    """Per-run counts. One bad record never aborts the rest."""

    raw_inserted: int = 0
    jobs_created: int = 0
    jobs_updated: int = 0
    invalid: int = 0
    skipped: int = 0
    excluded: int = 0
    errors: list[str] = Field(default_factory=list)
