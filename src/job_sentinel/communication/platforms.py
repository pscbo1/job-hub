"""Browser-only platform manifests for Communication Hub."""

from __future__ import annotations

import os
from urllib.parse import urlparse

_PLATFORMS = (
    ("boss", "BOSS", "https://www.zhipin.com/", "browser_only"),
    ("liepin", "Liepin", "https://www.liepin.com/", "manual_only"),
    ("zhilian", "Zhaopin", "https://www.zhaopin.com/", "manual_only"),
)


def platform_manifest() -> list[dict[str, object]]:
    result = []
    for platform_id, label, home_url, mode in _PLATFORMS:
        override = os.environ.get(f"COMM_{platform_id.upper()}_CHAT_URL", "").strip()
        url = override or home_url
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            url = home_url
            override = ""
        result.append(
            {
                "id": platform_id,
                "label": label,
                "url": url,
                "mode": mode,
                "requires_login": True,
                "chat_configured": bool(override),
            }
        )
    return result
