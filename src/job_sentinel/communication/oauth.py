"""Microsoft device-code OAuth helper for read-only Outlook access."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any

import msal  # type: ignore[import-untyped]

if TYPE_CHECKING:
    from pathlib import Path

SCOPES = ["Mail.Read"]
AUTHORITY = "https://login.microsoftonline.com/common"


class OutlookOAuth:
    def __init__(self, cache_path: Path) -> None:
        self.client_id = os.environ.get("OUTLOOK_CLIENT_ID", "").strip()
        self.cache_path = cache_path

    def begin(self) -> dict[str, str]:
        if not self.client_id:
            raise ValueError("OUTLOOK_CLIENT_ID is not configured")
        cache = msal.SerializableTokenCache()
        app = msal.PublicClientApplication(self.client_id, authority=AUTHORITY, token_cache=cache)
        flow = app.initiate_device_flow(scopes=SCOPES)
        if "user_code" not in flow:
            raise RuntimeError("Microsoft device flow could not be started")
        self._write_cache(cache)
        return {
            "user_code": flow["user_code"],
            "verification_uri": flow.get("verification_uri", "https://microsoft.com/devicelogin"),
            "message": flow.get("message", "Open the verification URL and enter the code."),
        }

    def acquire(self, flow: dict[str, Any]) -> dict[str, Any]:
        cache = msal.SerializableTokenCache()
        app = msal.PublicClientApplication(self.client_id, authority=AUTHORITY, token_cache=cache)
        result = app.acquire_token_by_device_flow(flow)
        if "access_token" in result:
            self._write_cache(cache)
        return dict(result)

    def _write_cache(self, cache: msal.SerializableTokenCache) -> None:
        if cache.has_state_changed:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(cache.serialize(), encoding="utf-8")
