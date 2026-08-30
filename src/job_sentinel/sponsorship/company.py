"""Conservative company-name keys for sponsor-registry matching.

No fuzzy / edit-distance matching. Unreliable names stay unmatched.
"""

from __future__ import annotations

import re
import unicodedata

_TRAILING_AS = re.compile(
    r"\s+(?:t/?a|t/a|trading\s+as)\s+",
    re.IGNORECASE,
)

# Longest first. Trailing legal forms only — never strip a whole name.
_SUFFIXES: tuple[str, ...] = (
    "股份有限公司",
    "有限责任公司",
    "有限公司",
    "集团公司",
    "集团",
    "incorporated",
    "corporation",
    "company",
    "limited",
    "holdings",
    "holding",
    "plc",
    "llc",
    "llp",
    "ltd",
    "inc",
    "corp",
    "gmbh",
    "sarl",
    "srl",
    "spa",
    "sas",
    "pty",
    "pte",
    "n v",
    "b v",
    "nv",
    "bv",
    "ag",
    "sa",
    "ab",
    "co",
)

# Brand ↔ legal only when the mapping is unambiguous after suffix stripping.
_SAFE_ALIASES: dict[str, str] = {}


def split_trading_as(name: str) -> list[str]:
    """Return legal name plus trading-as brand when the register spells both."""
    text = (name or "").strip()
    if not text:
        return []
    parts = _TRAILING_AS.split(text, maxsplit=1)
    out: list[str] = []
    seen: set[str] = set()
    for part in parts:
        item = " ".join(part.split()).strip()
        if not item:
            continue
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out or [text]


def normalize_company_key(name: str) -> str:
    """Case, punctuation, legal suffixes, trailing country tokens."""
    text = unicodedata.normalize("NFKC", name or "").strip().lower()
    if text.startswith("the ") and len(text) > 4:
        text = text[4:]
    text = text.replace("&", " and ")
    text = re.sub(r"[^\w\u4e00-\u9fff]+", " ", text, flags=re.UNICODE)
    text = " ".join(text.split())
    text = _strip_loop(text, _SUFFIXES)
    return _SAFE_ALIASES.get(text, text)


def company_keys(name: str) -> list[str]:
    """Normalized keys for a display name, including trading-as variants."""
    keys: list[str] = []
    seen: set[str] = set()
    for part in split_trading_as(name):
        key = normalize_company_key(part)
        if not key or key in seen:
            continue
        seen.add(key)
        keys.append(key)
    return keys


def _strip_loop(text: str, suffixes: tuple[str, ...]) -> str:
    changed = True
    while text and changed:
        changed = False
        for suffix in suffixes:
            if text == suffix:
                continue
            if text.endswith(" " + suffix):
                text = text[: -len(suffix)].rstrip()
                changed = True
                break
            if (
                text.endswith(suffix)
                and len(text) > len(suffix)
                and suffix
                in {
                    "股份有限公司",
                    "有限责任公司",
                    "有限公司",
                    "集团公司",
                    "集团",
                }
            ):
                text = text[: -len(suffix)].rstrip()
                changed = True
                break
    return text
