"""
sources/
────────
Pluggable job-source layer — HTTP/JSON APIs and opt-in scrapers.

Default sources (no key required, always enabled):
  remoteok, themuse, arbeitnow, himalayas

Opt-in, user key required:
  adzuna, usajobs

Opt-in scraper (install extras: pip install job-sentinel[sources]):
  jobspy_source

Follow-company ATS boards (no auth):
  company_boards (greenhouse, lever, ashby, workday)

Search results map onto JobPosting and are returned ephemeral — NOT
written to the database. Collect into Discover, then Save / Start Review
on the Job before Start Application.
"""

from __future__ import annotations
