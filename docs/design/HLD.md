# High-Level Design (HLD) — Job Sentinel

**Version:** 2.0  
**Author:** Harshit Wandhare  
**Last updated:** 2026

Job Hub product law lives in `docs/PRD.md` (PRD02 sealed 2026-09-01). This HLD is the upstream Job Sentinel design reference. Where it mentions Job-level saved/applied/closed or Rejected, follow the PRD: Job engagement is `null | reference | under_study | to_do`; Applied…Closed live on Application; Archive is `jobs.archived_at`; there is no Rejected.

---

## 1. Purpose

Job Sentinel is a local-first career platform that monitors university job
portals, aggregates listings from public job APIs, tracks the full application
lifecycle, and generates tailored ATS résumés and cover letters — all on the
user's own machine. The original design (portal scraping → Telegram alerts) is
preserved and extended; new surfaces (web UI, job-source search, application
tracker, AI match) are additive layers over the same core.

It is designed to run indefinitely on a personal Windows PC / WSL2 without
cloud infrastructure.

---

## 2. Goals & Non-Goals

### Goals
- Real-time (≤15 min latency) alerts for new job postings from university portals
- Site-agnostic portal scraping — adding a portal requires no core changes
- Pluggable job-source layer — aggregate results from public APIs without a browser
- AI profile↔job match — blended keyword + semantic + optional LLM rationale
- Multi-provider LLM abstraction — Ollama local or any OpenAI-compatible cloud provider
- Application lifecycle tracking (saved → interviewing → offer/rejected)
- Generated-document library with ATS scores
- Full CLI/API/Web parity — every feature reachable three ways
- Zero cloud dependencies for the default path (PC / WSL2, Ollama)
- Open-source, portfolio-quality codebase

### Non-Goals
- Auto-submission of applications (legal/ToS risk)
- Multi-user SaaS hosting (single-user local deployment is the target)

---

## 3. System Components

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Job Sentinel Process                            │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Main Thread — asyncio event loop (bot mode)                          │  │
│  │     python-telegram-bot run_polling()                                 │  │
│  │     Handles: /jobs /recent /applied /ignore /status /stats /deadlines │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Background Thread — APScheduler (1 worker, max_instances=1)          │  │
│  │     Scheduler._scrape_cycle()                                         │  │
│  │       ├─ SiteAdapter (Playwright/Chromium) → list[JobPosting]         │  │
│  │       ├─ JobRepository.save_job() + closed detection                  │  │
│  │       └─ TelegramNotifier + EmailNotifier (on new jobs)               │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  FastAPI (job-sentinel serve / web) — localhost only                  │  │
│  │     Profile CRUD · Jobs · Match · Applications · Documents            │  │
│  │     Sources (search/company/config) · LLM config/test · Ops/auth      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Job Source Layer (sources/) — HTTP/JSON, no browser                  │  │
│  │     No-key: RemoteOK · The Muse · Arbeitnow · Himalayas               │  │
│  │     Keyed:  Adzuna · USAJobs                                          │  │
│  │     Scraper: JobSpy (opt-in)                                          │  │
│  │     Company boards: Greenhouse · Lever · Ashby                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  LLM Provider Layer (documents/providers.py)                          │  │
│  │     ChatBackend / EmbedBackend protocols                              │  │
│  │     OllamaBackend  (native /api/chat, think:false)                    │  │
│  │     OpenAICompatClient (OpenAI · OpenRouter · Groq · Gemini · custom) │  │
│  │     Factories: build_chat_backend / build_embed_backend               │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
         │                                   │
         ▼                                   ▼
  SQLite jobs.db                      External services
  (job_postings, applications,        Telegram Bot API
   generated_documents)               Optional: cloud LLM APIs
```

---

## 4. Data Flows

### 4a. Portal scrape → alert

```
Portal Website
     │  HTTP (Playwright/Chromium)
     ▼
SiteAdapter.scrape()  →  list[JobPosting]
     │
Scheduler._scrape_cycle()
     ├── keyword filter
     ├── JobRepository.save_job()  (is_new? → new_jobs list)
     ├── closed detection  (mark missing postings CLOSED)
     └── TelegramNotifier + EmailNotifier (on new_jobs, unless dry_run)
```

### 4b. Public API job search (sources layer)

```
User (CLI / Web UI)
     │  keywords, location, filters
     ▼
aggregate_search(query, sources)
     │  fan-out, concurrent per-source search()
     ▼
list[JobPosting] + list[SourceError]  (ephemeral — not written to DB)
```

### 4c. AI profile↔job match

```
Profile (profile.yaml)  +  Job description (text or posting_id)
     │
match_profile_to_job()
     ├── 1. KeywordTailor → coverage score + matched/missing keywords
     ├── 2. EmbedBackend  → cosine similarity (skipped if unavailable)
     ├── 3. blend:  score = 0.5×coverage + 0.5×semantic  (or =coverage alone)
     └── 4. ChatBackend  → grounded rationale (fallback: deterministic text)
          ▼
     MatchResult (score, verdict, rationale, strengths, gaps)
```

### 4d. Application lifecycle

```
User action (CLI / Web UI)
     ├── apps add / POST /api/applications
     │       → Application row (stage=saved/applied/…)
     └── apps stage / PATCH /api/applications/{id}
             → update stage, notes, applied_date, …
```

---

## 5. Component Responsibilities

| Component | Responsibility |
|---|---|
| `SiteAdapter` | Login + HTML/API scraping via Playwright |
| `Scheduler` | Interval timing, cycle orchestration, filter application |
| `JobRepository` | Upsert / query SQLite (sqlite-utils); schema v2 — job_postings, applications, generated_documents |
| `TelegramNotifier` | Format MarkdownV2 messages, HTTP POST to Bot API |
| `BotHandlers` | Async command handlers, user interaction |
| `Settings` | pydantic-settings config, type-safe env loading (CHAT_*/EMBED_* + legacy OLLAMA_*) |
| `JobSource` | HTTP/JSON search against a public job API; no browser, no DB write |
| `aggregate_search` | Fan out a `JobQuery` to a list of `JobSource` instances; merge results; capture per-source errors |
| `ChatBackend` / `EmbedBackend` | Protocol types; `OllamaBackend` (native) and `OpenAICompatClient` implement both |
| `build_chat_backend` / `build_embed_backend` | Factories that read `LLMSettings` and return the right implementation |
| `match_profile_to_job` | Blend ATS keyword coverage + embedding cosine similarity + optional LLM rationale into a `MatchResult` |
| FastAPI app | Local HTTP layer; all business logic delegated to core; UI/CLI parity |
| Next.js web UI | Consumer of the FastAPI layer; demo mode (`NEXT_PUBLIC_DEMO=1`) for hosted preview |

---

## 6. Concurrency Model

```
Main thread         Background thread (APScheduler)
─────────────       ──────────────────────────────
asyncio loop        Playwright (blocking I/O)
  └── bot polling     └── Chromium browser
  └── command         └── HTTP requests (httpx sync)
      handlers
          │
          │  thread-safe reads (SQLite WAL)
          ▼
       JobRepository (shared)
```

SQLite WAL mode allows concurrent reads from the bot thread while the
scheduler thread is writing.  No additional locking is needed.

---

## 7. Failure Modes & Recovery

| Failure | Behaviour |
|---|---|
| Portal unreachable | Scrape returns empty list; logged; retried next interval |
| CAS login fails | Exception caught; logged; next cycle retries |
| Telegram API down | tenacity retries 3× with exponential backoff; logged |
| PC sleep/hibernate | APScheduler detects missed fire; runs immediately on wake |
| DB corruption | sqlite-utils raises; logged; next insert creates fresh DB |

---

## 8. Security Considerations

- Credentials stored only in local `.env` — never logged, never sent except to portal
- `gitleaks` pre-commit hook blocks accidental credential commits
- Telegram Bot API uses HTTPS only
- `.env` is in `.gitignore` with `detect-private-key` hook as extra guard
- No credentials in logs (loguru's `diagnose=False` in production log files)

---

## 9. Technology Choices

| Decision | Choice | Rationale |
|---|---|---|
| Package manager | `uv` | 10-100× faster than pip/poetry; replaces pyenv |
| Config | `pydantic-settings` | Type-safe, validates at startup, no scattered `os.getenv` |
| Logging | `loguru` | Zero-config, JSON mode, rotating files in one line |
| Browser | Playwright (Chromium) | Handles SPAs, handles CAS SSO, cross-platform |
| DB | `sqlite-utils` + SQLite | Zero infra, WAL-safe, ergonomic API |
| Scheduler | `apscheduler` | Handles sleep/hibernate miss-fires; cron-capable |
| HTTP | `httpx` | Async-capable, HTTP/2, replaces requests; used by job sources too |
| Retry | `tenacity` | Declarative retry with exponential backoff |
| CLI | `typer` + `rich` | Beautiful auto-help, zero boilerplate |
| Bot | `python-telegram-bot` v21 | Async, Bot API 7.x, actively maintained |
| Linting | `ruff` | Replaces black+flake8+isort; 100× faster |
| LLM abstraction | `documents/providers.py` | Protocol-based; OllamaBackend (native) + OpenAICompatClient cover all providers without the openai SDK |
| Web UI | Next.js 15 / React 19 / Tailwind | App Router; `lib/api.ts` typed client; vitest; demo mode via `NEXT_PUBLIC_DEMO` |

See [docs/adr/](../adr/) for individual Architecture Decision Records, including
[ADR 005](../adr/005-job-source-layer.md) (job source layer) and
[ADR 006](../adr/006-ai-personalization-and-data-strategy.md) (AI personalisation and data strategy).

---

## 10. Future Evolution

```
v1 (done)     v2 (done)                   v3 (planned)
──────────    ─────────────────────────   ──────────────────────────────────
Local PC  →   Docker / VPS            →   Packaged installers + PyPI publish
Telegram  →   + Discord/Email         →   Discord webhook notifier
SQLite    →   schema v2 (apps/docs)   →   deeper analytics
Manual    →   AI match + BYO-LLM     →   ghost-job signals, ATS simulation
Portal    →   + 7+ public sources     →   more portal adapters (Workday…)
```
