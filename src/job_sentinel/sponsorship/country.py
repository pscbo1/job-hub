"""Infer job countries from location text. Not user preference."""

from __future__ import annotations

import re

_GB_STRONG = re.compile(
    r"\b(united kingdom|great britain|england|scotland|wales|northern ireland|uk|gb)\b",
    re.IGNORECASE,
)
_GB_CITY = re.compile(
    r"\b(london|manchester|birmingham|leeds|glasgow|edinburgh|bristol|cambridge|oxford)\b",
    re.IGNORECASE,
)
_NOT_GB_LONDON = re.compile(r"\b(ontario|canada|ohio|kentucky)\b", re.IGNORECASE)

_NL_STRONG = re.compile(
    r"\b(netherlands|nederland|holland|\bnl\b)\b",
    re.IGNORECASE,
)
_NL_CITY = re.compile(
    r"\b(amsterdam|rotterdam|utrecht|eindhoven|hague|den haag|haarlem|groningen)\b",
    re.IGNORECASE,
)


def infer_countries(location: str) -> frozenset[str]:
    """ISO 3166-1 alpha-2 codes suggested by the job location. Empty if unknown."""
    text = location or ""
    found: set[str] = set()
    if _GB_STRONG.search(text) or (_GB_CITY.search(text) and not _NOT_GB_LONDON.search(text)):
        found.add("GB")
    if _NL_STRONG.search(text) or _NL_CITY.search(text):
        found.add("NL")
    return frozenset(found)
