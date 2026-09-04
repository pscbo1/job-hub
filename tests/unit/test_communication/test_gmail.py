"""Gmail Slice 2 contracts and read-only filtering tests."""

from __future__ import annotations

import base64
import json
import time
from typing import TYPE_CHECKING

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from job_sentinel.api.app import create_app
from job_sentinel.communication.gmail import (
    GmailOAuth,
    assess_message_risk,
    gmail_message_to_message,
    message_matches_filters,
)

if TYPE_CHECKING:
    from pathlib import Path


def _payload(
    *, subject: str = "Interview invitation", body: str = "Please choose a time"
) -> dict[str, object]:
    encoded = base64.urlsafe_b64encode(body.encode()).decode().rstrip("=")
    return {
        "id": "m-1",
        "threadId": "t-1",
        "internalDate": "1788400000000",
        "labelIds": ["UNREAD"],
        "snippet": body,
        "payload": {
            "headers": [
                {"name": "Subject", "value": subject},
                {"name": "From", "value": "Recruiter <jobs@example.com>"},
            ],
            "body": {"data": encoded},
        },
    }


def test_gmail_message_normalizes_thread_and_unread_state() -> None:
    message = gmail_message_to_message(_payload(), "gmail:t-1")
    assert message.id == "gmail:m-1"
    assert message.external_message_id == "m-1"
    assert message.conversation_id == "gmail:t-1"
    assert message.source_unread is True
    assert message.body == "Please choose a time"


def test_gmail_filters_are_settings_driven() -> None:
    payload = _payload(subject="Data labeling gig", body="Freelance opportunity")
    assert not message_matches_filters(payload, hide_gig_noise=True)
    assert message_matches_filters(payload, hide_gig_noise=False)
    assert not message_matches_filters(
        _payload(subject="Other update"), keep_words="interview,offer"
    )
    assert not message_matches_filters(_payload(subject="Interview"), skip_companies="example.com")


def test_gmail_filters_require_unread_and_skip_housekeeping() -> None:
    read = _payload()
    read["labelIds"] = []
    assert not message_matches_filters(read)
    assert not message_matches_filters(_payload(subject="Application received"))


def test_gmail_risk_assessment_quarantines_credential_phishing() -> None:
    payload = _payload(subject="Verify your account", body="Sign in at http://192.0.2.1 now")
    headers = payload["payload"]["headers"]
    headers.append({"name": "Authentication-Results", "value": "dmarc=fail"})
    level, reasons = assess_message_risk(payload)
    assert level == "high"
    assert "sender authentication failed" in reasons


def test_gmail_oauth_begin_uses_readonly_scope(tmp_path: Path) -> None:
    credentials = tmp_path / "credentials.json"
    credentials.write_text(
        json.dumps({"installed": {"client_id": "client-id", "client_secret": "secret"}}),
        encoding="utf-8",
    )
    flow = GmailOAuth(credentials, tmp_path / "token.json").begin("http://127.0.0.1/callback")
    assert "gmail.readonly" in flow["authorization_url"]
    assert "access_type=offline" in flow["authorization_url"]
    assert "secret" not in flow["authorization_url"]
    assert len(flow["state"]) > 10


def test_gmail_http_proxy_is_opt_in(monkeypatch) -> None:
    from job_sentinel.communication.gmail import _http_options

    monkeypatch.delenv("GMAIL_HTTP_PROXY", raising=False)
    assert _http_options() == {}
    monkeypatch.setenv("GMAIL_HTTP_PROXY", "http://127.0.0.1:7890")
    assert _http_options() == {"proxy": "http://127.0.0.1:7890"}


def test_gmail_oauth_rejects_missing_credentials(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="credentials file"):
        GmailOAuth(tmp_path / "missing.json", tmp_path / "token.json").begin(
            "http://localhost/callback"
        )


def test_gmail_disconnect_clears_local_token(tmp_path: Path) -> None:
    auth_dir = tmp_path / "auth"
    auth_dir.mkdir()
    token_path = auth_dir / "gmail_token.json"
    token_path.write_text('{"access_token":"local"}', encoding="utf-8")
    client = TestClient(
        create_app(
            profile_path=tmp_path / "p.yaml", db_path=tmp_path / "db.sqlite", auth_dir=auth_dir
        )
    )
    response = client.post("/api/communication/accounts/gmail-primary/disconnect")
    assert response.status_code == 200
    assert response.json() == {"connected": False}
    assert not token_path.exists()


@respx.mock
def test_gmail_sync_ingests_read_only_thread(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    credentials = tmp_path / "credentials.json"
    credentials.write_text(
        json.dumps({"installed": {"client_id": "client-id", "client_secret": "secret"}}),
        encoding="utf-8",
    )
    auth_dir = tmp_path / "auth"
    auth_dir.mkdir()
    (auth_dir / "gmail_token.json").write_text(
        json.dumps({"access_token": "access", "expires_at": int(time.time()) + 3600}),
        encoding="utf-8",
    )
    monkeypatch.setenv("GMAIL_CREDENTIALS_PATH", str(credentials))
    listing = respx.get("https://gmail.googleapis.com/gmail/v1/users/me/messages").mock(
        return_value=httpx.Response(200, json={"messages": [{"id": "m-1", "threadId": "t-1"}]})
    )
    detail = respx.get("https://gmail.googleapis.com/gmail/v1/users/me/messages/m-1").mock(
        return_value=httpx.Response(200, json=_payload())
    )
    client = TestClient(
        create_app(
            profile_path=tmp_path / "p.yaml",
            db_path=tmp_path / "db.sqlite",
            auth_dir=auth_dir,
        )
    )
    response = client.post("/api/communication/accounts/gmail-primary/sync", json={})
    assert response.status_code == 200, response.text
    assert response.json()["ingested"] == 1
    assert listing.called and detail.called
    response = client.get("/api/communication/conversations")
    assert response.json()["count"] == 1
    settings = client.get("/api/communication/settings").json()
    assert settings["gmail_last_sync_at"]


@respx.mock
def test_gmail_sync_follows_pages_until_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    credentials = tmp_path / "credentials.json"
    credentials.write_text(
        json.dumps({"installed": {"client_id": "client-id", "client_secret": "secret"}}),
        encoding="utf-8",
    )
    auth_dir = tmp_path / "auth"
    auth_dir.mkdir()
    (auth_dir / "gmail_token.json").write_text(
        json.dumps({"access_token": "access", "expires_at": int(time.time()) + 3600}),
        encoding="utf-8",
    )
    monkeypatch.setenv("GMAIL_CREDENTIALS_PATH", str(credentials))
    page_one = {"messages": [{"id": "m-1", "threadId": "t-1"}], "nextPageToken": "next"}
    page_two = {"messages": [{"id": "m-2", "threadId": "t-2"}]}
    listing = respx.get("https://gmail.googleapis.com/gmail/v1/users/me/messages").mock(
        side_effect=[httpx.Response(200, json=page_one), httpx.Response(200, json=page_two)]
    )
    first = _payload()
    second = _payload(subject="Offer details")
    second["id"] = "m-2"
    second["threadId"] = "t-2"
    respx.get("https://gmail.googleapis.com/gmail/v1/users/me/messages/m-1").mock(
        return_value=httpx.Response(200, json=first)
    )
    respx.get("https://gmail.googleapis.com/gmail/v1/users/me/messages/m-2").mock(
        return_value=httpx.Response(200, json=second)
    )
    client = TestClient(
        create_app(
            profile_path=tmp_path / "p.yaml", db_path=tmp_path / "db.sqlite", auth_dir=auth_dir
        )
    )
    response = client.post(
        "/api/communication/accounts/gmail-primary/sync", json={"max_messages": 150}
    )
    assert response.status_code == 200, response.text
    assert response.json()["ingested"] == 2
    assert listing.call_count == 2
