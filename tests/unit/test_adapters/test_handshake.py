"""Tests for the Handshake adapter's card parsing, pagination, and login flow."""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from job_sentinel.adapters.sites.handshake import (
    SEL_EMPLOYER,
    SEL_JOB_CARD,
    SEL_LOCATION,
    SEL_NEXT_PAGE,
    SEL_TITLE,
    HandshakeAdapter,
)
from job_sentinel.config.settings import ScraperSettings

if TYPE_CHECKING:
    import pytest


class _El:
    def __init__(self, text: str = "", attrs: dict | None = None, enabled: bool = True) -> None:
        self._text = text
        self._attrs = attrs or {}
        self._enabled = enabled
        self.clicked = False

    def inner_text(self) -> str:
        return self._text

    def get_attribute(self, name: str) -> str | None:
        return self._attrs.get(name)

    def is_enabled(self) -> bool:
        return self._enabled

    def click(self) -> None:
        self.clicked = True


class _Card:
    def __init__(self, href: str, title: str, employer: str, location: str) -> None:
        self._map = {
            "a": _El(attrs={"href": href}),
            SEL_TITLE: _El(title),
            SEL_EMPLOYER: _El(employer),
            SEL_LOCATION: _El(location),
        }

    def query_selector(self, selector: str):
        return self._map.get(selector)


class _Page:
    def __init__(self, cards: list[_Card], next_btn: _El | None = None) -> None:
        self._cards = cards
        self._next = next_btn
        self.url = "https://app.joinhandshake.com/stu/postings"

    def wait_for_selector(self, selector: str, timeout: int = 0) -> None:
        pass

    def query_selector_all(self, selector: str):
        return self._cards if selector == SEL_JOB_CARD else []

    def query_selector(self, selector: str):
        return self._next if selector == SEL_NEXT_PAGE else None

    def wait_for_load_state(self, state: str, timeout: int = 0) -> None:
        pass


class _LoginPage:
    """Minimal page double for exercising login()'s two branches."""

    def __init__(self, redirect_to_login: bool) -> None:
        self.url = (
            "https://app.joinhandshake.com/users/sign_in"
            if redirect_to_login
            else "https://app.joinhandshake.com/stu/postings"
        )
        self.filled: dict[str, str] = {}
        self.clicked = False
        self.waited_urls: list[str] = []
        self.waited_states: list[str] = []

    def goto(self, url: str, wait_until: str = "") -> None:
        pass

    def fill(self, selector: str, value: str) -> None:
        self.filled[selector] = value

    def click(self, selector: str) -> None:
        self.clicked = True
        self.url = "https://app.joinhandshake.com/stu/postings"

    def wait_for_url(self, pattern: str, timeout: int = 0) -> None:
        self.waited_urls.append(pattern)

    def wait_for_load_state(self, state: str, timeout: int = 0) -> None:
        self.waited_states.append(state)


def _adapter() -> HandshakeAdapter:
    return HandshakeAdapter(ScraperSettings())


def _stub_settings(monkeypatch: pytest.MonkeyPatch, jobs_url: str) -> None:
    settings = SimpleNamespace(
        portal=SimpleNamespace(
            jobs_url=jobs_url, username="student@utdallas.edu", password="hunter2"
        )
    )
    monkeypatch.setattr("job_sentinel.config.settings.get_settings", lambda: settings)


def test_login_submits_credentials_when_redirected_to_sign_in(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_settings(monkeypatch, "https://app.joinhandshake.com/stu/postings")
    page = _LoginPage(redirect_to_login=True)

    _adapter().login(page)

    assert page.filled["input[type='email'], input[name='email']"] == "student@utdallas.edu"
    assert page.filled["input[type='password']"] == "hunter2"
    assert page.clicked is True
    assert page.waited_urls == ["*joinhandshake.com/stu*"]
    assert page.waited_states == ["networkidle"]


def test_login_skips_credentials_when_already_authenticated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_settings(monkeypatch, "https://app.joinhandshake.com/stu/postings")
    page = _LoginPage(redirect_to_login=False)

    _adapter().login(page)

    assert page.filled == {}
    assert page.clicked is False
    assert page.waited_states == ["networkidle"]


def test_scrape_page_returns_empty_list_when_no_cards_appear() -> None:
    class _TimeoutPage(_Page):
        def wait_for_selector(self, selector: str, timeout: int = 0) -> None:
            raise PlaywrightTimeoutError("timed out waiting for job cards")

    assert _adapter().scrape_page(_TimeoutPage([])) == []


def test_scrape_page_skips_card_that_raises_during_parsing() -> None:
    class _BrokenCard(_Card):
        def query_selector(self, selector: str):
            if selector == "a":
                raise RuntimeError("boom")
            return super().query_selector(selector)

    good = _Card("/jobs/11111111", "Good Posting", "Acme", "Remote")
    bad = _BrokenCard("/jobs/22222222", "Bad Posting", "Acme", "Remote")
    jobs = _adapter().scrape_page(_Page([bad, good]))
    assert [j.posting_id for j in jobs] == ["11111111"]


def test_parses_cards_with_job_ids() -> None:
    page = _Page(
        [
            _Card("/jobs/12345678", "SWE Intern", "Acme Corp", "Dallas, TX"),
            _Card("/jobs/87654321", "Data Analyst", "Initech", "Remote"),
        ]
    )
    jobs = _adapter().scrape_page(page)
    assert [j.posting_id for j in jobs] == ["12345678", "87654321"]
    assert jobs[0].title == "SWE Intern"
    assert jobs[0].employer == "Acme Corp"
    assert jobs[0].location == "Dallas, TX"
    assert jobs[0].portal_url == "https://app.joinhandshake.com/jobs/12345678"
    assert jobs[0].source_adapter == "handshake"


def test_card_without_job_id_is_skipped() -> None:
    page = _Page([_Card("/postings", "No id here", "X", "Y")])
    assert _adapter().scrape_page(page) == []


def test_next_page_clicks_enabled_button() -> None:
    btn = _El(enabled=True)
    page = _Page([], next_btn=btn)
    assert _adapter().next_page(page) is True
    assert btn.clicked is True


def test_next_page_stops_on_disabled_button() -> None:
    page = _Page([], next_btn=_El(enabled=False))
    assert _adapter().next_page(page) is False


def test_next_page_stops_when_no_button() -> None:
    page = _Page([], next_btn=None)
    assert _adapter().next_page(page) is False
