"""
config/settings.py
──────────────────
Centralised configuration via **pydantic-settings** (v2).

Why pydantic-settings over plain python-dotenv + dataclass?
  • Automatic type coercion  — "900" → int, "true" → bool, "a,b" → list[str]
  • Validation with clear error messages at startup, not deep in the call stack
  • IDE autocompletion everywhere — settings.poll_interval_seconds not settings["poll_interval"]
  • Nested models — each subsystem can own its own sub-Settings
  • Multiple sources in priority order: env > .env file > defaults
  • Zero boilerplate — no manual os.getenv() calls scattered around

Usage
-----
    from job_sentinel.config.settings import get_settings

    settings = get_settings()   # cached singleton — safe to call anywhere
    print(settings.telegram.bot_token)
"""

from __future__ import annotations

from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# ─────────────────────────────────────────────────────────────────────────────
# Sub-settings (nested models for each subsystem)
# ─────────────────────────────────────────────────────────────────────────────

_REPO_ROOT = Path(__file__).resolve().parents[3]
_ENV_FILE = str(_REPO_ROOT / ".env")

# Each nested BaseSettings loads its own sources, so every one of them must be
# pointed at the .env file via env_file= — otherwise only the root Settings
# reads it and the nested credentials silently fall back to "missing".


class TelegramSettings(BaseSettings):
    """Telegram Bot API credentials."""

    model_config = SettingsConfigDict(
        env_prefix="TELEGRAM_", extra="ignore", env_file=_ENV_FILE, env_file_encoding="utf-8"
    )

    bot_token: str = Field(..., description="Bot token from @BotFather")
    chat_id: str = Field(..., description="Target chat / user ID for alerts")


class PortalSettings(BaseSettings):
    """Target portal credentials and URL."""

    model_config = SettingsConfigDict(
        env_prefix="PORTAL_", extra="ignore", env_file=_ENV_FILE, env_file_encoding="utf-8"
    )

    username: str = Field(..., description="Portal login username / email")
    password: str = Field(..., description="Portal login password")
    jobs_url: str = Field(
        ...,
        description="Full URL to the job-listings page to scrape",
    )


class ScraperSettings(BaseSettings):
    """Browser automation behaviour."""

    model_config = SettingsConfigDict(extra="ignore", env_file=_ENV_FILE, env_file_encoding="utf-8")

    headless: bool = Field(default=True, description="Run browser headless?")
    browser_slowmo_ms: int = Field(default=0, ge=0, description="Playwright slow-mo (ms)")
    max_pages: int = Field(default=50, ge=1, le=500, description="Max pages to paginate")
    page_timeout_ms: int = Field(default=30_000, ge=5_000, description="Page load timeout (ms)")
    poll_interval_seconds: int = Field(
        default=900, ge=60, description="Scrape interval in seconds (min 60)"
    )


class FilterSettings(BaseSettings):
    """Keyword-based post-scrape filtering."""

    model_config = SettingsConfigDict(extra="ignore", env_file=_ENV_FILE, env_file_encoding="utf-8")

    # NoDecode stops pydantic-settings from JSON-decoding the env value first
    # (it would choke on a plain CSV like "software,engineer"); we parse it
    # ourselves in the validator below.
    keyword_filters: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        description="Comma-separated keywords; empty = match all",
    )

    @field_validator("keyword_filters", mode="before")
    @classmethod
    def parse_csv(cls, v: object) -> list[str]:
        """Accept 'a,b,c' string OR a real list from env."""
        if v is None or v == "":
            return []
        if isinstance(v, str):
            return [kw.strip() for kw in v.split(",") if kw.strip()]
        if isinstance(v, Iterable):
            return [str(item) for item in v]
        return []


class LLMSettings(BaseSettings):
    """
    LLM provider config — covers both the chat and embedding backends.

    Backward-compatible: the legacy OLLAMA_BASE_URL / OLLAMA_MODEL /
    OLLAMA_EMBED_MODEL env-vars still work as before.  New env-vars let users
    route each backend independently to a different provider.
    """

    # ── Legacy Ollama vars (backward-compat; no prefix model) ────────────────
    model_config = SettingsConfigDict(
        env_prefix="OLLAMA_", extra="ignore", env_file=_ENV_FILE, env_file_encoding="utf-8"
    )

    # Kept for backward-compat; the resolved helpers below honour these first.
    base_url: str = Field(
        default="http://localhost:11434", description="Ollama HTTP endpoint (OLLAMA_BASE_URL)"
    )
    model: str = Field(default="llama3.2:3b", description="Local model tag (OLLAMA_MODEL)")
    embed_model: str = Field(
        default="nomic-embed-text",
        description="Local embedding model (OLLAMA_EMBED_MODEL)",
    )

    # ── Chat backend ─────────────────────────────────────────────────────────
    # These are read WITHOUT the OLLAMA_ prefix; pydantic-settings reads them
    # from the environment / .env as CHAT_PROVIDER, CHAT_MODEL, etc.

    chat_provider: str = Field(
        default="ollama",
        validation_alias="CHAT_PROVIDER",
        description="Provider for chat: ollama | openai | openrouter | groq | gemini | custom",
    )
    # Empty string means "fall back to OLLAMA_MODEL then llama3.2:3b".
    chat_model: str = Field(
        default="",
        validation_alias="CHAT_MODEL",
        description="Chat model override (empty → use OLLAMA_MODEL default)",
    )
    chat_api_key: str = Field(
        default="",
        repr=False,
        validation_alias="CHAT_API_KEY",
        description="API key for the chat provider (never logged)",
    )
    # Empty string means "derive from provider table".
    chat_base_url: str = Field(
        default="",
        validation_alias="CHAT_BASE_URL",
        description="Base URL override for chat provider (empty → use provider default)",
    )

    # ── Embed backend ─────────────────────────────────────────────────────────
    embed_provider: str = Field(
        default="ollama",
        validation_alias="EMBED_PROVIDER",
        description="Provider for embeddings: ollama | openai | openrouter | gemini | custom",
    )
    embed_model_override: str = Field(
        default="",
        validation_alias="EMBED_MODEL",
        description="Embed model override (empty → use OLLAMA_EMBED_MODEL default)",
    )
    embed_api_key: str = Field(
        default="",
        repr=False,
        validation_alias="EMBED_API_KEY",
        description="API key for the embed provider (never logged)",
    )
    embed_base_url: str = Field(
        default="",
        validation_alias="EMBED_BASE_URL",
        description="Base URL override for embed provider (empty → use provider default)",
    )

    # ── Shared timeouts / flags ───────────────────────────────────────────────
    llm_timeout: int = Field(
        default=90,
        validation_alias="LLM_TIMEOUT",
        description="Shared HTTP timeout (seconds) for all LLM calls",
    )
    llm_graceful_degradation: bool = Field(
        default=True,
        validation_alias="LLM_GRACEFUL_DEGRADATION",
        description="Fall back silently when a backend is unavailable",
    )

    # ── Resolved helpers ──────────────────────────────────────────────────────

    @property
    def chat_model_resolved(self) -> str:
        """Effective chat model: CHAT_MODEL → OLLAMA_MODEL → built-in default."""
        return self.chat_model or self.model or "llama3.2:3b"

    @property
    def embed_model_resolved(self) -> str:
        """Effective embed model: EMBED_MODEL → OLLAMA_EMBED_MODEL → built-in default."""
        return self.embed_model_override or self.embed_model or "nomic-embed-text"

    @property
    def chat_base_url_resolved(self) -> str:
        """
        Effective chat base URL.

        For Ollama: CHAT_BASE_URL override → legacy OLLAMA_BASE_URL (native base,
        not the /v1 shim — OllamaBackend constructs its own paths).
        For others: CHAT_BASE_URL override → provider default from PROVIDER_DEFAULTS.
        """
        if self.chat_base_url:
            return self.chat_base_url.rstrip("/")
        if self.chat_provider.lower() == "ollama":
            return self.base_url.rstrip("/")
        from job_sentinel.documents.providers import PROVIDER_DEFAULTS

        info = PROVIDER_DEFAULTS.get(self.chat_provider.lower())
        return info.base_url if info else ""

    @property
    def embed_base_url_resolved(self) -> str:
        """
        Effective embed base URL.

        Same logic as chat_base_url_resolved but for the embed backend.
        """
        if self.embed_base_url:
            return self.embed_base_url.rstrip("/")
        if self.embed_provider.lower() == "ollama":
            return self.base_url.rstrip("/")
        from job_sentinel.documents.providers import PROVIDER_DEFAULTS

        info = PROVIDER_DEFAULTS.get(self.embed_provider.lower())
        return info.base_url if info else ""


class JobSourceSettings(BaseSettings):
    """
    Pluggable job-source layer configuration.

    enabled_sources: comma-separated list of source IDs to activate.
    All secrets use repr=False so they never appear in logs or repr().
    """

    model_config = SettingsConfigDict(extra="ignore", env_file=_ENV_FILE, env_file_encoding="utf-8")

    # NoDecode so pydantic-settings doesn't try JSON-decode a CSV value first
    enabled_sources: Annotated[list[str], NoDecode] = Field(
        default=["remoteok", "themuse", "arbeitnow", "himalayas", "wellfound"],
        description="Comma-separated list of enabled job source IDs",
        validation_alias="JOB_SOURCES_ENABLED",
    )

    @field_validator("enabled_sources", mode="before")
    @classmethod
    def _parse_sources_csv(cls, v: object) -> list[str]:
        """Accept 'a,b,c' string OR a real list from the environment."""
        if v is None or v == "":
            return ["remoteok", "themuse", "arbeitnow", "himalayas", "wellfound"]
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        if isinstance(v, Iterable):
            return [str(item) for item in v]
        return ["remoteok", "themuse", "arbeitnow", "himalayas", "wellfound"]

    # ── Adzuna (free key — https://developer.adzuna.com) ─────────────────────
    adzuna_app_id: str = Field(
        default="",
        repr=False,
        validation_alias="ADZUNA_APP_ID",
        description="Adzuna application ID (never logged)",
    )
    adzuna_app_key: str = Field(
        default="",
        repr=False,
        validation_alias="ADZUNA_APP_KEY",
        description="Adzuna application key (never logged)",
    )
    adzuna_country: str = Field(
        default="us",
        validation_alias="ADZUNA_COUNTRY",
        description="Adzuna country code (default 'us')",
    )

    # ── USAJobs (free key — https://developer.usajobs.gov) ───────────────────
    usajobs_api_key: str = Field(
        default="",
        repr=False,
        validation_alias="USAJOBS_API_KEY",
        description="USAJobs authorization key (never logged)",
    )
    usajobs_email: str = Field(
        default="",
        validation_alias="USAJOBS_EMAIL",
        description="Email used as User-Agent for USAJobs API",
    )

    # ── The Muse (optional key raises rate limit) ─────────────────────────────
    themuse_api_key: str = Field(
        default="",
        repr=False,
        validation_alias="THEMUSE_API_KEY",
        description="The Muse API key (optional; raises rate limit)",
    )

    # ── Reserved for future Apify integration ────────────────────────────────
    apify_token: str = Field(
        default="",
        repr=False,
        validation_alias="APIFY_TOKEN",
        description="Apify API token (reserved for future use)",
    )

    # ── JobSpy scraper configuration ─────────────────────────────────────────
    jobspy_sites: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        # default sites: indeed, zip_recruiter, glassdoor, google (set via JOBSPY_SITES)
        description="Comma-separated list of sites for JobSpy",
        validation_alias="JOBSPY_SITES",
    )

    @field_validator("jobspy_sites", mode="before")
    @classmethod
    def _parse_jobspy_sites(cls, v: object) -> list[str]:
        if v is None or v == "":
            return []
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        if isinstance(v, Iterable):
            return [str(item) for item in v]
        return []

    jobspy_country: str = Field(
        default="USA",
        validation_alias="JOBSPY_COUNTRY",
        description="Country for JobSpy scraper (default 'USA')",
    )
    jobspy_proxies: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        description="Comma-separated proxy URLs for JobSpy",
        validation_alias="JOBSPY_PROXIES",
    )

    @field_validator("jobspy_proxies", mode="before")
    @classmethod
    def _parse_jobspy_proxies(cls, v: object) -> list[str]:
        if v is None or v == "":
            return []
        if isinstance(v, str):
            return [p.strip() for p in v.split(",") if p.strip()]
        if isinstance(v, Iterable):
            return [str(item) for item in v]
        return []


class DiscordSettings(BaseSettings):
    """Optional Discord webhook notifier (a third alert channel)."""

    model_config = SettingsConfigDict(
        env_prefix="DISCORD_", extra="ignore", env_file=_ENV_FILE, env_file_encoding="utf-8"
    )

    webhook_url: str = Field(
        default="",
        repr=False,
        description="Incoming Webhook URL from a Discord channel's Integration settings",
    )


class EmailSettings(BaseSettings):
    """Optional SMTP email notifier (a second alert channel alongside Telegram)."""

    model_config = SettingsConfigDict(
        env_prefix="EMAIL_", extra="ignore", env_file=_ENV_FILE, env_file_encoding="utf-8"
    )

    enabled: bool = Field(default=False, description="Turn the email channel on")
    smtp_host: str = Field(default="", description="SMTP server host")
    smtp_port: int = Field(default=587, description="SMTP port (587 STARTTLS, 465 SSL)")
    username: str = Field(default="", description="SMTP username")
    password: str = Field(default="", description="SMTP password / app password")
    sender: str = Field(default="", description="From address (defaults to username)")
    recipient: str = Field(default="", description="Where alerts are sent")
    use_tls: bool = Field(default=True, description="STARTTLS (True) vs implicit SSL (False)")

    @property
    def configured(self) -> bool:
        return self.enabled and bool(self.smtp_host and self.recipient)


class LogSettings(BaseSettings):
    """Logging configuration."""

    model_config = SettingsConfigDict(
        env_prefix="LOG_", extra="ignore", env_file=_ENV_FILE, env_file_encoding="utf-8"
    )

    level: str = Field(default="INFO", description="Log level: DEBUG|INFO|WARNING|ERROR")
    dir: Path = Field(default=_REPO_ROOT / "logs", description="Rotating log file directory")
    # validation_alias keeps the env var LOG_JSON while avoiding the field name
    # "json", which would shadow pydantic's deprecated BaseModel.json().
    json_logs: bool = Field(
        default=False,
        validation_alias="LOG_JSON",
        description="Emit structured JSON logs?",
    )

    @field_validator("level")
    @classmethod
    def normalise_level(cls, v: str) -> str:
        return v.upper()


# ─────────────────────────────────────────────────────────────────────────────
# Root settings (composes all sub-settings)
# ─────────────────────────────────────────────────────────────────────────────


class Settings(BaseSettings):
    """
    Root application settings.

    Loaded from (in priority order):
      1. Real environment variables
      2. ``.env`` file in the repo root
      3. Defaults defined in the field annotations
    """

    model_config = SettingsConfigDict(
        env_file=str(_REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        env_nested_delimiter="__",  # TELEGRAM__BOT_TOKEN also works
        extra="ignore",
        case_sensitive=False,
    )

    # ── Subsystems ────────────────────────────────────────────────────────
    telegram: TelegramSettings = Field(default_factory=TelegramSettings)
    portal: PortalSettings = Field(default_factory=PortalSettings)
    scraper: ScraperSettings = Field(default_factory=ScraperSettings)
    filters: FilterSettings = Field(default_factory=FilterSettings)
    email: EmailSettings = Field(default_factory=EmailSettings)
    discord: DiscordSettings = Field(default_factory=DiscordSettings)
    logging: LogSettings = Field(default_factory=LogSettings)
    job_sources: JobSourceSettings = Field(default_factory=JobSourceSettings)

    # ── Top-level ─────────────────────────────────────────────────────────
    site_adapter: str = Field(
        default="12twenty",
        description="Adapter ID to use (see src/job_sentinel/adapters/sites/)",
    )
    custom_adapter_path: Path | None = Field(
        default=None,
        description="Optional path to an out-of-tree adapter file to import at startup",
    )
    db_path: Path = Field(
        default=_REPO_ROOT / "data" / "jobs.db",
        description="SQLite database file path",
    )
    mcp_jobs_root: Path = Field(
        default=_REPO_ROOT.parent / "mcp-jobs",
        description="Local mcp-jobs clone used by Search/Collect (not vendored into Job Hub)",
    )
    mcp_jobs_node: str = Field(
        default="node",
        description="Node executable used to run the mcp-jobs collect CLI",
    )
    mcp_jobs_timeout_seconds: int = Field(
        default=1200,
        ge=30,
        description="Seconds to wait for one mcp-jobs collection run",
    )
    mcp_jobs_page_from: int = Field(default=1, ge=1, description="mcp-jobs start page")
    mcp_jobs_page_to: int = Field(
        default=1,
        ge=1,
        description="Unused when page range is derived from max results",
    )
    mcp_jobs_max_jobs: int = Field(
        default=100,
        ge=1,
        le=200,
        description="Default max unique jobs requested from mcp-jobs per run",
    )
    session_path: Path = Field(
        default=_REPO_ROOT / "data" / "session.json",
        description="Saved Playwright storage state (cookies) from `job-sentinel login`",
    )
    dry_run: bool = Field(
        default=False,
        description="Scrape but do not send Telegram messages",
    )
    deadline_alert_days: int = Field(
        default=5, ge=1, description="Flag postings whose deadline is within this many days"
    )
    env: str = Field(default="development", description="development | staging | production")

    @model_validator(mode="after")
    def ensure_dirs(self) -> Settings:
        """Create data and log directories if they don't exist yet."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.logging.dir.mkdir(parents=True, exist_ok=True)
        return self

    @property
    def is_production(self) -> bool:
        return self.env == "production"


# ─────────────────────────────────────────────────────────────────────────────
# Cached singleton accessor
# ─────────────────────────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return the global :class:`Settings` instance.

    Cached after first call — always returns the same object.
    For tests, call ``get_settings.cache_clear()`` before monkeypatching env vars.
    """
    return Settings()
