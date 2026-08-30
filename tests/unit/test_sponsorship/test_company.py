"""Company name keys for sponsor matching."""

from __future__ import annotations

from job_sentinel.sponsorship.company import company_keys, normalize_company_key, split_trading_as


def test_case_punctuation_and_suffix() -> None:
    assert normalize_company_key("Booking.com B.V.") == "booking com"
    assert normalize_company_key("BOOKING.COM") == "booking com"
    assert normalize_company_key("Acme Ltd.") == "acme"
    assert normalize_company_key("Acme Limited") == "acme"


def test_chinese_suffix() -> None:
    assert normalize_company_key("示例科技有限公司") == "示例科技"


def test_trading_as_splits() -> None:
    parts = split_trading_as("CASA BAMBOO LTD T/a Pho Le Vietnamese Restaurant")
    assert parts[0].lower().startswith("casa bamboo")
    assert "pho le" in parts[1].lower()
    keys = company_keys("CASA BAMBOO LTD T/a Pho Le Vietnamese Restaurant")
    assert "casa bamboo" in keys
    assert "pho le vietnamese restaurant" in keys


def test_empty_is_empty() -> None:
    assert normalize_company_key("   ") == ""
    assert company_keys("") == []
