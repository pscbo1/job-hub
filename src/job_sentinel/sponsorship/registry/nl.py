"""Netherlands IND public register of recognised sponsors (Work)."""

from __future__ import annotations

import re
from html.parser import HTMLParser

import httpx

from job_sentinel.sponsorship.registry import SponsorEmployer, SponsorRegistryProvider

REGISTER_URL = "https://ind.nl/en/public-register-recognised-sponsors/public-register-work"
REGISTRY_ID = "nl_ind_recognised_sponsors"
REGISTRY_NAME = "IND Recognised Sponsors (Work)"
_UA = {"User-Agent": "JobHub/0.1 (+local collector; personal use)"}
_KVK = re.compile(r"^\d{8}$")


class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._in_cell = False
        self._cell: list[str] = []
        self._row: list[str] = []
        self.rows: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"td", "th"}:
            self._in_cell = True
            self._cell = []
        elif tag == "tr":
            self._row = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._in_cell:
            self._in_cell = False
            self._row.append(" ".join("".join(self._cell).split()))
        elif tag == "tr" and len(self._row) >= 2:
            name, kvk = self._row[0], self._row[1]
            if name and name.casefold() != "organisation" and _KVK.match(kvk):
                self.rows.append((name, kvk))
            self._row = []

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._cell.append(data)


class NlIndRecognisedSponsors(SponsorRegistryProvider):
    country = "NL"
    registry_id = REGISTRY_ID
    registry_name = REGISTRY_NAME
    source_url = REGISTER_URL

    def fetch_employers(self) -> list[SponsorEmployer]:
        html = download_nl_register()
        rows = parse_nl_html(html)
        if not rows:
            msg = "IND recognised-sponsor HTML parsed 0 employers"
            raise RuntimeError(msg)
        return rows


def download_nl_register() -> str:
    with httpx.Client(timeout=120.0, follow_redirects=True, headers=_UA) as client:
        resp = client.get(REGISTER_URL)
        resp.raise_for_status()
        return resp.text


def parse_nl_html(html: str) -> list[SponsorEmployer]:
    parser = _TableParser()
    parser.feed(html)
    out: list[SponsorEmployer] = []
    for name, kvk in parser.rows:
        out.append(
            SponsorEmployer(
                country="NL",
                registry_id=REGISTRY_ID,
                registry_name=REGISTRY_NAME,
                source_url=REGISTER_URL,
                employer_name=name,
                employer_id=kvk,
                visa_route="Highly skilled migrant / regular labour",
                downloaded_url=REGISTER_URL,
            )
        )
    return out
