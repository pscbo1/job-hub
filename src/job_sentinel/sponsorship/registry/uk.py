"""UK Home Office Register of Licensed Sponsors (workers)."""

from __future__ import annotations

import csv
import io
import re

import httpx

from job_sentinel.sponsorship.registry import SponsorEmployer, SponsorRegistryProvider

PUBLICATION_URL = "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers"
REGISTRY_ID = "uk_home_office_licensed_sponsors"
REGISTRY_NAME = "UK Home Office Register of Licensed Sponsors"
_CSV_HREF = re.compile(
    r'href="(https://assets\.publishing\.service\.gov\.uk/media/[^"]+\.csv)"',
    re.IGNORECASE,
)
_UA = {"User-Agent": "JobHub/0.1 (+local collector; personal use)"}


class UkLicensedSponsors(SponsorRegistryProvider):
    country = "GB"
    registry_id = REGISTRY_ID
    registry_name = REGISTRY_NAME
    source_url = PUBLICATION_URL

    def fetch_employers(self) -> list[SponsorEmployer]:
        csv_url, body = download_uk_register()
        rows = parse_uk_csv(body, downloaded_url=csv_url)
        if not rows:
            msg = "UK licensed-sponsor CSV parsed 0 employers"
            raise RuntimeError(msg)
        return rows


def download_uk_register() -> tuple[str, str]:
    """Resolve the current CSV attachment from the stable GOV.UK publication page."""
    with httpx.Client(timeout=120.0, follow_redirects=True, headers=_UA) as client:
        page = client.get(PUBLICATION_URL)
        page.raise_for_status()
        match = _CSV_HREF.search(page.text)
        if match is None:
            msg = "UK licensed-sponsor CSV URL not found on GOV.UK publication page"
            raise RuntimeError(msg)
        csv_url = match.group(1)
        csv_resp = client.get(csv_url)
        csv_resp.raise_for_status()
        return csv_url, csv_resp.text


def parse_uk_csv(body: str, *, downloaded_url: str = "") -> list[SponsorEmployer]:
    reader = csv.DictReader(io.StringIO(body))
    out: list[SponsorEmployer] = []
    for row in reader:
        name = (row.get("Organisation Name") or row.get("organisation name") or "").strip()
        if not name:
            continue
        route = (row.get("Route") or row.get("route") or "").strip()
        out.append(
            SponsorEmployer(
                country="GB",
                registry_id=REGISTRY_ID,
                registry_name=REGISTRY_NAME,
                source_url=PUBLICATION_URL,
                employer_name=name,
                visa_route=route,
                downloaded_url=downloaded_url,
            )
        )
    return out
