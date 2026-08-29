"""
V0 ingestion boundary: collector payloads → jobs_raw → normalized jobs.

Collectors (including the external ``mcp-jobs`` repo) stay outside this package.
This module only accepts structured records and existing mcp-jobs export files.
"""

from __future__ import annotations
