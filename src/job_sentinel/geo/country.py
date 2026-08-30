"""Conservative country / remote parsing from free-text location strings."""

from __future__ import annotations

import re
from dataclasses import dataclass

UNKNOWN = "XX"
EU = "EU"

COUNTRY_NAMES: dict[str, str] = {
    "GB": "United Kingdom",
    "NL": "Netherlands",
    "US": "United States",
    "CA": "Canada",
    "AU": "Australia",
    "NZ": "New Zealand",
    "JP": "Japan",
    "CN": "China",
    "DE": "Germany",
    "FR": "France",
    "IE": "Ireland",
    "SG": "Singapore",
    "IN": "India",
    "CH": "Switzerland",
    "SE": "Sweden",
    "NO": "Norway",
    "DK": "Denmark",
    "FI": "Finland",
    "ES": "Spain",
    "IT": "Italy",
    "PT": "Portugal",
    "BE": "Belgium",
    "AT": "Austria",
    "PL": "Poland",
    "KR": "South Korea",
    "HK": "Hong Kong",
    "TW": "Taiwan",
    "AE": "United Arab Emirates",
    "BR": "Brazil",
    "MX": "Mexico",
    "ZA": "South Africa",
    "CZ": "Czechia",
    EU: "European Union",
    UNKNOWN: "Unknown / Global",
}

# Phrase → ISO (or EU). Longer aliases are matched first.
_ALIAS_PAIRS: tuple[tuple[str, str], ...] = (
    ("united kingdom", "GB"),
    ("great britain", "GB"),
    ("northern ireland", "GB"),
    ("united states of america", "US"),
    ("united states", "US"),
    ("us remote", "US"),
    ("remote us", "US"),
    ("the netherlands", "NL"),
    ("new zealand", "NZ"),
    ("south korea", "KR"),
    ("hong kong", "HK"),
    ("united arab emirates", "AE"),
    ("south africa", "ZA"),
    ("czech republic", "CZ"),
    ("european union", EU),
    ("within the eu", EU),
    ("within eu", EU),
    ("remote eu", EU),
    ("eu remote", EU),
    ("england", "GB"),
    ("scotland", "GB"),
    ("wales", "GB"),
    ("britain", "GB"),
    ("netherlands", "NL"),
    ("holland", "NL"),
    ("australia", "AU"),
    ("canada", "CA"),
    ("germany", "DE"),
    ("france", "FR"),
    ("ireland", "IE"),
    ("singapore", "SG"),
    ("switzerland", "CH"),
    ("sweden", "SE"),
    ("norway", "NO"),
    ("denmark", "DK"),
    ("finland", "FI"),
    ("spain", "ES"),
    ("italy", "IT"),
    ("portugal", "PT"),
    ("belgium", "BE"),
    ("austria", "AT"),
    ("poland", "PL"),
    ("japan", "JP"),
    ("china", "CN"),
    ("india", "IN"),
    ("taiwan", "TW"),
    ("brazil", "BR"),
    ("mexico", "MX"),
    ("u.s.a.", "US"),
    ("u.s.", "US"),
    ("usa", "US"),
    ("uk", "GB"),
)

_CODE_HINTS: dict[str, str] = {
    "gb": "GB",
    "uk": "GB",
    "us": "US",
    "usa": "US",
    "nl": "NL",
    "ca": "CA",
    "au": "AU",
    "nz": "NZ",
    "jp": "JP",
    "cn": "CN",
    "de": "DE",
    "fr": "FR",
    "ie": "IE",
    "sg": "SG",
    "in": "IN",
    "eu": EU,
}

_REMOTE_RE = re.compile(
    r"\bremote\b|\bwork[\s-]?from[\s-]?home\b|\bwfh\b|远程|遠端|在家办公",
    re.IGNORECASE,
)
_SPLIT_RE = re.compile(r"[,/|•·]| - | — | – ")
_NON_ALNUM = re.compile(r"[^a-z0-9\s.+']")


@dataclass(frozen=True)
class CountryHit:
    code: str
    name: str
    is_remote: bool


def country_display_name(code: str) -> str:
    key = (code or UNKNOWN).upper()
    if key == "UK":
        key = "GB"
    return COUNTRY_NAMES.get(key, COUNTRY_NAMES[UNKNOWN])


def looks_remote(location: str, employment_type: str = "") -> bool:
    blob = f"{location} {employment_type}"
    return bool(_REMOTE_RE.search(blob))


def normalize_location(location: str, employment_type: str = "") -> CountryHit:
    """Map a location string to ISO/EU/XX. Does not guess from city names alone."""
    text = " ".join((location or "").split())
    remote = looks_remote(text, employment_type)
    if not text:
        return CountryHit(UNKNOWN, country_display_name(UNKNOWN), remote)
    code = _code_from_text(text)
    if code is None:
        code = UNKNOWN
    return CountryHit(code, country_display_name(code), remote)


def _code_from_text(text: str) -> str | None:
    lower = text.lower()
    for phrase, code in sorted(_ALIAS_PAIRS, key=lambda p: len(p[0]), reverse=True):
        if _phrase_in(lower, phrase):
            return code
    for part in _SPLIT_RE.split(text):
        token = part.strip().lower()
        if not token:
            continue
        compact = _NON_ALNUM.sub(" ", token)
        compact = " ".join(compact.split())
        if compact in _CODE_HINTS:
            return _CODE_HINTS[compact]
        if compact in dict(_ALIAS_PAIRS):
            return dict(_ALIAS_PAIRS)[compact]
    # Trailing ", US" / "UK" style tokens
    words = re.findall(r"[A-Za-z.]{2,}", text)
    for word in words:
        token = word.lower().rstrip(".")
        if token in _CODE_HINTS:
            return _CODE_HINTS[token]
    return None


def _phrase_in(haystack: str, phrase: str) -> bool:
    if " " in phrase or "." in phrase:
        return phrase in haystack
    return re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", haystack) is not None


def matches_country_filter(code: str, selected: str | None) -> bool:
    """``selected`` is ISO/EU/XX, or empty/all."""
    if selected is None or selected.strip() == "" or selected.strip().lower() == "all":
        return True
    want = selected.strip().upper()
    if want == "UK":
        want = "GB"
    if want in {"UNKNOWN", "GLOBAL", "XX"}:
        want = UNKNOWN
    have = (code or UNKNOWN).upper()
    if have == "UK":
        have = "GB"
    return have == want
