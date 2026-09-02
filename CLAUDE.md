# CLAUDE.md — Job Sentinel

Local-first career platform: Playwright portal scraping + pluggable public job-source APIs +
multi-provider LLM layer + AI profile↔job match + application tracker + document library +
Typer CLI + FastAPI local API + Next.js web UI + Telegram/email alerts + LaTeX résumé engine.
Python 3.11+, src layout, SQLite via sqlite-utils. **Read AGENTS.md first** — it is the
authorship/quality contract (owner-authored commits, NO AI co-author trailers or notices).

## Commands (Windows; venv already exists)

```powershell
.venv\Scripts\python.exe -m job_sentinel <cmd>     # CLI entry (= job-sentinel)
.venv\Scripts\python.exe -m pytest tests/unit tests/integration   # coverage gate 70%
.venv\Scripts\python.exe -m ruff check . ; .venv\Scripts\python.exe -m ruff format --check .
.venv\Scripts\python.exe -m mypy src/              # strict mode
cd web; npm run dev | build | typecheck            # no eslint configured
```

CLI commands: `run` (scheduler+bot), `scrape` (one cycle, default --dry-run), `login`
(manual portal login → data/session.json), `session` (headless validity check), `serve`
(FastAPI), `web` (API + Next.js together), `adapters`, `db stats|list`,
`ingest <path>`, `collect` (mcp-jobs → jobs_raw → jobs),
`archive` (idle Job `archived_at`; `--force` / `--dry-run`),
`resume init|import <pdf>|show|build|cover|doctor`,
`apps list|add|stage|note|rm`, `docs list|rm`,
`sources list|search|company`, `users add|list|remove`.

## Layout

```
src/job_sentinel/
  __main__.py      Typer CLI (all commands above; lazy imports inside commands)
  adapters/        base.py (SiteAdapter ABC) + registry.py (plugin registry,
                   CUSTOM_ADAPTER_PATH loads external adapters); sites/twelve_twenty.py,
                   sites/handshake.py
  api/             FastAPI: app.py (routes), ops.py (login/scrape/watcher/session ops),
                   chat.py (grounded local-LLM chat), auth.py (optional auth layer)
  bot/handlers.py  python-telegram-bot v21 commands (/jobs /applied /stats /deadlines)
  config/          settings.py (pydantic-settings, .env — CHAT_*/EMBED_* + legacy OLLAMA_*),
                   logging.py (loguru)
  core/            browser.py (Playwright), scheduler.py (APScheduler), models.py
                   (JobPosting, Application, GeneratedDocument, ApplicationStage,
                   DocumentKind…), deadlines.py, session.py (storage-state checks),
                   text.py (strip_html cleaner — shared by sources + résumé engine)
  db/repository.py sqlite-utils wrapper; schema v2 with job_postings + applications +
                   generated_documents tables; (only module allowed untyped calls)
  documents/       latex.py + renderer.py (LaTeX→PDF), tailor.py, llm.py (Ollama),
                   coverletter.py, embeddings.py/semantic.py, resume_import.py (PDF→profile),
                   providers.py (ChatBackend/EmbedBackend protocols + OllamaBackend +
                   OpenAICompatClient + build_chat_backend/build_embed_backend factories),
                   match.py (MatchResult, match_profile_to_job — ATS + semantic + LLM blend)
  notifiers/       telegram.py (httpx), email.py (optional SMTP)
  profile/         models.py + store.py (data/profile.yaml universal profile)
  sources/         base.py (JobSource ABC, JobQuery, SourceError), registry.py + search.py
                   (aggregate_search, build_enabled_sources); no-key sources: remoteok.py,
                   themuse.py, arbeitnow.py, himalayas.py; keyed: adzuna.py, usajobs.py;
                   scraper: jobspy_source.py; company_boards.py (Greenhouse/Lever/Ashby)
web/               Next.js 15 / React 19 / Tailwind 3.
                   app/page.tsx (landing), app/{dashboard,search,applications,resumes,
                   settings,jobs,profile,profile/edit,studio,chat,login}/page.tsx;
                   components/ (Nav, AiMatch, DataTable, SearchResultCard, JobsExplorer,
                   ResumePaper, CommandPalette, ScraperControls, JobActions…);
                   lib/api.ts (typed client for ALL API routes — keep in sync);
                   lib/demo.ts (NEXT_PUBLIC_DEMO=1 — every screen alive with sample data)
tests/             unit/ mirrors src tree; integration/test_scheduler_cycle.py; e2e/ empty
docs/              design/{HLD,LLD,adapter-authoring,web-ui}.md, adr/, NORTH_STAR.md, RELEASING.md
scripts/           check_licenses.py (CI); diagnose_*.py are untracked one-off debug scripts
```

## 12twenty scraping (verified 2026-06-12 — do not rediscover)

- **Never put `viewId=<n>` in PORTAL_JOBS_URL** — saved-search views return "not
  authorized" → empty list (caused the "done 0" bug). Use
  `https://utdallas.12twenty.com/jobPostings#/jobPostings/index?tab=studentEmployment`.
- Adapter captures the portal's internal JSON API: list via
  `POST /Api/V2/job-postings/post-query` (Playwright response listener); full detail
  (description/salary/contact) via `GET /Api/V2/job-postings/{id}`; session validity via
  `GET /api/v2/account/current-user`.
- Authenticated app-shell selector: `#side-nav a.side-nav-link, a.logout`. Job rows
  `tr.job-posting` can be `ng-hide` — visibility waits hang; rely on API capture.
- Login is Cloudflare Turnstile-gated → headless login impossible. `job-sentinel login`
  opens a headed browser (credentials prefilled from .env) and saves data/session.json.

## Conventions (enforced)

- `mypy --strict`; `from __future__ import annotations` everywhere; type-only imports
  under `TYPE_CHECKING`. Ruff: line-length 100, select includes S (bandit), PTH, SIM, N.
- **UI/CLI parity rule**: every CLI feature needs an API route in `api/app.py` AND a web
  surface; `web/lib/api.ts` is the single typed client. API routes today:
  - `profile` CRUD + import-resume, `profile/summary`
  - `jobs` + `jobs/{id}/status`, `stats`
  - `collect/sources` (GET), `collect/jobs` (POST — mcp-jobs → ingest)
  - `company-sources` (GET/POST list, PATCH `/{id}` — companies + verticals; `kind` query)
  - `vertical-channels` (alias onto the same `source_registry` rows)
  - `notebook/pages` (GET/POST list, GET/PATCH/DELETE `/{id}` — free-writing pages)
  - `ingest/jobs` (POST)
  - `ops/{status,login,session/check,scrape,watcher/start,watcher/stop}`
  - `llm/status`, `llm/config` (GET/PUT), `llm/test`
  - `match` (POST — ATS + semantic + LLM blend)
  - `resume/{tailor,build,cover}`, `chat`
  - `applications` (CRUD: GET/POST list, GET/PATCH/DELETE `/{id}`, GET `/stats`, GET `/analytics`, GET `/export?fmt=csv|json`)
  - `documents` (GET list, GET `/{id}/file`, DELETE `/{id}`)
  - `sources` (GET status), `sources/config` (PUT), `sources/search` (POST), `sources/company` (POST)
  - `interview/questions` (POST — local-LLM mock questions, deterministic fallback)
  - `auth/{status,login,users}`, `health`
- Adapters are plugins: subclass `SiteAdapter` in `adapters/sites/`, register in registry;
  external adapters load via `CUSTOM_ADAPTER_PATH`. ~50 lines per portal (see
  docs/design/adapter-authoring.md).
- Conventional Commits (pre-commit enforces); no direct commits to main; CHANGELOG.md +
  docs/RELEASING.md for releases. Optional backends (Ollama, LaTeX, email) must degrade
  gracefully. New heavy deps need an ADR in docs/adr/.
- North star (owner): one-stop open-source job platform for students, zero-cost hosting
  only, UI/CLI feature parity, highest code quality. See docs/NORTH_STAR.md.

## Gotchas

- pytest addopts always runs coverage (html → htmlcov/) with `--cov-fail-under=70`; for a
  single test use `-p no:cacheprovider --no-cov` or expect the gate to fail.
- Windows: CLI reconfigures stdout/stderr to UTF-8 (cp1252 breaks ✓/emoji output).
- `.env` holds real credentials — never read or print it; use .env.example as reference.
- data/, logs/, htmlcov/ contain runtime artifacts; gitignored — don't read them for context.
