# Low-Level Design (LLD) — Job Sentinel

**Version:** 2.0
**Last updated:** 2026

This document drops a level below the [HLD](HLD.md): module-by-module
responsibilities, the key data structures, the exact control flow of a scrape
cycle, and the contracts each component promises to its callers.

Job Hub tracking, schema, and stages follow `docs/PRD.md` (PRD02). Ignore Job Sentinel `ApplicationStage` values such as `saved` / `rejected` / `archived` when they conflict with the sealed model.

---

## 1. Module map

```
src/job_sentinel/
├── core/
│   ├── models.py        # JobPosting, ScrapeResult, ApplicationStatus,
│   │                    # Application, ApplicationStage, GeneratedDocument,
│   │                    # DocumentKind
│   ├── browser.py       # browser_context() — Playwright lifecycle
│   ├── scheduler.py     # Scheduler — the poll loop + cycle orchestration
│   ├── session.py       # check_session(), interactive_login()
│   ├── deadlines.py     # deadline-proximity helpers
│   └── text.py          # strip_html() — shared HTML cleaner
├── adapters/
│   ├── base.py          # SiteAdapter ABC + scrape() orchestrator
│   ├── registry.py      # register_adapter / get_adapter / list_adapters
│   └── sites/*.py       # one file per portal (12twenty, handshake)
├── config/
│   ├── settings.py      # Settings tree (pydantic-settings); LLMSettings
│   │                    # with CHAT_*/EMBED_* + backward-compat OLLAMA_*
│   └── logging.py       # configure_logging()
├── db/
│   └── repository.py    # JobRepository — sqlite-utils wrapper; schema v2
├── documents/
│   ├── providers.py     # ChatBackend / EmbedBackend protocols;
│   │                    # OllamaBackend, OpenAICompatClient;
│   │                    # build_chat_backend, build_embed_backend factories
│   ├── match.py         # MatchResult, match_profile_to_job()
│   ├── tailor.py        # KeywordTailor, LLMTailor (Tailor protocol)
│   ├── llm.py           # OllamaClient (legacy; still used by CLI path)
│   ├── embeddings.py    # OllamaEmbedder, cosine_similarity
│   ├── semantic.py      # SemanticTailor
│   ├── latex.py         # LaTeX template rendering
│   ├── renderer.py      # build_resume_pdf / build_cover_letter_pdf
│   ├── coverletter.py   # cover_letter_paragraphs()
│   └── resume_import.py # extract_pdf_text / parse_resume_text
├── sources/
│   ├── base.py          # JobSource ABC, JobQuery, SourceError
│   ├── registry.py      # all_sources_status, build_enabled_sources
│   ├── search.py        # aggregate_search → SearchResponse
│   ├── company_boards.py# fetch_company_board (Greenhouse/Lever/Ashby)
│   ├── remoteok.py      # RemoteOK (no key, default enabled)
│   ├── themuse.py       # The Muse (no key required, optional key)
│   ├── arbeitnow.py     # Arbeitnow (no key, default enabled)
│   ├── himalayas.py     # Himalayas (no key, default enabled)
│   ├── adzuna.py        # Adzuna (keyed)
│   ├── usajobs.py       # USAJobs (keyed)
│   └── jobspy_source.py # JobSpy scraper (opt-in)
├── notifiers/
│   └── telegram.py      # TelegramNotifier + MarkdownV2 formatters
│   └── email.py         # EmailNotifier (optional SMTP)
├── profile/
│   ├── models.py        # Profile and section models
│   └── store.py         # load_profile / save_profile (YAML)
├── api/
│   ├── app.py           # FastAPI: all routes + create_app factory
│   ├── ops.py           # OpsRunner (login/scrape/watcher state)
│   ├── chat.py          # Sentinel assistant endpoint
│   └── auth.py          # UserStore, TokenIssuer, AuthError
├── bot/
│   └── handlers.py      # python-telegram-bot command handlers
└── __main__.py          # Typer CLI
```

Dependency direction is strictly inward: `bot`, `notifiers`, `adapters`, and
`sources` depend on `core` and `config`, never the reverse. `documents/`
depends on `core`, `config`, and `profile`, but nothing in `core` imports
from `documents` or `sources`. The registry is the only seam where adapters
are resolved by string ID.

---

## 2. Key data structures

### `JobPosting` (`core/models.py`)

The single record type that flows scraper → repository → notifier → bot, and
is also returned by job sources (ephemeral, not necessarily persisted).

| Field | Type | Notes |
|---|---|---|
| `posting_id` | `str` | Primary key. Portal-assigned (or `<SOURCE_ID>:<native_id>` from sources). |
| `title` … `deadline` | `str` | Whitespace-stripped on construction. |
| `description_snippet` | `str` | Truncated to 350 chars + ellipsis; HTML-stripped by `strip_html`. |
| `status` | `ApplicationStatus` | Enum, stored as its `.value` string. |
| `discovered_at` / `updated_at` | `datetime` | Always tz-aware UTC. |
| `keywords_matched` | `list[str]` | Populated by `matches_keywords()`. |
| `source_adapter` | `str` | Adapter slug or source ID. |
| `raw_data` | `dict` | Adapter/source escape hatch; JSON-serialised in SQLite. |

### `Application` (`core/models.py`)

Tracks a single job application through its lifecycle.

| Field | Type | Notes |
|---|---|---|
| `id` | `str` | UUID hex primary key (auto-generated). |
| `title` / `employer` / `location` / `url` | `str` | Copied from posting or supplied manually. |
| `source` | `str` | e.g. `"remoteok"`, `"manual"`. |
| `stage` | `ApplicationStage` | `saved\|applied\|phone_screen\|interviewing\|offer\|rejected\|archived` |
| `salary` / `applied_date` / `deadline` / `notes` | `str` | User-supplied; optional. |
| `posting_id` | `str \| None` | FK to `job_postings` if sourced from a tracked posting. |
| `resume_document_id` | `str \| None` | FK to `generated_documents`. |
| `created_at` / `updated_at` | `str` | ISO-8601 UTC. |

### `GeneratedDocument` (`core/models.py`)

Records a rendered résumé or cover letter PDF.

| Field | Type | Notes |
|---|---|---|
| `id` | `str` | UUID hex primary key. |
| `kind` | `DocumentKind` | `resume \| cover_letter` |
| `file_path` | `str` | Absolute path to the PDF on disk. |
| `tex_path` | `str \| None` | Corresponding `.tex` source, if kept. |
| `ats_score` | `float \| None` | ATS keyword-coverage score at build time. |
| `provider` | `str` | e.g. `"deterministic"`, `"ollama/llama3.2:3b"`, `"groq/llama3-70b-8192"`. |
| `tailored` | `bool` | Whether an LLM was used to rephrase bullets. |
| `job_snippet` | `str` | First 300 chars of the job description used (for provenance). |

Invariants:

- `posting_id` is unique per `(source_adapter)` and is the upsert key.
- Timestamps are **always** UTC — never naive. `_parse_dt()` in the repository
  falls back to `now(utc)` on a malformed string rather than raising.
- The model is mutable only through `touch()` and the keyword side-effect, both
  of which use `object.__setattr__` so the rest of the object stays effectively
  read-only.

### `ApplicationStatus` state machine

```
        ┌─────┐  alert sent   ┌──────┐  /applied   ┌─────────┐
        │ NEW │ ────────────▶ │ SEEN │ ──────────▶ │ APPLIED │
        └──┬──┘               └──┬───┘             └─────────┘
           │                     │  /ignore
           │                     ▼
           │                 ┌─────────┐
           │                 │ IGNORED │
           │                 └─────────┘
           │  removed from portal (any open state)
           ▼
        ┌────────┐
        │ CLOSED │
        └────────┘
```

`APPLIED` and `IGNORED` are **terminal from the scraper's point of view**: a
re-scrape never overwrites them (see §4, `save_job`). Only a human command can
move a posting into those states.

---

## 3. Component contracts

### `JobSource` and `aggregate_search` (`sources/`)

```python
class JobSource(ABC):
    SOURCE_ID: str          # unique slug, e.g. "remoteok"
    LABEL: str              # human-readable name
    requires_key: bool      # True → needs an API key to function
    is_scraper: bool        # True → uses HTML scraping, not a JSON API
    default_enabled: bool   # True → included in default enabled_sources list

    def configured(self) -> bool        # key present (always True for no-key sources)
    def search(self, query: JobQuery) -> list[JobPosting]   # must not raise
    def health_check(self) -> bool      # optional liveness probe
```

`JobQuery` is a Pydantic model with fields `keywords`, `location`, `remote`,
`job_type`, `salary_min`, `date_posted_days`, `radius_km`, `seniority`,
`company`, `limit`. Sources use what they support and silently ignore the rest.

`aggregate_search(query, sources)` fans out to every source, wraps each call
in a try/except, and returns `SearchResponse(results, errors, counts)`.
Per-source errors are captured in `list[SourceError]` so a single failing
source never aborts the others.

Source results carry `posting_id = "<SOURCE_ID>:<native_id>"` so IDs are
globally unique. Results are ephemeral — they are not written to the database.
A user "tracks" a result by creating an `Application` from it.

### `ChatBackend` and `EmbedBackend` (`documents/providers.py`)

```python
class ChatBackend(Protocol):
    @property
    def model(self) -> str: ...
    def available(self) -> bool: ...  # network check; never raises
    def ready(self) -> bool: ...  # available + model pulled (Ollama) / reachable (cloud)
    def chat(self, system: str, messages: list[dict]) -> str: ...
    def chat_json(self, system: str, user: str) -> dict: ...


class EmbedBackend(Protocol):
    @property
    def model(self) -> str: ...
    def available(self) -> bool: ...
    def ready(self) -> bool: ...
    def embed(self, texts: list[str]) -> list[list[float]] | None: ...
```

Two implementations satisfy both protocols:

- `OllamaBackend` — uses native Ollama APIs (`/api/chat` with `think:false`,
  `/api/embed`). Preserves every pre-existing Ollama behaviour.
- `OpenAICompatClient` — uses `/chat/completions` and `/embeddings`. A single
  implementation covers OpenAI, OpenRouter, Groq, Gemini, and any custom
  endpoint.

Factories read `LLMSettings` (which resolves env-var precedence
`CHAT_PROVIDER` → `OLLAMA_*` → built-in defaults) and return the right backend:

```python
backend: ChatBackend = build_chat_backend(LLMSettings())
embedder: EmbedBackend = build_embed_backend(LLMSettings())
```

API keys are never logged; `available()` / `ready()` return `False` on any
network error rather than raising.

### `match_profile_to_job` (`documents/match.py`)

```python
def match_profile_to_job(
    profile: Profile,
    job_description: str,
    *,
    use_ai: bool = True,
) -> MatchResult: ...
```

`MatchResult` fields:

| Field | Type | Notes |
|---|---|---|
| `score` | `float` | Blended 0..1 fit score |
| `coverage` | `float` | ATS keyword coverage, 0..1 |
| `semantic` | `float \| None` | Embedding cosine similarity, 0..1; `None` when embedder unavailable |
| `matched_keywords` | `list[str]` | Keywords present in both profile and JD |
| `missing_keywords` | `list[str]` | Keywords in JD absent from profile |
| `verdict` | `str` | `"strong"` (≥0.70) / `"moderate"` (≥0.45) / `"weak"` |
| `rationale` | `str` | 2-3 sentence summary; LLM-grounded or deterministic fallback |
| `strengths` / `gaps` | `list[str]` | Bulleted highlights |

Blend formula: `score = 0.5×coverage + 0.5×semantic` when the embedder is
available; `score = coverage` otherwise. The function always returns a valid
result regardless of backend availability.

### `SiteAdapter` (`adapters/base.py`)

```python
class SiteAdapter(ABC):
    ADAPTER_ID: str            # unique slug, e.g. "12twenty"
    def login(page) -> None    # leave `page` authenticated on the listings view
    def scrape_page(page) -> list[JobPosting]
    def next_page(page) -> bool   # default False (single-page portals)
    def scrape(context) -> list[JobPosting]   # provided; orchestrates the above
```

Contract notes:

- `scrape()` is the only public entry point the scheduler calls. Subclasses
  override the three hooks, not `scrape()` itself.
- `scrape()` swallows `PlaywrightTimeoutError` per-page and any exception during
  login — a flaky portal must never crash the scheduler thread. It returns
  whatever it managed to collect.
- `safe_text` / `safe_attr` never raise; they return `""` on any failure so card
  parsing degrades gracefully when one field is missing.
- Pagination is bounded by `ScraperSettings.max_pages` to prevent an infinite
  "Next" loop on a broken selector.

### `JobRepository` (`db/repository.py`)

Schema version: `SCHEMA_VERSION = 2`. Migration is handled by `_migrate()` which
calls the relevant `_ensure_*` helpers idempotently.

**`job_postings` table** (schema v1, unchanged):

| Method | Contract |
|---|---|
| `save_job(job)` | Upsert. Returns `True` **iff** the row was new. Preserves a human-set status. |
| `update_status(id, status)` | Returns `False` if the id is unknown (no-op). |
| `get_new_jobs()` / `get_by_status(s)` | Newest-first, never `None` (empty list). |
| `get_stats()` | Always returns every status key (zero-filled) plus `total`. |

**`applications` table** (schema v2):

| Method | Contract |
|---|---|
| `create_application(app)` | Insert. Returns the saved `Application`. |
| `get_application(id)` | Returns `Application \| None`. |
| `list_applications(stage, limit)` | Newest-first; `stage=None` returns all. |
| `update_application(id, **fields)` | Partial update; returns `False` if not found. |
| `delete_application(id)` | Returns `False` if not found. |
| `application_stats()` | Count per stage + `total`. |

**`generated_documents` table** (schema v2):

| Method | Contract |
|---|---|
| `create_document(doc)` | Insert. |
| `get_document(id)` | Returns `GeneratedDocument \| None`. |
| `list_documents(kind, limit)` | Newest-first; `kind=None` returns all. |
| `delete_document(id)` | Removes the DB row; caller handles file deletion. |

Concurrency: SQLite is opened in WAL mode so the bot thread can read while the
scheduler thread writes. There is a single writer (the scheduler's one-worker
thread pool), so no write-write contention is possible by construction.

### `TelegramNotifier` (`notifiers/telegram.py`)

- `_send()` is wrapped in `tenacity` (3 attempts, exponential backoff) and
  **never propagates** — a delivery failure returns `False` and is logged.
- All user-facing text passes through `escape()` before hitting the MarkdownV2
  parser. Forgetting to escape is the single most common Telegram bug, so the
  formatters own escaping rather than the callers.

---

## 4. Scrape-cycle control flow

`Scheduler._scrape_cycle()` is the heart of the system. One cycle:

```
1. resolve adapter      get_adapter(settings.site_adapter, settings.scraper)
2. open browser         with browser_context(scraper) as ctx:
3. scrape                   all_jobs = adapter.scrape(ctx)
4. filter               filtered = [j for j in all_jobs if j.matches_keywords(...)]
5. diff + persist       for j in filtered: is_new = repo.save_job(j)
                            if is_new -> new_jobs.append(j)
6. detect closed        repo: open postings no longer present -> CLOSED
7. notify               if new_jobs and not dry_run: on_new_jobs(new_jobs)
8. record               ScrapeResult(total, new, updated, closed, duration)
```

Failure containment: steps 2–7 run inside one `try/except` that records the
error string on the `ScrapeResult` and logs the traceback. The `finally` block
always stamps `duration_seconds` and logs the result, so every cycle produces
exactly one summary log line whether it succeeded or failed.

`save_job` upsert logic (step 5), in detail:

```
existing = get_job(job.posting_id)
is_new   = existing is None
if existing and existing.status in (APPLIED, IGNORED, CLOSED):
    # human decision wins — keep the stored status
    job = job.model_copy(update={"status": existing.status})
upsert(row)
return is_new
```

This is why a posting you marked `/applied` never re-alerts and never reverts to
`NEW`, even though the scraper keeps seeing it every cycle.

---

## 5. Threading & lifecycle

```
main thread                         scheduler worker thread (1)
───────────                         ───────────────────────────
Application.run_polling()  (asyncio)  BackgroundScheduler interval job
  ├─ command handlers                   └─ _scrape_cycle()
  └─ reads via JobRepository ──┐            ├─ Playwright (blocking)
                               │            └─ writes via JobRepository
                               └──── shared SQLite (WAL) ────┘
```

- The Telegram `Application` owns the main asyncio loop.
- APScheduler runs the blocking Playwright work on a **single** worker thread
  (`max_instances=1`, `coalesce=True`) so two cycles can never overlap and a
  backlog of missed fires collapses into one catch-up run after the PC wakes.
- `/jobs` calls `scheduler.trigger_now()`, which runs a cycle **synchronously on
  the calling coroutine's thread**. This is intentional for an on-demand refresh;
  the handler warns the user it takes 30–60s first.

---

## 6. Error handling matrix

| Layer | Failure | Handling |
|---|---|---|
| Adapter | Selector missing / timeout | `safe_*` returns `""`; page timeout breaks the pagination loop |
| Adapter | Login fails | Exception caught in `scrape()`, logged, empty list returned |
| Scheduler | Any cycle exception | Recorded on `ScrapeResult.errors`, logged, cycle still reports |
| Repository | Unknown id on update | Returns `False`, warns, no raise |
| Notifier | Telegram 4xx/5xx/network | tenacity retries, then logged `False` |
| Browser | Launch/close error | `finally` block guards teardown, warns on close failure |

The design rule: **the poll loop is the last line of defence and must survive
anything.** Everything below it fails soft.

---

## 7. Extension points

- **New portal** → new file in `adapters/sites/`, add to `_BUILTIN_ADAPTERS`.
  See [adapter-authoring.md](adapter-authoring.md).
- **Custom out-of-tree adapter** → set `CUSTOM_ADAPTER_PATH` in `.env`; the
  registry imports it at startup and the file self-registers.
- **New job source** → subclass `JobSource` in `sources/<name>.py`; implement
  `search(query)`, set `SOURCE_ID` / `LABEL` / `requires_key`; add to
  `_BUILTIN_SOURCES` in `sources/registry.py`.
- **New LLM provider** → if it exposes `/chat/completions` + `/embeddings`,
  `OpenAICompatClient` already handles it — just add a `ProviderInfo` entry to
  `PROVIDER_DEFAULTS` in `documents/providers.py`.
- **New notifier** (Discord, email) → mirror `TelegramNotifier`'s
  `send_new_jobs(list[JobPosting])` shape and wire it into the scheduler
  callback in `__main__.py`.
- **New filter strategy** → extend `FilterSettings` and the `matches_keywords`
  call site in the cycle; the model already carries `keywords_matched`.

---

## 8. API route inventory (`api/app.py`)

Full list of routes exposed by the FastAPI layer. All bind to localhost; CORS is
restricted to local origins.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/api/profile` | Full universal profile |
| PUT | `/api/profile` | Replace profile (validated) |
| POST | `/api/profile/import-resume` | Upload PDF → profile draft |
| GET | `/api/profile/summary` | Section counts |
| GET | `/api/jobs` | Recent tracked postings |
| POST | `/api/jobs/{id}/status` | Update posting status |
| GET | `/api/stats` | Job counts by status |
| GET | `/api/applications/stats` | Application counts by stage |
| GET | `/api/applications` | List applications (filterable by stage) |
| POST | `/api/applications` | Create application (from posting_id or manual) |
| GET | `/api/applications/{id}` | Get one application |
| PATCH | `/api/applications/{id}` | Partial update (stage, notes, etc.) |
| DELETE | `/api/applications/{id}` | Delete application |
| GET | `/api/documents` | List generated documents (filterable by kind) |
| GET | `/api/documents/{id}/file` | Download PDF |
| DELETE | `/api/documents/{id}` | Delete document + file |
| GET | `/api/ops/status` | Session/login/scrape/watcher snapshot |
| POST | `/api/ops/login` | Start interactive portal login |
| POST | `/api/ops/session/check` | Headless session validity probe |
| POST | `/api/ops/scrape` | One scrape cycle (background) |
| POST | `/api/ops/watcher/start` | Start recurring watcher |
| POST | `/api/ops/watcher/stop` | Stop watcher |
| GET | `/api/llm/status` | LLM provider health (chat + embed) |
| GET | `/api/llm/config` | Current LLM config (keys masked) |
| PUT | `/api/llm/config` | Persist provider settings to .env |
| POST | `/api/llm/test` | Live test chat or embed backend |
| POST | `/api/match` | AI profile↔job match (`MatchResult`) |
| POST | `/api/resume/tailor` | ATS keyword tailor (no PDF) |
| POST | `/api/resume/build` | Render tailored résumé PDF |
| POST | `/api/resume/cover` | Render cover letter PDF |
| POST | `/api/chat` | Sentinel assistant |
| GET | `/api/sources` | All source status |
| PUT | `/api/sources/config` | Persist enabled sources + API keys |
| POST | `/api/sources/search` | Aggregate job search |
| POST | `/api/sources/company` | Fetch company ATS board |
| GET | `/api/auth/status` | Auth mode + current user |
| POST | `/api/auth/login` | Login → HMAC token |
| POST | `/api/auth/users` | Create account (admin only) |
