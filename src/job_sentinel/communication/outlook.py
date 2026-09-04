"""Read-only Microsoft Graph contracts used by the Outlook sync batch."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from job_sentinel.communication.models import CommunicationMessage, CommunicationSource

GRAPH_SCOPE = "Mail.Read"


def graph_message_to_message(payload: dict[str, Any], conversation_id: str) -> CommunicationMessage:
    """Normalize one Graph message without changing mailbox state."""
    sender = payload.get("from") or {}
    sender_name = ((sender.get("emailAddress") or {}).get("name") or "").strip()
    body = payload.get("body") or {}
    content = str(body.get("content") or payload.get("subject") or "").strip()
    occurred = payload.get("receivedDateTime") or datetime.now(UTC).isoformat()
    return CommunicationMessage(
        id=str(payload.get("id") or payload.get("immutableId") or ""),
        conversation_id=conversation_id,
        body=content,
        summary=(str(payload.get("subject") or content)[:240]).strip(),
        source=CommunicationSource.EMAIL,
        channel=sender_name or "Outlook",
        external_message_id=str(payload.get("immutableId") or payload.get("id") or "") or None,
        occurred_at=datetime.fromisoformat(str(occurred).replace("Z", "+00:00")),
        source_unread=not bool(payload.get("isRead", False)),
    )


def graph_delta_request(url: str | None) -> str:
    """Return the next delta URL, rejecting non-Graph redirects."""
    if not url or not url.startswith("https://graph.microsoft.com/"):
        raise ValueError("Graph delta URL is missing or invalid")
    return url
