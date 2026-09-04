from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class CommunicationSource(StrEnum):
    EMAIL = "email"
    BOSS = "boss"
    LIEPIN = "liepin"
    ZHILIAN = "zhilian"
    MANUAL = "manual"


class CommunicationMarket(StrEnum):
    ALL = "all"
    CN = "cn"
    EN = "en"
    UNCLASSIFIED = "unclassified"


class ConversationLifecycle(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    NOT_INTERESTED = "not_interested"
    DELETED = "deleted"
    QUARANTINED = "quarantined"


class ConversationStage(StrEnum):
    CONTACT = "contact"
    ASSESSMENT = "assessment"
    MATERIALS = "materials"
    INTENT = "intent"
    ROLE = "role"
    INTERVIEW = "interview"
    OFFER = "offer"


class CommunicationMessage(BaseModel):
    id: str
    conversation_id: str
    body: str = ""
    summary: str = ""
    source: CommunicationSource
    channel: str = ""
    external_message_id: str | None = None
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source_unread: bool = False
    seen_at: datetime | None = None
    handled_at: datetime | None = None
    workspace_visible: bool = True
    is_actionable: bool = True


class CommunicationConversation(BaseModel):
    id: str
    company: str = ""
    role: str = ""
    contact: str = ""
    source: CommunicationSource
    market: CommunicationMarket = CommunicationMarket.UNCLASSIFIED
    channel: str = ""
    external_thread_id: str | None = None
    lifecycle: ConversationLifecycle = ConversationLifecycle.ACTIVE
    retained: bool = False
    stage: ConversationStage = ConversationStage.CONTACT
    job_id: str | None = None
    application_id: str | None = None
    version: int = 1
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    retention_mode: Literal["14_days", "30_days", "custom_days", "until_date", "manual"] = "14_days"
    retention_days: int | None = None
    retain_until: datetime | None = None
    risk_level: Literal["none", "suspicious", "high"] = "none"
    risk_reasons: list[str] = Field(default_factory=list)
    messages: list[CommunicationMessage] = Field(default_factory=list)
    tasks: list[dict[str, object]] = Field(default_factory=list)


class ManualConversationCreate(BaseModel):
    summary: str = Field(min_length=1)
    source: CommunicationSource = CommunicationSource.MANUAL
    company: str = ""
    role: str = ""
    contact: str = ""
    occurred_at: datetime | None = None
    channel: str = "manual"
    market: CommunicationMarket = CommunicationMarket.UNCLASSIFIED
    job_id: str | None = None
    application_id: str | None = None
    needs_action: bool = False
    request_id: str | None = None
    external_thread_id: str | None = None

    @field_validator("summary", "company", "role", "contact", "channel", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> str:
        return str(value or "").strip()


class CommunicationActionRequest(BaseModel):
    action: Literal["keep", "handled", "archive", "delete"]
    expected_version: int = 1
    visible_message_ids: list[str] = Field(default_factory=list)


class CommunicationPatch(BaseModel):
    expected_version: int = 1
    job_id: str | None = None
    application_id: str | None = None
    stage: ConversationStage | None = None
    retained: bool | None = None
    retention_mode: Literal["14_days", "30_days", "custom_days", "until_date", "manual"] | None = (
        None
    )
    retention_days: int | None = Field(default=None, ge=1, le=3650)
    retain_until: datetime | None = None


class CommunicationTaskLink(BaseModel):
    task_id: str = Field(min_length=1)


class GmailSyncRequest(BaseModel):
    query: str | None = None
    max_messages: int = Field(default=100, ge=1, le=500)


class BrowserCapturePreviewRequest(BaseModel):
    platform: Literal["boss", "liepin", "zhilian"]
    visible_text: str = Field(min_length=1, max_length=20000)
    company: str = ""
    role: str = ""
    contact: str = ""
    external_thread_id: str | None = None

    @field_validator(
        "visible_text", "company", "role", "contact", "external_thread_id", mode="before"
    )
    @classmethod
    def clean_text(cls, value: object) -> str | None:
        if value is None:
            return None
        return " ".join(str(value).split())


class ManualRecordCreate(BaseModel):
    summary: str = Field(min_length=1)
    channel: str = "manual"
    occurred_at: datetime | None = None
    needs_action: bool = False
    request_id: str | None = None

    @field_validator("summary", "channel", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> str:
        return str(value or "").strip()


class CommunicationJobCreate(BaseModel):
    company: str = ""
    role: str = ""
    location: str = ""
    job_url: str = ""
    market: str = "unclassified"

    @field_validator("company", "role", "location", "job_url", "market", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> str:
        return str(value or "").strip()
