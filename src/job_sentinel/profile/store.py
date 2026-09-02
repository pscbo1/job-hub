"""
profile/store.py
─────────────────
Load and persist the universal profile as human-editable YAML.

Why YAML on disk (not the SQLite DB)?
  The profile is something you hand-edit like an Overleaf source — diff-friendly,
  comment-friendly, and trivially version-controlled. Jobs/alerts belong in the
  DB; your CV master data belongs in a file you own.

The file lives at ``data/profile.yaml`` by default and is git-ignored (it's
personal data). ``example_profile()`` seeds a realistic starting point.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import yaml

from job_sentinel.profile.models import (
    Basics,
    Education,
    Experience,
    Link,
    Profile,
    Project,
    SkillGroup,
)

# Resolve repo-root/data/profile.yaml without importing the settings tree.
_REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_PROFILE_PATH = _REPO_ROOT / "data" / "profile.yaml"


def load_profile(path: Path | None = None) -> Profile:
    """
    Load the profile from ``path`` (default ``data/profile.yaml``).

    Returns an empty :class:`Profile` if the file does not exist yet, so callers
    can always rely on getting a valid object.
    """
    path = path or DEFAULT_PROFILE_PATH
    if not path.is_file():
        return Profile()
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return Profile.model_validate(data)


def save_profile(profile: Profile, path: Path | None = None) -> Path:
    """Write the profile to ``path`` as tidy, block-style YAML. Returns the path."""
    path = path or DEFAULT_PROFILE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    data = profile.model_dump(mode="json", exclude_defaults=True)
    payload = yaml.safe_dump(
        data, sort_keys=False, allow_unicode=True, default_flow_style=False
    )
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        Path(temporary).replace(path)
    finally:
        temporary_path = Path(temporary)
        if temporary_path.exists():
            temporary_path.unlink()
    return path


def example_profile() -> Profile:
    """A realistic starter profile so ``resume init`` produces something useful."""
    return Profile(
        basics=Basics(
            name="Your Name",
            headline="Computer Science Undergraduate · Aspiring Software Engineer",
            email="you@utdallas.edu",
            phone="+1 (000) 000-0000",
            location="Richardson, TX",
            links=[
                Link(label="GitHub", url="https://github.com/your-handle"),
                Link(label="LinkedIn", url="https://linkedin.com/in/your-handle"),
            ],
            summary=(
                "First-year CS student seeking on-campus part-time roles. "
                "Comfortable with Python and web fundamentals; fast learner who "
                "enjoys building practical tools."
            ),
        ),
        education=[
            Education(
                institution="The University of Texas at Dallas",
                degree="B.S. in Computer Science",
                location="Richardson, TX",
                start="2025",
                end="2029 (expected)",
                gpa="",
                highlights=["Relevant coursework: Data Structures, Discrete Math"],
                tags=["computer science", "student"],
            )
        ],
        experience=[
            Experience(
                company="UT Dallas — Department (example)",
                role="Student Assistant",
                location="Richardson, TX",
                start="2025",
                end="Present",
                bullets=[
                    "Supported daily operations and assisted staff with X, Y, Z.",
                    "Automated a repetitive task, saving ~N hours per week.",
                ],
                tags=["communication", "operations"],
            )
        ],
        projects=[
            Project(
                name="Job Sentinel",
                description="Site-agnostic job-portal monitor with Telegram alerts.",
                url="https://github.com/harshitwandhare/job-sentinel",
                bullets=[
                    "Built a pluggable scraper + Telegram bot in Python with Playwright.",
                    "Added CI, typed config, and a test suite at ~75% coverage.",
                ],
                tags=["python", "playwright", "automation", "testing"],
            )
        ],
        skills=[
            SkillGroup(category="Languages", skills=["Python", "JavaScript", "SQL"]),
            SkillGroup(category="Tools", skills=["Git", "Linux", "Playwright"]),
        ],
    )
