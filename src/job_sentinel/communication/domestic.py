"""Opt-in, read-only inspection of a user-owned Chromium session."""

from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import urlparse

from playwright.sync_api import Browser, sync_playwright

_HOSTS = {
    "boss": ("zhipin.com",),
    "liepin": ("liepin.com",),
    "zhilian": ("zhaopin.com",),
}
_NOISE_WORDS = ("实习", "兼职", "外包", "intern", "freelance", "培训", "课程", "代理")


def cdp_url() -> str:
    return os.environ.get("COMM_BROWSER_CDP_URL", "http://127.0.0.1:9222").strip()


def _allowed(platform: str, url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return platform in _HOSTS and any(
        host == item or host.endswith(f".{item}") for item in _HOSTS[platform]
    )


def browser_tabs(platform: str, endpoint: str | None = None) -> list[dict[str, Any]]:
    """List matching tabs without exposing cookies or storage state."""
    if platform not in _HOSTS:
        raise ValueError("Unsupported domestic platform")
    with sync_playwright() as playwright:
        browser: Browser = playwright.chromium.connect_over_cdp(endpoint or cdp_url())
        try:
            tabs: list[dict[str, Any]] = []
            for context in browser.contexts:
                for page in context.pages:
                    url = page.url
                    if not _allowed(platform, url):
                        continue
                    tabs.append(
                        {"url": url, "title": page.title(), "visible": not page.is_closed()}
                    )
            return tabs
        finally:
            browser.close()


def visible_capture(platform: str, endpoint: str | None = None) -> dict[str, str]:
    """Read only the active matching page's visible body text."""
    if platform not in _HOSTS:
        raise ValueError("Unsupported domestic platform")
    with sync_playwright() as playwright:
        browser: Browser = playwright.chromium.connect_over_cdp(endpoint or cdp_url())
        try:
            pages = [
                page
                for context in browser.contexts
                for page in context.pages
                if _allowed(platform, page.url) and not page.is_closed()
            ]
            if not pages:
                raise ValueError(
                    f"No open {platform} tab found; log in and open the chat page first"
                )
            page = pages[-1]
            text = page.locator("body").inner_text(timeout=5000).strip()
            if not text:
                raise ValueError("The page has no visible text to capture")
            return {
                "platform": platform,
                "url": page.url,
                "title": page.title(),
                "visible_text": text[:20000],
            }
        finally:
            browser.close()


def classify_capture(text: str, skip_words: str = "") -> dict[str, object]:
    """Apply conservative, explainable noise checks to visible platform text."""
    lowered = text.lower()
    reasons: list[str] = []
    configured = tuple(word.strip() for word in skip_words.split(",") if word.strip())
    noise_hits = [word for word in (*_NOISE_WORDS, *configured) if word.lower() in lowered]
    if noise_hits:
        reasons.append("noise:" + ",".join(noise_hits[:4]))
    return {
        "quality": "low" if reasons else "review",
        "is_actionable": not reasons,
        "filter_reasons": reasons,
    }


def parse_chat_list(text: str) -> list[dict[str, str]]:
    """Split a visible chat list into conservative, reviewable message previews."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    date_re = re.compile(r"^(\d{1,2}月\d{1,2}日|今天|昨天)$")
    ignored = {
        "首页",
        "职位",
        "公司",
        "校园",
        "海归",
        "APP",
        "海外",
        "无障碍专区",
        "在线客服",
        "消息",
        "简历",
        "全部",
        "未读",
        "新招呼",
        "仅沟通",
        "更多",
        "没有更多",
        "没有更多了",
        "去App",
        "前往App",
    }
    entries: list[dict[str, str]] = []
    current_date = ""
    i = 0
    while i < len(lines):
        line = lines[i]
        if date_re.match(line):
            current_date = line
            i += 1
            continue
        if line in ignored or len(line) < 2:
            i += 1
            continue
        preview = lines[i + 1] if i + 1 < len(lines) else ""
        if preview and not date_re.match(preview) and preview not in ignored:
            entries.append({"label": line, "preview": preview[:500], "date": current_date})
            i += 2
        else:
            i += 1
    return entries
