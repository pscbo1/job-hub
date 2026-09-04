from __future__ import annotations

import pytest

from job_sentinel.communication.outlook import graph_delta_request, graph_message_to_message


def test_graph_message_uses_immutable_id_and_never_writes_source_state() -> None:
    item = graph_message_to_message(
        {
            "id": "mutable",
            "immutableId": "immutable-1",
            "subject": "Interview invitation",
            "body": {"content": "Please choose a time."},
            "receivedDateTime": "2026-09-03T01:02:03Z",
            "isRead": False,
            "from": {"emailAddress": {"name": "Recruiter"}},
        },
        "conversation-1",
    )
    assert item.external_message_id == "immutable-1"
    assert item.source_unread is True
    assert item.channel == "Recruiter"


def test_delta_url_must_be_graph_owned() -> None:
    assert graph_delta_request("https://graph.microsoft.com/v1.0/me/messages/delta")
    with pytest.raises(ValueError):
        graph_delta_request("https://example.com/redirect")
