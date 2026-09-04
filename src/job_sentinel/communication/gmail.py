"""Read-only Gmail OAuth and message normalization for Communication Hub."""

from __future__ import annotations

import base64
import binascii
import json
import os
import secrets
import time
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any
from urllib.parse import urlencode, urlparse

import httpx

from job_sentinel.communication.models import (
    CommunicationConversation,
    CommunicationMessage,
    CommunicationSource,
    ConversationStage,
)

if TYPE_CHECKING:
    from pathlib import Path

GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"
GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"  # noqa: S105
GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"


def _http_options() -> dict[str, object]:
    """Return optional transport settings without logging or storing proxy secrets."""
    proxy = os.environ.get("GMAIL_HTTP_PROXY", "").strip()
    return {"proxy": proxy} if proxy else {}


def _client_config(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise ValueError("GMAIL_CREDENTIALS_PATH does not point to a credentials file")
    raw = json.loads(path.read_text(encoding="utf-8"))
    config = raw.get("installed") or raw.get("web") or raw
    client_id = str(config.get("client_id") or "").strip()
    client_secret = str(config.get("client_secret") or "").strip()
    if not client_id or not client_secret:
        raise ValueError("Gmail credentials file is missing client_id or client_secret")
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "auth_uri": str(config.get("auth_uri") or GOOGLE_AUTH),
        "token_uri": str(config.get("token_uri") or GOOGLE_TOKEN_ENDPOINT),
    }


class GmailOAuth:
    """Minimal desktop OAuth flow using Google's documented HTTP endpoints."""

    def __init__(self, credentials_path: Path, token_path: Path) -> None:
        self.credentials_path = credentials_path
        self.token_path = token_path

    def begin(self, redirect_uri: str) -> dict[str, str]:
        config = _client_config(self.credentials_path)
        state = secrets.token_urlsafe(24)
        query = urlencode(
            {
                "client_id": config["client_id"],
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": GMAIL_SCOPE,
                "access_type": "offline",
                "prompt": "consent",
                "state": state,
            }
        )
        return {
            "authorization_url": f"{config['auth_uri']}?{query}",
            "state": state,
            "redirect_uri": redirect_uri,
        }

    def exchange_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        config = _client_config(self.credentials_path)
        response = httpx.post(
            config["token_uri"],
            data={
                "code": code,
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=30,
            **_http_options(),
        )
        response.raise_for_status()
        token = dict(response.json())
        token["expires_at"] = int(time.time()) + int(token.get("expires_in", 3600))
        self._write_token(token)
        return token

    def access_token(self) -> str:
        token = self._read_token()
        if (
            token
            and str(token.get("access_token") or "")
            and int(token.get("expires_at", 0)) > int(time.time()) + 60
        ):
            return str(token["access_token"])
        refresh = str(token.get("refresh_token") or "") if token else ""
        if not refresh:
            raise ValueError("Gmail is not connected")
        config = _client_config(self.credentials_path)
        response = httpx.post(
            config["token_uri"],
            data={
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
                "refresh_token": refresh,
                "grant_type": "refresh_token",
            },
            timeout=30,
            **_http_options(),
        )
        response.raise_for_status()
        refreshed = dict(response.json())
        refreshed["refresh_token"] = refresh
        refreshed["expires_at"] = int(time.time()) + int(refreshed.get("expires_in", 3600))
        self._write_token(refreshed)
        return str(refreshed["access_token"])

    def connected(self) -> bool:
        try:
            return bool(self._read_token()) and bool(self.access_token())
        except (OSError, ValueError, httpx.HTTPError, json.JSONDecodeError):
            return False

    def _read_token(self) -> dict[str, Any] | None:
        if not self.token_path.is_file():
            return None
        return dict(json.loads(self.token_path.read_text(encoding="utf-8")))

    def _write_token(self, token: dict[str, Any]) -> None:
        self.token_path.parent.mkdir(parents=True, exist_ok=True)
        self.token_path.write_text(json.dumps(token), encoding="utf-8")


def _header(payload: dict[str, Any], name: str) -> str:
    headers = payload.get("payload", {}).get("headers", [])
    for item in headers:
        if str(item.get("name", "")).lower() == name.lower():
            return str(item.get("value") or "").strip()
    return ""


def _body(payload: dict[str, Any]) -> str:
    def decode(data: object) -> str:
        if not data:
            return ""
        try:
            return base64.urlsafe_b64decode(str(data) + "===").decode("utf-8", errors="replace")
        except (ValueError, binascii.Error):
            return ""

    root = payload.get("payload") or {}
    direct = decode((root.get("body") or {}).get("data"))
    if direct:
        return direct
    for part in root.get("parts") or []:
        value = decode((part.get("body") or {}).get("data"))
        if value:
            return value
    return str(payload.get("snippet") or "").strip()


def gmail_message_to_message(payload: dict[str, Any], conversation_id: str) -> CommunicationMessage:
    """Normalize one Gmail message without changing Gmail state."""
    internal_ms = int(payload.get("internalDate") or 0)
    occurred = datetime.fromtimestamp(internal_ms / 1000, UTC) if internal_ms else datetime.now(UTC)
    subject = _header(payload, "Subject")
    body = _body(payload)
    return CommunicationMessage(
        id=f"gmail:{payload.get('id') or secrets.token_hex(8)}",
        conversation_id=conversation_id,
        body=body,
        summary=(subject or body or str(payload.get("snippet") or ""))[:240].strip(),
        source=CommunicationSource.EMAIL,
        channel="Gmail",
        external_message_id=str(payload.get("id") or "") or None,
        occurred_at=occurred,
        source_unread="UNREAD" in (payload.get("labelIds") or []),
    )


def gmail_conversation_from_message(
    payload: dict[str, Any], message: CommunicationMessage, conversation_id: str
) -> CommunicationConversation:
    subject = _header(payload, "Subject")
    sender = _header(payload, "From")
    stage = ConversationStage.CONTACT
    lowered = f"{subject} {message.body}".lower()
    if any(word in lowered for word in ("offer", "contract", "意向", "offer letter")):
        stage = ConversationStage.OFFER
    elif any(word in lowered for word in ("interview", "onsite", "phone screen")):
        stage = ConversationStage.INTERVIEW
    elif any(word in lowered for word in ("assessment", "take-home", "coding test")):
        stage = ConversationStage.ASSESSMENT
    elif any(
        word in lowered
        for word in (
            "补充材料",
            "补材料",
            "additional documents",
            "provide documents",
            "work authorization",
        )
    ):
        stage = ConversationStage.MATERIALS
    elif any(
        word in lowered
        for word in ("确认意向", "确认是否接受", "interested in moving", "next steps")
    ):
        stage = ConversationStage.INTENT
    elif any(
        word in lowered
        for word in ("new role", "new opportunity", "职位推荐", "岗位推荐", "opening")
    ):
        stage = ConversationStage.ROLE
    company = sender.split("<", 1)[0].strip().strip('"')
    if "<" in sender and "@" in sender:
        company = sender.rsplit("@", 1)[-1].split(">", 1)[0].strip()
    return CommunicationConversation(
        id=conversation_id,
        company=company,
        role=subject,
        contact=sender,
        source=CommunicationSource.EMAIL,
        channel="Gmail",
        external_thread_id=str(payload.get("threadId") or "") or None,
        stage=stage,
        created_at=message.occurred_at,
        updated_at=message.occurred_at,
        messages=[message],
    )


def message_matches_filters(
    payload: dict[str, Any],
    *,
    keep_words: str = "",
    skip_words: str = "",
    stale_days: int = 30,
    skip_companies: str = "",
    label_linkedin_noise: bool = True,
    hide_gig_noise: bool = True,
    own_email: str = "",
) -> bool:
    """Apply user settings; no recruiting keywords are required by code."""
    subject = _header(payload, "Subject")
    sender = _header(payload, "From")
    body = _body(payload)
    text = f"{subject} {sender} {body}".lower()

    # Communication is for new counterpart messages, not mailbox housekeeping.
    if "UNREAD" not in (payload.get("labelIds") or []):
        return False
    if any(
        label in (payload.get("labelIds") or [])
        for label in ("CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "SPAM", "TRASH")
    ):
        return False
    own = own_email.strip().lower()
    if own and own in sender.lower():
        return False
    if any(
        phrase in text
        for phrase in (
            "security alert",
            "安全提醒",
            "new sign-in",
            "新设备登录",
            "verify your identity",
            "验证身份",
            "password reset",
            "重置密码",
            "verification code",
            "验证码",
            "read receipt",
            "已读回执",
            "application received",
            "收到申请",
            "application submitted",
            "申请已提交",
            "人才库",
            "talent pool",
            "we regret",
            "不幸地通知",
            "职位已关闭",
            "position has been filled",
            "weekly digest",
            "newsletter",
        )
    ):
        return False

    def tokens(value: str) -> list[str]:
        return [part.strip().lower() for part in value.split(",") if part.strip()]

    if keep_words and not any(word in text for word in tokens(keep_words)):
        return False
    if any(word in text for word in tokens(skip_words)):
        return False
    if any(company in text for company in tokens(skip_companies)):
        return False
    if stale_days > 0:
        raw_ms = int(payload.get("internalDate") or 0)
        if raw_ms and datetime.fromtimestamp(raw_ms / 1000, UTC) < datetime.now(UTC) - timedelta(
            days=stale_days
        ):
            return False
    sender_lower = sender.lower()
    if (
        label_linkedin_noise
        and "linkedin.com" in sender_lower
        and any(word in text for word in ("data labeling", "data annotation", "gig", "freelance"))
    ):
        return False
    return not (
        hide_gig_noise and any(word in text for word in ("兼职", "外包", "intern", "freelance"))
    )


def assess_message_risk(payload: dict[str, Any]) -> tuple[str, list[str]]:
    """Conservative phishing screen; unknown messages remain normal Pending."""
    subject = _header(payload, "Subject")
    sender = _header(payload, "From")
    reply_to = _header(payload, "Reply-To")
    body = _body(payload)
    text = f"{subject} {body}".lower()
    reasons: list[str] = []
    auth = _header(payload, "Authentication-Results").lower()
    if any(token in auth for token in ("dmarc=fail", "spf=fail", "dkim=fail")):
        reasons.append("sender authentication failed")

    def domain(value: str) -> str:
        return value.rsplit("@", 1)[-1].strip(" >\t\r\n").lower() if "@" in value else ""

    sender_domain = domain(sender)
    reply_domain = domain(reply_to)
    if sender_domain and reply_domain and sender_domain != reply_domain:
        reasons.append("Reply-To domain differs from sender")
    suspicious_url = False
    for token in text.replace("(", " ").replace(")", " ").split():
        if token.startswith(("http://", "https://")):
            parsed = urlparse(token.rstrip(".,"))
            host = (parsed.hostname or "").lower()
            if host.replace(".", "").isdigit() or host in {
                "bit.ly",
                "tinyurl.com",
                "t.co",
                "is.gd",
            }:
                suspicious_url = True
                break
    if suspicious_url:
        reasons.append("suspicious link")
    credential_language = any(
        phrase in text
        for phrase in (
            "verify your account",
            "sign in",
            "login",
            "password",
            "验证码",
            "付款",
            "payment",
        )
    )
    if credential_language:
        reasons.append("credential or payment request")
    high = ("sender authentication failed" in reasons and credential_language) or (
        suspicious_url and credential_language
    )
    return ("high" if high else ("suspicious" if reasons else "none"), reasons)


def gmail_api_url(path: str) -> str:
    if not path.startswith("/") or "?" in path or "#" in path:
        raise ValueError("Gmail API path must be a relative path")
    return f"{GMAIL_API}{path}"


def gmail_list_request(token: str, *, query: str, page_token: str | None = None) -> httpx.Response:
    params: dict[str, str | int] = {"q": query, "maxResults": 100}
    if page_token:
        params["pageToken"] = page_token
    return httpx.get(
        gmail_api_url("/messages"),
        params=params,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
        **_http_options(),
    )


def gmail_message_request(token: str, message_id: str) -> httpx.Response:
    return httpx.get(
        gmail_api_url(f"/messages/{message_id}"),
        headers={"Authorization": f"Bearer {token}"},
        params={"format": "full"},
        timeout=30,
        **_http_options(),
    )
