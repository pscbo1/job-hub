"""Communication Hub Slice 1 repository contract tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest

from job_sentinel.communication.models import (
    CommunicationConversation,
    CommunicationMarket,
    CommunicationMessage,
    CommunicationSource,
)
from job_sentinel.db.repository import JobRepository

if TYPE_CHECKING:
    from pathlib import Path


@pytest.fixture()
def repo(tmp_path: Path) -> JobRepository:
    value = JobRepository(tmp_path / "communication.db")
    yield value
    value.close()


def _conversation(
    *,
    id: str = "conversation-1",
    retained: bool = False,
    market: CommunicationMarket = CommunicationMarket.CN,
) -> CommunicationConversation:
    now = datetime.now(UTC)
    conversation = CommunicationConversation(
        id=id,
        company="Acme",
        role="Researcher",
        source=CommunicationSource.MANUAL,
        market=market,
        retained=retained,
        created_at=now,
        updated_at=now,
    )
    conversation.messages = [
        CommunicationMessage(
            id=f"{id}-message",
            conversation_id=conversation.id,
            body="Please confirm an interview time",
            summary="Please confirm an interview time",
            source=CommunicationSource.MANUAL,
            channel="wechat",
            occurred_at=now,
            is_actionable=not retained,
        )
    ]
    return conversation


def test_manual_conversation_is_persisted_and_idempotent(repo: JobRepository) -> None:
    first = repo.create_communication_conversation(_conversation(), request_id="request-1")
    replay = repo.create_communication_conversation(_conversation(), request_id="request-1")
    assert first.id == replay.id
    assert len(repo.list_communication_conversations()) == 1
    assert (
        repo.get_communication_conversation(first.id).messages[0].body
        == "Please confirm an interview time"
    )  # type: ignore[union-attr]


def test_pending_and_retained_views_are_distinct(repo: JobRepository) -> None:
    repo.create_communication_conversation(_conversation(), request_id="pending")
    repo.create_communication_conversation(
        _conversation(id="conversation-2", retained=True), request_id="retained"
    )
    assert [item.id for item in repo.list_communication_conversations(view="pending")] == [
        "conversation-1"
    ]
    assert [item.id for item in repo.list_communication_conversations(view="retained")] == [
        "conversation-2"
    ]


def test_filters_market_and_source(repo: JobRepository) -> None:
    repo.create_communication_conversation(
        _conversation(market=CommunicationMarket.CN), request_id="cn"
    )
    assert repo.list_communication_conversations(market="en") == []
    assert len(repo.list_communication_conversations(sources=["manual"], market="cn")) == 1
    assert repo.list_communication_conversations(sources=["email"]) == []


def test_archive_hides_conversation_and_action_is_versioned(repo: JobRepository) -> None:
    repo.create_communication_conversation(_conversation(), request_id="archive")
    archived = repo.communication_action("conversation-1", "archive", ["conversation-1-message"], 1)
    assert archived is not None and archived.lifecycle.value == "archived"
    assert repo.list_communication_conversations() == []
    assert (
        repo.communication_action("conversation-1", "archive", ["conversation-1-message"], 1)
        is None
    )


def test_handled_unretained_conversation_is_archived(repo: JobRepository) -> None:
    repo.create_communication_conversation(_conversation(), request_id="handled")
    result = repo.communication_action("conversation-1", "handled", ["conversation-1-message"], 1)
    assert result is not None and result.lifecycle.value == "archived"
    assert repo.list_communication_conversations() == []


def test_communication_settings_have_defaults_and_round_trip(repo: JobRepository) -> None:
    defaults = repo.get_communication_settings()
    assert defaults["default_sources"] == "email"
    stored = repo.update_communication_settings(
        {"default_market": "cn", "retention_mode": "manual"}
    )
    assert stored["default_market"] == "cn"
    assert stored["retention_mode"] == "manual"


def test_append_manual_record_is_idempotent(repo: JobRepository) -> None:
    repo.create_communication_conversation(_conversation(), request_id="base")
    message = CommunicationMessage(
        id="extra",
        conversation_id="conversation-1",
        body="Called back",
        summary="Called back",
        source=CommunicationSource.MANUAL,
        channel="phone",
        occurred_at=datetime.now(UTC),
    )
    first = repo.append_communication_record("conversation-1", message, request_id="extra-1")
    second = repo.append_communication_record("conversation-1", message, request_id="extra-1")
    assert first is not None and second is not None
    assert len(first.messages) == 2
    assert len(second.messages) == 2


def test_expired_retained_conversation_archives_but_task_holds(repo: JobRepository) -> None:
    old = _conversation(id="old", retained=True)
    old.updated_at = datetime.now(UTC) - timedelta(days=15)
    repo.create_communication_conversation(old, request_id="old")
    assert repo.archive_expired_communication() == 1
    assert repo.get_communication_conversation("old").lifecycle.value == "archived"  # type: ignore[union-attr]
