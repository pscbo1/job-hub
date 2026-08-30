"""UK / NL registry parsers and exact company match."""

from __future__ import annotations

from job_sentinel.sponsorship.registry.index import index_from_rows
from job_sentinel.sponsorship.registry.nl import parse_nl_html
from job_sentinel.sponsorship.registry.uk import parse_uk_csv

_UK_CSV = """Organisation Name,Town/City,County,Type & Rating,Route
F-Secure (UK) Limited,Gerrards Cross,Buckinghamshire,Worker (A rating),Skilled Worker
Booking.com Limited,London,,Worker (A rating),Skilled Worker
"""

_NL_HTML = """
<table>
<thead><tr><th>Organisation</th><th>KVK (Chamber of Commerce) number</th></tr></thead>
<tbody>
<tr><th scope="row">Booking.com B.V.</th><td>31025002</td></tr>
<tr><th scope="row">Adyen N.V.</th><td>34259528</td></tr>
</tbody>
</table>
"""


def test_uk_csv_parse() -> None:
    rows = parse_uk_csv(_UK_CSV, downloaded_url="https://example.test/uk.csv")
    assert len(rows) == 2
    assert rows[0].country == "GB"
    assert "F-Secure" in rows[0].employer_name
    assert rows[0].visa_route == "Skilled Worker"


def test_nl_html_parse() -> None:
    rows = parse_nl_html(_NL_HTML)
    assert {r.employer_name for r in rows} == {"Booking.com B.V.", "Adyen N.V."}
    assert rows[0].employer_id == "31025002"
    assert rows[0].country == "NL"


def test_same_company_hits_both_countries_by_location() -> None:
    rows = parse_uk_csv(_UK_CSV) + parse_nl_html(_NL_HTML)
    index = index_from_rows(rows)
    uk = index.match("Booking.com Limited", frozenset({"GB"}))
    nl = index.match("Booking.com B.V.", frozenset({"NL"}))
    assert uk is not None
    assert nl is not None
    assert uk.country == "GB"
    assert nl.country == "NL"


def test_unknown_company_does_not_match() -> None:
    index = index_from_rows(parse_uk_csv(_UK_CSV))
    assert index.match("Definitely Not A Sponsor Ltd", frozenset({"GB"})) is None


def test_no_fuzzy_near_miss() -> None:
    index = index_from_rows(parse_uk_csv(_UK_CSV))
    assert index.match("F Secure UK", frozenset({"GB"})) is not None
    assert index.match("F-Secur", frozenset({"GB"})) is None
