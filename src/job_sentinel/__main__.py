"""
__main__.py
────────────
CLI entry-point for Job Sentinel (Typer + Rich).

Commands
────────
  job-sentinel run        — Start the full bot + scheduler (primary command)
  job-sentinel scrape     — Run one scrape cycle and print results (no bot)
  job-sentinel db stats   — Print database statistics
  job-sentinel db list    — List recent jobs from the database
  job-sentinel adapters   — List available site adapters

Usage
─────
  uv run job-sentinel run
  uv run job-sentinel scrape --dry-run
  uv run job-sentinel db stats
"""

from __future__ import annotations

import contextlib
import sys
from pathlib import Path
from typing import TYPE_CHECKING

import typer
from rich.console import Console
from rich.table import Table

if TYPE_CHECKING:
    from job_sentinel.core.models import JobPosting
    from job_sentinel.db.repository import JobRepository as _JobRepository
    from job_sentinel.documents.tailor import Tailor

# Windows terminals default to cp1252, which raises UnicodeEncodeError on the
# ✓/emoji glyphs we print. Force UTF-8 on the standard streams when possible.
for _stream in (sys.stdout, sys.stderr):
    _reconfigure = getattr(_stream, "reconfigure", None)
    if _reconfigure is not None:
        with contextlib.suppress(Exception):
            _reconfigure(encoding="utf-8")

console = Console()
app = typer.Typer(
    name="job-sentinel",
    help="Site-agnostic job portal monitor with Telegram alerts.",
    add_completion=False,
    rich_markup_mode="rich",
)
db_app = typer.Typer(help="Database inspection commands.")
app.add_typer(db_app, name="db")
sources_app = typer.Typer(help="Search jobs from public APIs and ATS boards (no browser).")
app.add_typer(sources_app, name="sources")
resume_app = typer.Typer(help="Universal profile + resume generation.")
app.add_typer(resume_app, name="resume")
users_app = typer.Typer(help="Manage accounts for the (optional) authenticated API.")
app.add_typer(users_app, name="users")
apps_app = typer.Typer(help="Track job applications (Huntr-style).")
app.add_typer(apps_app, name="apps")
docs_app = typer.Typer(help="Manage the generated résumé/cover-letter library.")
app.add_typer(docs_app, name="docs")
sponsors_app = typer.Typer(help="Official visa-sponsor registry sync and job enrichment.")
app.add_typer(sponsors_app, name="sponsors")


# ─────────────────────────────────────────────────────────────────────────────
# run — primary command
# ─────────────────────────────────────────────────────────────────────────────


@app.command()
def run(
    dry_run: bool = typer.Option(False, "--dry-run", help="Scrape but don't send Telegram msgs"),
    headless: bool = typer.Option(True, "--headless/--no-headless", help="Browser headless mode"),
) -> None:
    """
    Start Job Sentinel: background scraper + Telegram bot.

    The bot runs until Ctrl+C is pressed.
    """
    import os

    # Allow CLI flags to override .env
    if dry_run:
        os.environ["DRY_RUN"] = "true"
    if not headless:
        os.environ["HEADLESS"] = "false"

    # Import here so settings load after env overrides
    from loguru import logger

    from job_sentinel.bot.handlers import build_application
    from job_sentinel.config.logging import configure_logging
    from job_sentinel.config.settings import get_settings
    from job_sentinel.core.scheduler import Scheduler
    from job_sentinel.db.repository import JobRepository
    from job_sentinel.notifiers.discord import DiscordNotifier
    from job_sentinel.notifiers.email import EmailNotifier
    from job_sentinel.notifiers.telegram import TelegramNotifier

    settings = get_settings()
    configure_logging(settings.logging)

    if settings.custom_adapter_path:
        from job_sentinel.adapters.registry import load_custom_adapter

        load_custom_adapter(settings.custom_adapter_path)

    logger.info("🚀 Job Sentinel starting | adapter={} env={}", settings.site_adapter, settings.env)

    repo = JobRepository(settings.db_path)
    notifier = TelegramNotifier(settings.telegram.bot_token, settings.telegram.chat_id)
    email = EmailNotifier(settings.email)
    discord = DiscordNotifier(settings.discord)

    def on_new_jobs(jobs: list[JobPosting]) -> None:
        notifier.send_new_jobs(jobs)
        email.send_new_jobs(jobs)  # no-op unless EMAIL_ENABLED is configured
        discord.send_new_jobs(jobs)  # no-op unless DISCORD_WEBHOOK_URL is set

    scheduler = Scheduler(settings, repo, on_new_jobs)
    bot_app = build_application(settings, repo, scheduler, notifier)

    if email.enabled:
        logger.info("Email channel enabled | recipient={}", settings.email.recipient)
    if discord.enabled:
        logger.info("Discord channel enabled | webhook configured")

    console.print(
        f"[bold green]✓ Job Sentinel running[/]\n"
        f"  Adapter  : [cyan]{settings.site_adapter}[/]\n"
        f"  Interval : [cyan]{settings.scraper.poll_interval_seconds}s[/]\n"
        f"  Dry run  : [cyan]{settings.dry_run}[/]\n"
        f"  DB       : [cyan]{settings.db_path}[/]\n"
        "Press [bold]Ctrl+C[/] to stop."
    )

    scheduler.start()

    try:
        # run_polling blocks until SIGINT/SIGTERM
        bot_app.run_polling(drop_pending_updates=True)
    except KeyboardInterrupt:
        console.print("\n[yellow]Shutting down…[/]")
    finally:
        scheduler.stop()
        repo.close()
        logger.info("Job Sentinel stopped cleanly")


# ─────────────────────────────────────────────────────────────────────────────
# scrape — one-shot scrape (no bot)
# ─────────────────────────────────────────────────────────────────────────────


@app.command()
def scrape(
    dry_run: bool = typer.Option(True, "--dry-run/--send", help="Send alerts? (default: dry-run)"),
) -> None:
    """Run a single scrape cycle and print results. Does NOT start the bot."""
    import os

    os.environ["DRY_RUN"] = str(dry_run).lower()

    from job_sentinel.config.logging import configure_logging
    from job_sentinel.config.settings import get_settings
    from job_sentinel.core.scheduler import Scheduler
    from job_sentinel.db.repository import JobRepository
    from job_sentinel.notifiers.telegram import TelegramNotifier

    settings = get_settings()
    configure_logging(settings.logging)

    if settings.custom_adapter_path:
        from job_sentinel.adapters.registry import load_custom_adapter

        load_custom_adapter(settings.custom_adapter_path)

    repo = JobRepository(settings.db_path)
    notifier = TelegramNotifier(settings.telegram.bot_token, settings.telegram.chat_id)
    scheduler = Scheduler(settings, repo, notifier.send_new_jobs)

    console.print(f"[bold]Running one scrape cycle[/] | adapter=[cyan]{settings.site_adapter}[/]")
    new_count = scheduler.trigger_now()
    console.print(f"[green]✓ Done[/] | new jobs found: [bold]{new_count}[/]")
    repo.close()


# ─────────────────────────────────────────────────────────────────────────────
# ingest — mcp-jobs export / collector JSON → jobs_raw → jobs
# ─────────────────────────────────────────────────────────────────────────────


@app.command()
def ingest(
    path: Path = typer.Argument(  # noqa: B008
        ...,
        exists=True,
        readable=True,
        help="mcp-jobs *-raw.json, JSONL, contract JSON, or a directory of those files",
    ),
    run_id: str | None = typer.Option(None, "--run-id", help="Optional collection-run id"),
) -> None:
    """Import collector output into jobs_raw then upsert normalized jobs."""
    from job_sentinel.db.repository import JobRepository
    from job_sentinel.ingestion.mcp_jobs import load_ingest_file
    from job_sentinel.ingestion.pipeline import ingest_records

    records = load_ingest_file(path)
    if not records:
        console.print("[yellow]No collector records found in[/]", path)
        raise typer.Exit(code=1)

    repo = JobRepository(_DEFAULT_DB)
    try:
        result = ingest_records(repo, records, run_id=run_id)
    finally:
        repo.close()

    console.print(
        f"[green]✓ Ingest[/] raw={result.raw_inserted} "
        f"created={result.jobs_created} updated={result.jobs_updated} "
        f"invalid={result.invalid}"
    )
    for err in result.errors:
        console.print(f"[yellow]{err}[/]")


@app.command()
def collect(
    keywords: str = typer.Option(..., "--keywords", "-k", help="Search keywords for mcp-jobs"),
    location: str = typer.Option("", "--location", "-l", help="City / location (optional)"),
    sources: str = typer.Option(
        "zhaopin,liepin",
        "--sources",
        "-s",
        help="Comma-separated source ids (zhaopin, liepin, boss, dimagi, …)",
    ),
    max_results: int = typer.Option(100, "--max-results", "-n", min=1, max=200),
    remote: bool | None = typer.Option(
        None, "--remote/--no-remote", help="Remote-only / on-site (LinkedIn guest filter)"
    ),
    date_posted_days: int | None = typer.Option(
        None, "--date-posted-days", help="Posted within N days (LinkedIn f_TPR)"
    ),
) -> None:
    """Collect from configured sources into jobs_raw then jobs (same path as Search)."""
    from job_sentinel.db.repository import JobRepository
    from job_sentinel.ingestion.collect import collect_and_ingest

    source_ids = [part.strip() for part in sources.split(",") if part.strip()]
    repo = JobRepository(_DEFAULT_DB)
    try:
        outcome = collect_and_ingest(
            repo,
            keywords=keywords,
            location=location,
            source_ids=source_ids,
            max_results=max_results,
            remote=remote,
            date_posted_days=date_posted_days,
        )
    finally:
        repo.close()

    color = "green" if outcome.status == "completed" else "yellow"
    if outcome.status == "failed":
        color = "red"
    console.print(
        f"[{color}]{outcome.status}[/] {outcome.message} | "
        f"created={outcome.jobs_created} updated={outcome.jobs_updated} "
        f"raw={outcome.raw_inserted}"
    )
    for err in outcome.errors:
        console.print(f"[yellow]{err}[/]")
    if outcome.status == "failed":
        raise typer.Exit(code=1)


@sponsors_app.command("sync")
def sponsors_sync(
    country: str | None = typer.Option(
        None,
        "--country",
        "-c",
        help="GB, NL, or a registry id. Repeat omit to sync all V1 registries.",
    ),
    enrich: bool = typer.Option(
        False,
        "--enrich/--no-enrich",
        help="Recompute sponsorship on existing jobs after a successful sync",
    ),
) -> None:
    """Download official sponsor lists into the local SQLite cache."""
    from job_sentinel.db.repository import JobRepository
    from job_sentinel.sponsorship.enrich import enrich_stored_jobs
    from job_sentinel.sponsorship.sync import sync_registries

    countries = [country] if country else None
    repo = JobRepository(_DEFAULT_DB)
    try:
        results = sync_registries(repo, countries=countries)
        for meta in results:
            if meta.error:
                console.print(f"[yellow]{meta.country} {meta.registry_id}[/] failed: {meta.error}")
            else:
                console.print(
                    f"[green]{meta.country}[/] {meta.registry_name} | "
                    f"rows={meta.row_count} fetched={meta.fetched_at or '—'}"
                )
        if enrich and any(not m.error for m in results):
            n = enrich_stored_jobs(repo)
            console.print(f"[green]Enriched[/] {n} jobs")
    except ValueError as exc:
        console.print(f"[red]{exc}[/]")
        raise typer.Exit(code=1) from exc
    finally:
        repo.close()


@sponsors_app.command("enrich")
def sponsors_enrich() -> None:
    """Recompute sponsorship for jobs already in the pool (uses cached registries)."""
    from job_sentinel.db.repository import JobRepository
    from job_sentinel.sponsorship.enrich import enrich_stored_jobs

    repo = JobRepository(_DEFAULT_DB)
    try:
        n = enrich_stored_jobs(repo)
        console.print(f"[green]Enriched[/] {n} jobs")
    finally:
        repo.close()


# ─────────────────────────────────────────────────────────────────────────────
# serve — local HTTP API (backend for the web UI)
# ─────────────────────────────────────────────────────────────────────────────


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", help="Bind address (localhost by default)"),
    port: int = typer.Option(8000, help="Port"),
    reload: bool = typer.Option(False, "--reload", help="Auto-reload on code changes (dev)"),
) -> None:
    """Run the local HTTP API (needs the 'web' extra: pip install -e '.[web]')."""
    try:
        import uvicorn
    except ImportError as exc:
        console.print(
            "[red]The API needs the 'web' extra.[/] Install it: "
            "[bold]uv sync --extra web[/] (or pip install -e '.[web]')."
        )
        raise typer.Exit(code=1) from exc

    console.print(f"[bold green]✓ Job Sentinel API[/] → http://{host}:{port}  (docs at /docs)")
    uvicorn.run("job_sentinel.api.app:app", host=host, port=port, reload=reload)


@app.command()
def web(
    api_host: str = typer.Option("127.0.0.1", help="API bind address"),
    api_port: int = typer.Option(8000, help="API port"),
    ui_port: int = typer.Option(3000, help="Next.js UI port"),
    watch: bool = typer.Option(
        False, "--watch", help="Also start the recurring scrape watcher (alerts on new jobs)"
    ),
) -> None:
    """Run the whole stack: local API + web UI (+ watcher with --watch)."""
    import os
    import shutil
    import socket
    import subprocess
    import time

    def next_free_port(host: str, preferred: int) -> int:
        port = preferred
        while True:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(0.2)
                if sock.connect_ex((host, port)) != 0:
                    return port
            port += 1

    repo_root = Path(__file__).resolve().parents[2]
    web_dir = repo_root / "web"
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if npm is None:
        console.print("[red]npm was not found.[/] Install Node.js, then run this again.")
        raise typer.Exit(code=1)
    if not web_dir.is_dir():
        console.print(f"[red]Web UI directory not found:[/] {web_dir}")
        raise typer.Exit(code=1)

    api_port = next_free_port(api_host, api_port)
    ui_port = next_free_port("127.0.0.1", ui_port)
    api_url = f"http://{api_host}:{api_port}"
    env = os.environ.copy()
    env["NEXT_PUBLIC_API_BASE"] = api_url
    env["PORT"] = str(ui_port)

    api_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "job_sentinel.api.app:app",
        "--host",
        api_host,
        "--port",
        str(api_port),
    ]
    ui_cmd = [npm, "run", "dev", "--", "-p", str(ui_port)]

    console.print(f"[bold green]Job Sentinel web[/] -> http://localhost:{ui_port}/jobs")
    console.print(f"API -> {api_url}  |  Press [bold]Ctrl+C[/] to stop both.")

    api_proc = subprocess.Popen(api_cmd, cwd=repo_root, env=env)  # noqa: S603
    ui_proc = subprocess.Popen(ui_cmd, cwd=web_dir, env=env)  # noqa: S603

    if watch:
        # Kick the recurring watcher through the API once it's up — same code
        # path as the UI's "Start watcher" button, so state stays in one place.
        import json as _json
        import urllib.request

        def start_watcher_when_ready() -> None:
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                try:
                    req = urllib.request.Request(  # noqa: S310 — fixed localhost URL
                        f"{api_url}/api/ops/watcher/start", method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=3) as resp:  # noqa: S310
                        _json.loads(resp.read())
                    console.print("[green]Watcher started[/] — scraping on the poll interval.")
                    return
                except Exception:
                    time.sleep(1.5)
            console.print("[yellow]Could not start the watcher automatically.[/]")

        import threading

        threading.Thread(target=start_watcher_when_ready, daemon=True).start()

    try:
        while True:
            api_code = api_proc.poll()
            ui_code = ui_proc.poll()
            if api_code is not None:
                console.print(f"[red]API stopped[/] with exit code {api_code}.")
                raise typer.Exit(code=api_code)
            if ui_code is not None:
                console.print(f"[red]Web UI stopped[/] with exit code {ui_code}.")
                raise typer.Exit(code=ui_code)
            time.sleep(0.5)
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopping web stack...[/]")
    finally:
        for proc in (ui_proc, api_proc):
            if proc.poll() is None:
                proc.terminate()
        for proc in (ui_proc, api_proc):
            with contextlib.suppress(subprocess.TimeoutExpired):
                proc.wait(timeout=8)
            if proc.poll() is None:
                proc.kill()


# ─────────────────────────────────────────────────────────────────────────────
# login — capture an authenticated session (one-time, interactive)
# ─────────────────────────────────────────────────────────────────────────────


@app.command()
def login(
    timeout: int = typer.Option(300, help="Seconds to wait for you to finish signing in"),
) -> None:
    """
    Open a visible browser so you can sign in once, then save the session.

    Portals like 12twenty sit behind a Cloudflare challenge, so the bot can't
    log in headlessly. Sign in here as a human (clear the challenge + enter your
    email/password); the resulting cookies are saved to ``session_path`` and
    reused by ``run``/``scrape`` so they stay logged in.
    """
    from job_sentinel.config.logging import configure_logging
    from job_sentinel.config.settings import get_settings
    from job_sentinel.core.session import LoginTimeoutError, interactive_login

    settings = get_settings()
    configure_logging(settings.logging)

    if settings.custom_adapter_path:
        from job_sentinel.adapters.registry import load_custom_adapter

        load_custom_adapter(settings.custom_adapter_path)

    console.print(
        "[bold]A browser window will open.[/] Clear any challenge — your "
        "email/password are prefilled from .env, so just click Sign In.\n"
        "The session saves automatically once you're signed in."
    )

    try:
        interactive_login(settings, timeout_seconds=timeout, on_event=console.print)
    except LoginTimeoutError:
        console.print(
            "[red]Didn't detect a signed-in page in time.[/] "
            "Re-run [bold]job-sentinel login[/] and finish signing in."
        )
        raise typer.Exit(code=1) from None

    console.print(f"[green]✓ Session saved[/] → [cyan]{settings.session_path}[/]")


# ─────────────────────────────────────────────────────────────────────────────
# session — check whether the saved session is still valid
# ─────────────────────────────────────────────────────────────────────────────


@app.command()
def session() -> None:
    """Check whether the saved portal session is still valid (headless, fast)."""
    from job_sentinel.config.logging import configure_logging
    from job_sentinel.config.settings import get_settings
    from job_sentinel.core.session import check_session

    settings = get_settings()
    configure_logging(settings.logging)

    if settings.custom_adapter_path:
        from job_sentinel.adapters.registry import load_custom_adapter

        load_custom_adapter(settings.custom_adapter_path)

    status = check_session(settings)
    if status.valid:
        who = f" as [bold]{status.user}[/]" if status.user else ""
        console.print(f"[green]✓ Session valid[/]{who}")
    elif not status.checked:
        console.print(f"[yellow]? Unknown[/] — {status.detail}")
    else:
        console.print(
            f"[red]✗ Session expired or missing[/] — {status.detail}\n"
            "Run [bold]job-sentinel login[/] to sign in again."
        )
        raise typer.Exit(code=1)


# ─────────────────────────────────────────────────────────────────────────────
# resume — universal profile + PDF generation (works without the bot configured)
# ─────────────────────────────────────────────────────────────────────────────


@resume_app.command("init")
def resume_init(
    force: bool = typer.Option(False, "--force", help="Overwrite an existing profile.yaml"),
) -> None:
    """Create a starter profile.yaml you can edit like an Overleaf source."""
    from job_sentinel.profile import DEFAULT_PROFILE_PATH, example_profile, save_profile

    if DEFAULT_PROFILE_PATH.exists() and not force:
        console.print(
            f"[yellow]Profile already exists[/] at [cyan]{DEFAULT_PROFILE_PATH}[/]. "
            "Use [bold]--force[/] to overwrite."
        )
        return
    path = save_profile(example_profile(), DEFAULT_PROFILE_PATH)
    console.print(f"[green]✓ Wrote starter profile[/] → [cyan]{path}[/]")
    console.print("Edit it, then run [bold]resume build[/].")


@resume_app.command("import")
def resume_import(
    pdf: Path = typer.Argument(..., exists=True, readable=True, help="Resume PDF to import"),  # noqa: B008
    ai: bool = typer.Option(True, "--ai/--no-ai", help="Use the local LLM when available"),
    force: bool = typer.Option(False, "--force", help="Overwrite an existing profile.yaml"),
) -> None:
    """Extract a profile from a resume PDF and save it as profile.yaml."""
    from job_sentinel.documents.resume_import import (
        ResumeImportError,
        extract_pdf_text,
        parse_resume_text,
    )
    from job_sentinel.profile import DEFAULT_PROFILE_PATH, load_profile, save_profile

    if DEFAULT_PROFILE_PATH.exists() and not force:
        existing = load_profile()
        if not existing.is_empty():
            console.print(
                f"[yellow]A profile already exists[/] at [cyan]{DEFAULT_PROFILE_PATH}[/]. "
                "Use [bold]--force[/] to overwrite it."
            )
            raise typer.Exit(code=1)

    try:
        text = extract_pdf_text(pdf.read_bytes())
    except ResumeImportError as exc:
        console.print(f"[red]Could not import the PDF.[/]\n{exc}")
        raise typer.Exit(code=1) from exc

    client = None
    if ai:
        from job_sentinel.config.settings import LLMSettings
        from job_sentinel.documents.llm import OllamaClient

        cfg = LLMSettings()
        candidate = OllamaClient(cfg.base_url, cfg.model)
        if candidate.available() and candidate.has_model():
            console.print(f"[green]Extracting with local model[/] [cyan]{cfg.model}[/]…")
            client = candidate
        else:
            console.print("[yellow]Local model unavailable[/] — using the heuristic parser.")

    profile = parse_resume_text(text, client=client)
    path = save_profile(profile, DEFAULT_PROFILE_PATH)
    console.print(
        f"[green]✓ Profile imported[/] → [cyan]{path}[/]\n"
        "Review it with [bold]resume show[/] (or the web UI) — extraction is a draft, "
        "not gospel."
    )


@resume_app.command("show")
def resume_show() -> None:
    """Summarise the current profile (section counts)."""
    from job_sentinel.profile import load_profile

    profile = load_profile()
    if profile.is_empty():
        console.print("[yellow]Profile is empty.[/] Run [bold]resume init[/] to start.")
        return

    table = Table(title=f"Profile — {profile.basics.name or 'unnamed'}")
    table.add_column("Section", style="cyan")
    table.add_column("Entries", justify="right")
    table.add_row("Education", str(len(profile.education)))
    table.add_row("Experience", str(len(profile.experience)))
    table.add_row("Projects", str(len(profile.projects)))
    table.add_row("Skill groups", str(len(profile.skills)))
    table.add_row("Certifications", str(len(profile.certifications)))
    table.add_row("Awards", str(len(profile.awards)))
    table.add_row("Publications", str(len(profile.publications)))
    console.print(table)


@resume_app.command("build")
def resume_build(
    out: Path = typer.Option(  # noqa: B008 — typer reads the default at decoration time
        Path("data/resume.pdf"), "--out", "-o", help="Output PDF path"
    ),
    job_text: str = typer.Option("", "--job-text", "-j", help="Tailor to this job description"),
    job_id: str = typer.Option("", "--job-id", help="Tailor to a stored posting (by id)"),
    ai: bool = typer.Option(False, "--ai", help="Rephrase bullets with a local LLM (needs Ollama)"),
    semantic: bool = typer.Option(
        False, "--semantic", help="Order content by local embedding similarity (needs Ollama)"
    ),
) -> None:
    """
    Render the profile to an ATS-friendly PDF (and matching .tex).

    With ``--job-text`` (paste a description) or ``--job-id`` (a posting already
    in the DB), the résumé is tailored: relevant content is reordered to lead
    and an ATS keyword-coverage score is reported. ``--ai`` rephrases bullets with
    a local model; ``--semantic`` orders content by embedding similarity. Both
    fall back to keyword tailoring when the local model is unavailable.
    """
    from job_sentinel.documents import RenderError, build_resume_pdf
    from job_sentinel.profile import load_profile

    profile = load_profile()
    if profile.is_empty():
        console.print("[yellow]Profile is empty.[/] Run [bold]resume init[/] first.")
        raise typer.Exit(code=1)

    description = job_text or (_load_job_description(job_id) if job_id else "")
    if description:
        tailor = _build_tailor(use_ai=ai, use_semantic=semantic)
        result = tailor.tailor(profile, description)
        profile = result.profile
        console.print(f"[bold]ATS keyword coverage:[/] [cyan]{result.score_pct}%[/]")
        if result.missing_keywords:
            preview = ", ".join(result.missing_keywords[:12])
            console.print(f"[yellow]Missing from résumé:[/] {preview}")
    elif ai or semantic:
        console.print(
            "[yellow]--ai/--semantic need a job to tailor toward; pass --job-text or --job-id.[/]"
        )

    try:
        pdf = build_resume_pdf(profile, out)
    except RenderError as exc:
        console.print(f"[red]Could not build the PDF.[/]\n{exc}")
        raise typer.Exit(code=1) from exc
    console.print(f"[green]✓ Resume built[/] → [cyan]{pdf}[/]")


def _build_tailor(*, use_ai: bool, use_semantic: bool = False) -> Tailor:
    """
    Compose a Tailor: keyword by default; LLM rephrasing if ``--ai`` and reachable;
    semantic (embedding) ordering layered on top if ``--semantic`` and reachable.
    Each AI layer degrades to the simpler tailor when the local model is missing.
    """
    from job_sentinel.documents import KeywordTailor

    tailor: Tailor = KeywordTailor()

    if use_ai:
        from job_sentinel.config.settings import LLMSettings
        from job_sentinel.documents.llm import LLMTailor, OllamaClient

        cfg = LLMSettings()
        client = OllamaClient(cfg.base_url, cfg.model)
        if client.available() and client.has_model():
            console.print(f"[green]Using local model[/] [cyan]{cfg.model}[/] for rephrasing.")
            tailor = LLMTailor(client, base=tailor)
        else:
            console.print(
                "[yellow]LLM unavailable[/] — skipping rephrasing. "
                "Run [bold]job-sentinel resume doctor --pull[/]."
            )

    if use_semantic:
        from job_sentinel.config.settings import LLMSettings
        from job_sentinel.documents.embeddings import OllamaEmbedder
        from job_sentinel.documents.semantic import SemanticTailor

        cfg = LLMSettings()
        embedder = OllamaEmbedder(cfg.base_url, cfg.embed_model)
        if embedder.available():
            console.print(f"[green]Semantic ranking[/] via [cyan]{cfg.embed_model}[/].")
            tailor = SemanticTailor(embedder, base=tailor)
        else:
            console.print(
                f"[yellow]Embedding model '{cfg.embed_model}' unavailable[/] — "
                f"keyword ordering. Pull it: [bold]ollama pull {cfg.embed_model}[/]."
            )

    return tailor


@resume_app.command("doctor")
def resume_doctor(
    pull: bool = typer.Option(False, "--pull", help="Pull the configured model if missing"),
) -> None:
    """Check the local-LLM setup (Ollama) and optionally pull the model."""
    import shutil
    import subprocess

    from job_sentinel.config.settings import LLMSettings
    from job_sentinel.documents.embeddings import OllamaEmbedder
    from job_sentinel.documents.llm import OllamaClient

    cfg = LLMSettings()
    client = OllamaClient(cfg.base_url, cfg.model)
    embedder = OllamaEmbedder(cfg.base_url, cfg.embed_model)
    ollama_bin = shutil.which("ollama")

    reachable = client.available()
    has_chat = reachable and client.has_model()
    has_embed = reachable and embedder.available()

    table = Table(title="Résumé AI — local model status")
    table.add_column("Check", style="cyan")
    table.add_column("Result")
    table.add_row("ollama installed", "✓" if ollama_bin else "✗  (https://ollama.com/download)")
    table.add_row("server reachable", f"✓  {cfg.base_url}" if reachable else f"✗  {cfg.base_url}")
    table.add_row(f"chat model '{cfg.model}'", "✓ pulled" if has_chat else "✗ not pulled  (--ai)")
    table.add_row(
        f"embed model '{cfg.embed_model}'",
        "✓ pulled" if has_embed else "✗ not pulled  (--semantic)",
    )
    console.print(table)

    if not reachable:
        if not ollama_bin:
            console.print(
                "Install Ollama (https://ollama.com/download), run [bold]ollama serve[/]."
            )
        else:
            console.print("Start the server with [bold]ollama serve[/], then re-check.")
        return

    missing = [m for m, ok in ((cfg.model, has_chat), (cfg.embed_model, has_embed)) if not ok]
    if missing:
        if pull and ollama_bin:
            for model in missing:
                console.print(f"Pulling [cyan]{model}[/] (one-time)…")
                subprocess.run([ollama_bin, "pull", model], check=False)  # noqa: S603 — fixed argv, PATH-resolved
        else:
            cmds = " ; ".join(f"ollama pull {m}" for m in missing)
            hint = "" if ollama_bin else " (ollama isn't on PATH, so run these yourself)"
            console.print(f"Pull the missing model(s): [bold]{cmds}[/]{hint}.")
        return
    console.print('[green]✓ Ready[/] — try [bold]resume build --ai --semantic --job-text "…"[/].')


@resume_app.command("cover")
def resume_cover(
    out: Path = typer.Option(  # noqa: B008 — typer reads the default at decoration time
        Path("data/cover_letter.pdf"), "--out", "-o", help="Output PDF path"
    ),
    job_text: str = typer.Option("", "--job-text", "-j", help="Job description to target"),
    role: str = typer.Option("", "--role", help="Role title (for the opening line)"),
    company: str = typer.Option("", "--company", help="Company/department name"),
    ai: bool = typer.Option(False, "--ai", help="Polish with a local LLM (needs Ollama)"),
) -> None:
    """Generate a tailored cover letter PDF from your profile."""
    from datetime import date

    from job_sentinel.documents import RenderError, build_cover_letter_pdf, cover_letter_paragraphs
    from job_sentinel.profile import load_profile

    profile = load_profile()
    if profile.is_empty():
        console.print("[yellow]Profile is empty.[/] Run [bold]resume init[/] first.")
        raise typer.Exit(code=1)

    client = None
    if ai:
        from job_sentinel.config.settings import LLMSettings
        from job_sentinel.documents.llm import OllamaClient

        cfg = LLMSettings()
        client = OllamaClient(cfg.base_url, cfg.model)
        if not (client.available() and client.has_model()):
            console.print("[yellow]Local model unavailable — writing the deterministic draft.[/]")
            client = None

    paragraphs = cover_letter_paragraphs(
        profile, role=role, company=company, job_description=job_text, client=client
    )
    try:
        pdf = build_cover_letter_pdf(
            profile,
            paragraphs,
            out,
            role=role,
            company=company,
            today=date.today().strftime("%B %d, %Y"),
        )
    except RenderError as exc:
        console.print(f"[red]Could not build the PDF.[/]\n{exc}")
        raise typer.Exit(code=1) from exc
    console.print(f"[green]✓ Cover letter built[/] → [cyan]{pdf}[/]")


def _load_job_description(posting_id: str) -> str:
    """Fetch a stored posting and flatten it into a description for tailoring."""
    from job_sentinel.db.repository import JobRepository

    db_path = Path(__file__).resolve().parents[2] / "data" / "jobs.db"
    if not db_path.is_file():
        console.print(f"[yellow]No database yet[/] at {db_path}; run a scrape first.")
        return ""
    repo = JobRepository(db_path)
    try:
        job = repo.get_job(posting_id)
    finally:
        repo.close()
    if job is None:
        console.print(f"[yellow]Posting {posting_id} not found in the DB.[/]")
        return ""
    return " ".join([job.title, job.employer, job.job_type, job.description_snippet])


# ─────────────────────────────────────────────────────────────────────────────
# users — accounts for the optional authenticated API (AUTH_MODE=demo|required)
# ─────────────────────────────────────────────────────────────────────────────

_USERS_PATH = Path(__file__).resolve().parents[2] / "data" / "users.json"


@users_app.command("add")
def users_add(
    username: str = typer.Argument(..., help="Login name (stored lowercase)"),
    admin: bool = typer.Option(False, "--admin", help="Grant admin (can create accounts)"),
    password: str = typer.Option(
        ..., prompt=True, confirmation_prompt=True, hide_input=True, help="Account password"
    ),
) -> None:
    """Create an account. The first account must be created with --admin."""
    from job_sentinel.api.auth import AuthError, UserStore

    if len(password) < 8:
        console.print("[red]Password must be at least 8 characters.[/]")
        raise typer.Exit(code=1)
    try:
        user = UserStore(_USERS_PATH).add_user(username, password, is_admin=admin)
    except AuthError as exc:
        console.print(f"[red]{exc}[/]")
        raise typer.Exit(code=1) from exc
    role = "admin" if user.is_admin else "member"
    console.print(f"[green]✓ Created {role}[/] [cyan]{user.username}[/] → {_USERS_PATH}")
    console.print(
        "Enable auth by setting [bold]AUTH_MODE=demo[/] (writes need login) or "
        "[bold]AUTH_MODE=required[/] before [bold]job-sentinel serve[/]."
    )


@users_app.command("list")
def users_list() -> None:
    """List accounts."""
    from job_sentinel.api.auth import UserStore

    users = UserStore(_USERS_PATH).list_users()
    if not users:
        console.print("[yellow]No accounts yet.[/] Create one: [bold]users add <name> --admin[/]")
        return
    table = Table(title="API accounts")
    table.add_column("Username", style="cyan")
    table.add_column("Role")
    for u in users:
        table.add_row(u.username, "admin" if u.is_admin else "member")
    console.print(table)


@users_app.command("remove")
def users_remove(username: str = typer.Argument(..., help="Account to delete")) -> None:
    """Delete an account."""
    from job_sentinel.api.auth import UserStore

    if UserStore(_USERS_PATH).remove_user(username):
        console.print(f"[green]✓ Removed[/] [cyan]{username}[/]")
    else:
        console.print(f"[yellow]No such user:[/] {username}")
        raise typer.Exit(code=1)


# ─────────────────────────────────────────────────────────────────────────────
# db stats / list
# ─────────────────────────────────────────────────────────────────────────────


@db_app.command("stats")
def db_stats() -> None:
    """Print aggregate job counts from the database."""
    from job_sentinel.config.settings import get_settings
    from job_sentinel.db.repository import JobRepository

    settings = get_settings()
    repo = JobRepository(settings.db_path)
    counts = repo.get_stats()
    repo.close()

    table = Table(title="Job Sentinel — DB Stats", show_header=True)
    table.add_column("Status", style="cyan")
    table.add_column("Count", justify="right")
    for key, val in counts.items():
        table.add_row(key, str(val))
    console.print(table)


@db_app.command("list")
def db_list(limit: int = typer.Option(10, help="Number of recent jobs to show")) -> None:
    """List recent jobs from the database."""
    from job_sentinel.config.settings import get_settings
    from job_sentinel.db.repository import JobRepository

    settings = get_settings()
    repo = JobRepository(settings.db_path)
    jobs = repo.get_recent_jobs(limit=limit)
    repo.close()

    if not jobs:
        console.print("[yellow]No jobs in database yet.[/]")
        return

    table = Table(title=f"Last {len(jobs)} Jobs", show_header=True)
    table.add_column("ID", style="dim", no_wrap=True)
    table.add_column("Title", style="bold")
    table.add_column("Employer")
    table.add_column("Status", style="cyan")
    table.add_column("Found")

    for job in jobs:
        table.add_row(
            job.posting_id[:12],
            job.title[:40],
            job.employer[:25],
            job.status.value,
            job.discovered_at.strftime("%m-%d %H:%M"),
        )
    console.print(table)


# ─────────────────────────────────────────────────────────────────────────────
# adapters list
# ─────────────────────────────────────────────────────────────────────────────


@app.command()
def adapters() -> None:
    """List all available site adapters."""
    from job_sentinel.adapters.registry import list_adapters
    from job_sentinel.config.settings import get_settings

    settings = get_settings()
    active = settings.site_adapter
    ids = list_adapters()

    table = Table(title="Available Site Adapters")
    table.add_column("ID", style="cyan")
    table.add_column("Active", justify="center")
    for aid in ids:
        table.add_row(aid, "✓" if aid == active else "")
    console.print(table)


# ─────────────────────────────────────────────────────────────────────────────
# apps — application tracker (Huntr/Teal-style)
# ─────────────────────────────────────────────────────────────────────────────

_DEFAULT_DB = Path(__file__).resolve().parents[2] / "data" / "jobs.db"


def _open_repo() -> _JobRepository:
    from job_sentinel.db.repository import JobRepository

    return JobRepository(_DEFAULT_DB)


@apps_app.command("list")
def apps_list(
    stage: str = typer.Option("", "--stage", "-s", help="Filter by stage (draft/applied/…)"),
    limit: int = typer.Option(200, "--limit", "-n", help="Max rows to show"),
) -> None:
    """List tracked applications."""
    from job_sentinel.core.models import ApplicationStage
    from job_sentinel.db.repository import JobRepository

    stage_filter = None
    if stage:
        try:
            stage_filter = ApplicationStage(stage.lower())
        except ValueError:
            console.print(f"[red]Unknown stage:[/] {stage}")
            raise typer.Exit(code=1) from None

    repo = JobRepository(_DEFAULT_DB)
    apps = repo.list_applications(stage=stage_filter, limit=limit)
    repo.close()

    if not apps:
        console.print("[yellow]No applications found.[/]")
        return

    table = Table(title="Tracked Applications")
    table.add_column("ID", style="dim", no_wrap=True)
    table.add_column("Title", style="bold")
    table.add_column("Employer")
    table.add_column("Stage", style="cyan")
    table.add_column("Applied")

    for a in apps:
        table.add_row(
            a.id[:12],
            a.title[:40],
            a.employer[:25],
            a.stage.value,
            a.applied_date or "-",
        )
    console.print(table)


@apps_app.command("add")
def apps_add(
    title: str = typer.Option(..., "--title", "-t", help="Job title"),
    employer: str = typer.Option("", "--employer", "-e", help="Company name"),
    location: str = typer.Option("", "--location", "-l", help="Work location"),
    url: str = typer.Option("", "--url", "-u", help="Posting URL"),
    source: str = typer.Option("", "--source", help="Source (e.g. manual, adzuna)"),
    stage: str = typer.Option("draft", "--stage", "-s", help="Initial stage"),
    salary: str = typer.Option("", "--salary", help="Salary range / offer"),
    applied_date: str = typer.Option("", "--applied-date", help="ISO date (YYYY-MM-DD)"),
    deadline: str = typer.Option("", "--deadline", help="Application deadline"),
    notes: str = typer.Option("", "--notes", help="Free-form notes"),
) -> None:
    """Add a new application manually."""
    from job_sentinel.core.models import Application, ApplicationStage
    from job_sentinel.db.repository import JobRepository

    try:
        stage_enum = ApplicationStage(stage.lower())
    except ValueError:
        console.print(f"[red]Unknown stage:[/] {stage}")
        raise typer.Exit(code=1) from None

    app_obj = Application(
        title=title,
        employer=employer,
        location=location,
        url=url,
        source=source,
        stage=stage_enum,
        salary=salary,
        applied_date=applied_date,
        deadline=deadline,
        notes=notes,
    )
    repo = JobRepository(_DEFAULT_DB)
    repo.create_application(app_obj)
    repo.close()
    console.print(f"[green]✓ Application added[/] | id=[cyan]{app_obj.id[:12]}[/] {title!r}")


@apps_app.command("stage")
def apps_stage(
    app_id: str = typer.Argument(..., help="Application id (or prefix)"),
    stage: str = typer.Argument(..., help="New stage"),
) -> None:
    """Update the stage of a tracked application."""
    from job_sentinel.core.models import ApplicationStage
    from job_sentinel.db.repository import JobRepository

    try:
        stage_enum = ApplicationStage(stage.lower())
    except ValueError:
        console.print(f"[red]Unknown stage:[/] {stage}")
        raise typer.Exit(code=1) from None

    repo = JobRepository(_DEFAULT_DB)
    found = repo.update_application(app_id, stage=stage_enum)
    repo.close()
    if not found:
        console.print(f"[red]Application {app_id!r} not found.[/]")
        raise typer.Exit(code=1)
    console.print(f"[green]✓ Stage updated[/] → [cyan]{stage_enum.value}[/]")


@apps_app.command("note")
def apps_note(
    app_id: str = typer.Argument(..., help="Application id"),
    text: str = typer.Argument(..., help="Note text to set"),
) -> None:
    """Set the notes field on a tracked application."""
    from job_sentinel.db.repository import JobRepository

    repo = JobRepository(_DEFAULT_DB)
    found = repo.update_application(app_id, notes=text)
    repo.close()
    if not found:
        console.print(f"[red]Application {app_id!r} not found.[/]")
        raise typer.Exit(code=1)
    console.print("[green]✓ Note saved.[/]")


@apps_app.command("rm")
def apps_rm(app_id: str = typer.Argument(..., help="Application id to delete")) -> None:
    """Delete a tracked application."""
    from job_sentinel.db.repository import JobRepository

    repo = JobRepository(_DEFAULT_DB)
    found = repo.delete_application(app_id)
    repo.close()
    if not found:
        console.print(f"[red]Application {app_id!r} not found.[/]")
        raise typer.Exit(code=1)
    console.print(f"[green]✓ Deleted[/] [cyan]{app_id[:12]}[/]")


# ─────────────────────────────────────────────────────────────────────────────
# docs — generated document library
# ─────────────────────────────────────────────────────────────────────────────


@docs_app.command("list")
def docs_list(
    kind: str = typer.Option("", "--kind", "-k", help="Filter by kind (resume/cover_letter)"),
) -> None:
    """List generated résumés and cover letters."""
    from job_sentinel.core.models import DocumentKind
    from job_sentinel.db.repository import JobRepository

    kind_filter = None
    if kind:
        try:
            kind_filter = DocumentKind(kind.lower())
        except ValueError:
            console.print(f"[red]Unknown kind:[/] {kind}")
            raise typer.Exit(code=1) from None

    repo = JobRepository(_DEFAULT_DB)
    docs = repo.list_documents(kind=kind_filter)
    repo.close()

    if not docs:
        console.print("[yellow]No generated documents found.[/]")
        return

    table = Table(title="Generated Documents")
    table.add_column("ID", style="dim", no_wrap=True)
    table.add_column("Kind", style="cyan")
    table.add_column("Title")
    table.add_column("Employer")
    table.add_column("ATS%", justify="right")
    table.add_column("Created")

    for d in docs:
        ats = f"{d.ats_score:.0f}" if d.ats_score is not None else "-"
        table.add_row(
            d.id[:12],
            d.kind.value,
            d.title[:30] or "-",
            d.employer[:20] or "-",
            ats,
            d.created_at.strftime("%m-%d %H:%M"),
        )
    console.print(table)


@docs_app.command("rm")
def docs_rm(doc_id: str = typer.Argument(..., help="Document id to delete")) -> None:
    """Delete a generated document record (and its PDF file)."""
    import contextlib

    from job_sentinel.db.repository import JobRepository

    repo = JobRepository(_DEFAULT_DB)
    doc = repo.get_document(doc_id)
    if doc is None:
        repo.close()
        console.print(f"[red]Document {doc_id!r} not found.[/]")
        raise typer.Exit(code=1)
    repo.delete_document(doc_id)
    repo.close()
    if doc.file_path:
        with contextlib.suppress(OSError):
            Path(doc.file_path).unlink(missing_ok=True)
    console.print(f"[green]✓ Deleted[/] [cyan]{doc_id[:12]}[/]")


# ─────────────────────────────────────────────────────────────────────────────
# sources — job-source search (HTTP/JSON APIs, no browser)
# ─────────────────────────────────────────────────────────────────────────────


@sources_app.command("list")
def sources_list() -> None:
    """List all known job sources and their configuration status."""
    from job_sentinel.config.settings import get_settings
    from job_sentinel.sources.registry import all_sources_status

    settings = get_settings()
    statuses = all_sources_status(settings)

    table = Table(title="Job Sources")
    table.add_column("ID", style="cyan")
    table.add_column("Label")
    table.add_column("Enabled", justify="center")
    table.add_column("Key?", justify="center")
    table.add_column("Configured", justify="center")
    table.add_column("Scraper?", justify="center")

    for s in statuses:
        table.add_row(
            s["id"],
            s["label"],
            "[green]✓[/]" if s["enabled"] else "",
            "[yellow]✓[/]" if s["requires_key"] else "",
            "[green]✓[/]" if s["configured"] else "[red]✗[/]",
            "[yellow]⚠[/]" if s["is_scraper"] else "",
        )
    console.print(table)


@sources_app.command("search")
def sources_search(
    keywords: str = typer.Argument("", help="Job keywords to search for"),
    location: str = typer.Option("", "--location", "-l", help="Location filter"),
    remote: bool | None = typer.Option(None, "--remote/--no-remote", help="Remote filter"),
    limit: int = typer.Option(20, "--limit", "-n", help="Max results to show"),
    source: list[str] = typer.Option(  # noqa: B008
        None, "--source", "-s", help="Restrict to this source ID (repeatable)"
    ),
) -> None:
    """Search jobs from enabled public API sources (no browser needed)."""
    from job_sentinel.config.settings import get_settings
    from job_sentinel.sources.base import JobQuery
    from job_sentinel.sources.registry import build_enabled_sources, get_source
    from job_sentinel.sources.search import aggregate_search

    settings = get_settings()
    query = JobQuery(keywords=keywords, location=location, remote=remote, limit=limit)

    if source:
        active_sources = []
        for sid in source:
            try:
                cls = get_source(sid)
                active_sources.append(cls())
            except Exception as exc:
                console.print(f"[yellow]Unknown source {sid!r}:[/] {exc}")
    else:
        active_sources = build_enabled_sources(settings)

    if not active_sources:
        console.print("[yellow]No sources enabled.[/] Check [bold]sources list[/].")
        raise typer.Exit(code=1)

    console.print(f"Searching [cyan]{len(active_sources)}[/] source(s) for [bold]{keywords!r}[/]…")

    response = aggregate_search(query, active_sources)

    if response.errors:
        for err in response.errors:
            console.print(f"[yellow]Source {err.source} error:[/] {err.detail}")

    if not response.results:
        console.print("[yellow]No results found.[/]")
        return

    table = Table(title=f"Search Results ({len(response.results)} jobs)", show_lines=False)
    table.add_column("Source", style="dim")
    table.add_column("Title", style="bold")
    table.add_column("Employer")
    table.add_column("Location")
    table.add_column("Posted")
    table.add_column("URL", style="cyan", no_wrap=True)

    for job in response.results:
        table.add_row(
            job.source_adapter,
            job.title[:45],
            job.employer[:25],
            job.location[:20],
            job.posted_date[:10] if job.posted_date else "-",
            job.portal_url[:50] if job.portal_url else "-",
        )
    console.print(table)

    counts_str = ", ".join(f"{k}:{v}" for k, v in response.counts.items() if v)
    console.print(f"[dim]Counts: {counts_str}[/]")


@sources_app.command("company")
def sources_company(
    ats: str = typer.Argument(..., help="ATS platform: greenhouse, lever, or ashby"),
    slug: str = typer.Argument(..., help="Company slug (e.g. 'stripe', 'linear')"),
) -> None:
    """Fetch all open positions from a company's public ATS board."""
    from job_sentinel.sources.company_boards import SUPPORTED_ATS, fetch_company_board

    ats = ats.strip().lower()
    if ats not in SUPPORTED_ATS:
        console.print(
            f"[red]Unsupported ATS:[/] {ats!r}. Supported: {', '.join(sorted(SUPPORTED_ATS))}"
        )
        raise typer.Exit(code=1)

    console.print(f"Fetching [bold]{slug}[/] from [cyan]{ats}[/]…")
    try:
        jobs = fetch_company_board(ats, slug)
    except ValueError as exc:
        console.print(f"[red]Error:[/] {exc}")
        raise typer.Exit(code=1) from exc

    if not jobs:
        console.print("[yellow]No openings found.[/]")
        return

    table = Table(title=f"{slug} on {ats} ({len(jobs)} openings)")
    table.add_column("Title", style="bold")
    table.add_column("Location")
    table.add_column("Type")
    table.add_column("Posted")
    table.add_column("URL", style="cyan")

    for job in jobs:
        table.add_row(
            job.title[:50],
            job.location[:25],
            job.job_type[:20],
            job.posted_date[:10] if job.posted_date else "-",
            job.portal_url[:55] if job.portal_url else "-",
        )
    console.print(table)


# ─────────────────────────────────────────────────────────────────────────────
# Entry-point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app()
