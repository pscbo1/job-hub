"""Conservative country / remote normalization."""

from __future__ import annotations

from job_sentinel.geo.country import UNKNOWN, matches_country_filter, normalize_location


def test_uk_aliases() -> None:
    assert normalize_location("United Kingdom").code == "GB"
    assert normalize_location("London, UK").code == "GB"
    assert normalize_location("Remote - UK").code == "GB"
    assert normalize_location("Remote - UK").is_remote is True


def test_us_aliases() -> None:
    assert normalize_location("United States").code == "US"
    assert normalize_location("USA").code == "US"
    assert normalize_location("US Remote").code == "US"
    assert normalize_location("US Remote").is_remote is True


def test_netherlands() -> None:
    assert normalize_location("Netherlands").code == "NL"
    assert normalize_location("Amsterdam, NL").code == "NL"


def test_eu_remote_region() -> None:
    hit = normalize_location("Remote within EU")
    assert hit.code == "EU"
    assert hit.is_remote is True


def test_unknown_remote_is_not_user_country() -> None:
    hit = normalize_location("Remote")
    assert hit.code == UNKNOWN
    assert hit.is_remote is True
    assert hit.name == "Unknown / Global"


def test_bare_city_is_unknown() -> None:
    assert normalize_location("London").code == UNKNOWN
    assert normalize_location("New York").code == UNKNOWN


def test_country_filter_all_and_unknown() -> None:
    assert matches_country_filter("GB", "all")
    assert matches_country_filter("XX", "unknown")
    assert matches_country_filter("GB", "UK")
    assert not matches_country_filter("US", "GB")
