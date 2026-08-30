"""Deterministic English JD signals. Relocation is tracked separately from visa."""

from __future__ import annotations

import re
from dataclasses import dataclass

from job_sentinel.sponsorship.models import SponsorshipEvidence, SponsorshipStatus

_NEG: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "no_sponsorship",
        re.compile(r"\bno\s+(?:visa\s+)?sponsor(?:ship)?\b", re.IGNORECASE),
    ),
    (
        "unable_to_sponsor",
        re.compile(r"\bunable\s+to\s+sponsor\b", re.IGNORECASE),
    ),
    (
        "cannot_sponsor",
        re.compile(r"\b(?:can\s*not|cannot|can't|won'?t|will\s+not)\s+sponsor\b", re.IGNORECASE),
    ),
    (
        "sponsorship_not_available",
        re.compile(
            r"\bsponsorship\s+(?:is\s+)?not\s+(?:available|provided|offered)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "cannot_provide_visa_sponsorship",
        re.compile(
            r"\b(?:cannot|can\s*not|unable\s+to)\s+provide\s+visa\s+sponsorship\b",
            re.IGNORECASE,
        ),
    ),
    (
        "right_to_work",
        re.compile(
            r"\bmust\s+already\s+have\s+(?:the\s+)?right\s+to\s+work\b",
            re.IGNORECASE,
        ),
    ),
    (
        "unrestricted_work_auth",
        re.compile(
            r"\bmust\s+have\s+unrestricted\s+work\s+authori[sz]ation\b",
            re.IGNORECASE,
        ),
    ),
    (
        "without_sponsorship",
        re.compile(
            r"\b(?:without|no\s+need\s+for)\s+(?:employer\s+)?(?:visa\s+)?sponsor(?:ship)?\b",
            re.IGNORECASE,
        ),
    ),
    (
        "not_able_to_sponsor",
        re.compile(r"\bnot\s+(?:be\s+)?able\s+to\s+sponsor\b", re.IGNORECASE),
    ),
)

_POS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "visa_sponsorship_available",
        re.compile(r"\bvisa\s+sponsorship\s+(?:is\s+)?available\b", re.IGNORECASE),
    ),
    (
        "sponsorship_provided",
        re.compile(r"\bsponsorship\s+(?:is\s+)?provided\b", re.IGNORECASE),
    ),
    (
        "can_sponsor",
        re.compile(r"\b(?:can|will|we)\s+sponsor\b", re.IGNORECASE),
    ),
    (
        "visa_support",
        re.compile(r"\bvisa\s+support\b", re.IGNORECASE),
    ),
    (
        "skilled_worker_sponsorship",
        re.compile(r"\bskilled\s+worker\s+sponsor(?:ship)?\b", re.IGNORECASE),
    ),
    (
        "work_visa_sponsorship",
        re.compile(r"\bwork\s+visa\s+sponsor(?:ship)?\b", re.IGNORECASE),
    ),
    (
        "relocation_and_visa",
        re.compile(r"\brelocation\s+and\s+visa\s+support\b", re.IGNORECASE),
    ),
    (
        "open_to_sponsorship",
        re.compile(r"\bopen\s+to\s+(?:visa\s+)?sponsor(?:ship)?\b", re.IGNORECASE),
    ),
)

_RELOC = re.compile(
    r"\b(?:relocation\s+(?:support|package|assistance|bonus)|relocating\s+candidates)\b",
    re.IGNORECASE,
)

_ROUTE = (
    (re.compile(r"\bskilled\s+worker\b", re.IGNORECASE), "Skilled Worker"),
    (re.compile(r"\bhighly\s+skilled\s+migrant\b", re.IGNORECASE), "Highly skilled migrant"),
    (re.compile(r"\bkennismigrant\b", re.IGNORECASE), "Kennismigrant"),
)


@dataclass(frozen=True)
class JdParse:
    status: SponsorshipStatus | None
    relocation: bool | None
    visa_route: str | None
    evidence: tuple[SponsorshipEvidence, ...]


def parse_job_text(*parts: str) -> JdParse:
    """Scan title + description. Ambiguous mentions do not force a status."""
    text = " ".join(p for p in parts if p).strip()
    if not text:
        return JdParse(status=None, relocation=None, visa_route=None, evidence=())

    evidence: list[SponsorshipEvidence] = []
    status: SponsorshipStatus | None = None

    for rule, pattern in _NEG:
        match = pattern.search(text)
        if match:
            status = SponsorshipStatus.EXPLICIT_NO
            evidence.append(_snippet(kind="jd", rule=rule, text=text, match=match))
            break

    if status is None:
        for rule, pattern in _POS:
            match = pattern.search(text)
            if match:
                status = SponsorshipStatus.EXPLICIT_YES
                evidence.append(_snippet(kind="jd", rule=rule, text=text, match=match))
                break

    relocation: bool | None = True if _RELOC.search(text) else None
    if any(e.rule == "relocation_and_visa" for e in evidence):
        relocation = True

    visa_route: str | None = None
    for pattern, label in _ROUTE:
        if pattern.search(text):
            visa_route = label
            break

    return JdParse(
        status=status,
        relocation=relocation,
        visa_route=visa_route,
        evidence=tuple(evidence),
    )


def _snippet(*, kind: str, rule: str, text: str, match: re.Match[str]) -> SponsorshipEvidence:
    start = max(0, match.start() - 40)
    end = min(len(text), match.end() + 40)
    snippet = " ".join(text[start:end].split())
    return SponsorshipEvidence(kind=kind, rule=rule, snippet=snippet)
