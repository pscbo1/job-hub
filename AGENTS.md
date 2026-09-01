# Job Hub — Project Instructions

## Source of truth

- Read `docs/PRD.md` before planning or changing code.
- `docs/PRD.md` defines the product goal, V0 scope, data semantics, acceptance criteria, and delivery slices.
- The cloned Job Sentinel repository is the implementation baseline. Its HLD, LLD, tests, and conventions are implementation references.
- When upstream Job Sentinel behavior conflicts with `docs/PRD.md`, follow the PRD.
- The product owner makes scope and product decisions. Ask only when a missing choice materially changes the result.

## Current objective

Deliver the smallest usable Job Hub V0, then the sealed Part 1 product model (2026-09-01):

`Collect → Discover → (Dismiss/Excluded | Save | Reference | Start Application → Draft → Mark Submitted → Applied → Interview → Offer → Closed)`

Nav is **Collect Jobs · Discover · Tasks · Applications** only. Reference is an independent boolean (can coexist with Save and Application). To Do / Under Study are not user-facing. Application Closed is history. `close_reason` is optional. Idle auto-archive applies only to Excluded/Dismissed jobs (Settings default OFF, 14 days). Tasks membership is next_step OR deadline OR unfinished job_task OR Application.stage=draft.

## Implementation strategy

- Use **fork and reduce**. Reuse stable upstream modules and tests before writing replacements.
- Keep the existing Python + FastAPI + Next.js + SQLite architecture for V0.
- Preserve adapter, registry, source aggregation, typed API client, source health, error isolation, local auth option, and test infrastructure where useful.
- Replace the upstream Job model, repository schema, status semantics, ingestion contract, filtering, and Job Pool behavior according to the PRD.
- Keep `mcp-jobs` as an external CN collector during V0. Connect it through the canonical ingestion contract; do not rewrite the working collector first.
- Keep database access behind a repository interface. V0 uses SQLite WAL. PostgreSQL / Supabase remains a later migration path.
- Record copied or retained upstream code, source commit, original path, and local path in `UPSTREAM.md`.
- Preserve required MIT / Apache-2.0 license and notice text.

## V0 scope lock

Do not implement these without an explicit request:

- AI Match or LLM features
- Agent runtime or MCP integration
- Resume, profile, document, or cover-letter generation
- Telegram or email notifications
- Full application CRM or communication history (V0). Part 1 tracking is in scope: 1:1 Application, submissions, Tasks, excluded auto-archive.
- Grok Cloud collection
- ATS autofill or automatic application submission
- Supabase, Vercel, or cloud scheduling
- Complete Trust Engine
- Channel Sheet real-time two-way sync
- Analytics dashboard

Disable or remove upstream surfaces that expose these features in the V0 UI. Preserve reusable code only when keeping it does not complicate the active path.

## Product invariants

- CN and GLOBAL share one Job schema.
- Raw records are stored before normalization.
- Repeated ingestion is idempotent.
- High-confidence duplicate rules may merge automatically; uncertain matches enter Review.
- Human-set Favorite (Save), Reference, Next Step, Comment, dismissed_at, archived_at, and Application fields are never overwritten by a collector run.
- Favorite (Save) and Reference are independent booleans. They can coexist with each other and with an Application. New jobs default to both false. Collectors never write a lifecycle Status onto Job and never bump `last_activity_at`.
- Do not write `engagement=under_study` or `to_do`. `engagement` is legacy read-compat only. Migrated `engagement=reference` becomes `reference=true`, `engagement=null`.
- Application stages are `draft`, `applied`, `interview`, `offer`, and `closed`. Never rejected. Closed is history (no separate Application archived stage).
- 1 Job ↔ 1 Application. Start Application is allowed from any normal Discover job. Re-apply appends a submission event and reopens Applied.
- Dismiss and Save/Reference are mutually exclusive.
- Setting Application to Closed does not require close_reason. Never use a required Close modal.
- Idle auto-archive (default off, 14 days) sets `jobs.archived_at` only for Excluded/Dismissed jobs. Never Saved, Reference, active Applications, or plain included jobs. Archived excluded jobs remain listed under Discover Excluded. CLI: `job-sentinel archive [--force] [--dry-run]`.
- Tasks membership is next_step OR deadline OR unfinished job_task OR Application.stage=draft. Save-only / Reference-only / plain Discover jobs are not Tasks.
- Excluded / dismissed / archived jobs remain stored and stay hidden from the default view.
- A failing source never aborts other sources or discards successful records.
- CAPTCHA and login expiry require visible human action; do not bypass them.
- External application and communication actions return the user to the original source.

## Engineering rules

- Make small, independently verifiable changes aligned to one delivery slice.
- Before editing, inspect the existing implementation and identify reusable modules and tests.
- Do not regenerate working modules from scratch when a compatible upstream implementation exists.
- Keep source-specific code inside adapters.
- Keep business logic out of route handlers and UI components.
- Use typed Pydantic models for ingestion and API boundaries.
- Store timestamps as timezone-aware UTC; display them using the configured app timezone.
- Make migrations idempotent and version-controlled.
- Sanitize external HTML before rendering.
- Keep secrets in environment variables and out of logs, fixtures, commits, and client code.
- Avoid new dependencies unless the existing stack cannot satisfy the requirement; record the reason when adding one.
- Preserve unrelated user changes.

## Quality gates

Run the relevant existing checks after each change. Before declaring a slice complete, run the full applicable suite, including:

```bash
ruff check .
ruff format --check .
mypy src/
pytest tests/unit tests/integration
```

Run the existing frontend lint, unit, and Playwright tests from `web/` using the scripts defined in its `package.json`.

New behavior requires tests. Report exact commands, results, and any checks that could not run.

## Safety and repository control

- Do not push, publish, deploy, delete data, rewrite Git history, or remove large upstream areas without explicit approval.
- Do not commit secrets or personal job-search data.
- Do not add AI authorship or co-author trailers.
- Keep the upstream remote and attribution recoverable.

## First task protocol

For the first Cursor task:

1. Read `docs/PRD.md`, this file, upstream `docs/design/HLD.md`, `docs/design/LLD.md`, and `CONTRIBUTING.md`.
2. Inspect the repository without editing.
3. Map reusable upstream modules to PRD Slice 0 and identify the smallest set of modules to disable or replace.
4. Verify the current Windows-local setup commands and available tests.
5. Return a concise Slice 0 implementation plan, affected files, risks, and stopping point.

Do not begin product code changes until the plan is approved.
