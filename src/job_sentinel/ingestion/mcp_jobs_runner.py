"""Call the local mcp-jobs collect CLI; do not reimplement crawlers."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from loguru import logger

from job_sentinel.config.settings import get_settings


class McpJobsCollectError(Exception):
    """mcp-jobs CLI failed or returned unreadable output."""


def _collect_env() -> dict[str, str]:
    """Inherit the process env, but drop Cursor sandbox Playwright paths."""
    env = {k: v for k, v in os.environ.items() if v is not None}
    browsers = env.get("PLAYWRIGHT_BROWSERS_PATH", "")
    if "cursor-sandbox-cache" in browsers.replace("\\", "/"):
        env.pop("PLAYWRIGHT_BROWSERS_PATH", None)
    return env


def run_mcp_jobs_search(
    *,
    keyword: str,
    city: str = "",
    collector_ids: list[str],
    mcp_jobs_root: Path | None = None,
    node: str | None = None,
    timeout_seconds: int | None = None,
    page_from: int | None = None,
    page_to: int | None = None,
    max_jobs: int | None = None,
) -> dict[str, Any]:
    """
    Run ``scripts/collect-json.js`` in the mcp-jobs repo and return its JSON.

    Collector scraping stays in mcp-jobs. This process only supplies criteria
    and reads the result file.
    """
    settings = get_settings()
    root = Path(mcp_jobs_root or settings.mcp_jobs_root)
    script = root / "scripts" / "collect-json.js"
    dist_entry = root / "dist" / "index.js"
    if not root.is_dir():
        raise McpJobsCollectError(
            f"mcp-jobs repo not found at {root}. Set MCP_JOBS_ROOT to the local clone."
        )
    if not script.is_file():
        raise McpJobsCollectError(f"mcp-jobs collect CLI missing: {script}")
    if not dist_entry.is_file():
        raise McpJobsCollectError(
            f"mcp-jobs dist/index.js missing at {dist_entry}. Run npm run build in mcp-jobs."
        )

    node_bin = node or settings.mcp_jobs_node
    timeout = timeout_seconds if timeout_seconds is not None else settings.mcp_jobs_timeout_seconds
    fd, tmp_name = tempfile.mkstemp(suffix=".json", prefix="mcp-jobs-collect-")
    os.close(fd)
    out_path = Path(tmp_name)
    argv = [
        node_bin,
        str(script),
        "--keyword",
        keyword,
        "--out",
        str(out_path),
        "--pageFrom",
        str(page_from if page_from is not None else settings.mcp_jobs_page_from),
        "--pageTo",
        str(page_to if page_to is not None else settings.mcp_jobs_page_to),
        "--maxJobs",
        str(max_jobs if max_jobs is not None else settings.mcp_jobs_max_jobs),
    ]
    if city.strip():
        argv.extend(["--city", city.strip()])
    if collector_ids:
        argv.extend(["--sources", ",".join(collector_ids)])

    logger.info("mcp-jobs collect: {}", " ".join(argv))
    try:
        completed = subprocess.run(  # noqa: S603 — argv only, local node + known script
            argv,
            cwd=str(root),
            env=_collect_env(),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise McpJobsCollectError(
            f"Node executable {node_bin!r} not found. Install Node.js or set MCP_JOBS_NODE."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise McpJobsCollectError(f"mcp-jobs collection timed out after {timeout}s") from exc

    if completed.stderr:
        logger.info("mcp-jobs stderr:\n{}", completed.stderr[-4000:])
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()[-1500:]
        raise McpJobsCollectError(
            f"mcp-jobs collect exited {completed.returncode}" + (f": {detail}" if detail else "")
        )

    try:
        payload = json.loads(out_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise McpJobsCollectError(
            f"mcp-jobs did not write valid JSON to {out_path}: {exc}"
        ) from exc
    finally:
        out_path.unlink(missing_ok=True)

    if not isinstance(payload, dict):
        raise McpJobsCollectError("mcp-jobs JSON root must be an object")
    return payload
