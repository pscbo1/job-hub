# Job Hub — Project Instructions

## Source of truth

- Read `docs/PRD.md` before planning or changing code.
- `docs/PRD.md` defines the product goal, V0 scope, data semantics, acceptance criteria, and delivery slices.
- The cloned Job Sentinel repository is the implementation baseline. Its HLD, LLD, tests, and conventions are implementation references.
- When upstream Job Sentinel behavior conflicts with `docs/PRD.md`, follow the PRD.
- The product owner makes scope and product decisions. Ask only when a missing choice materially changes the result.

## Current objective

Deliver the smallest usable Job Hub V0:

`Channel / Manual Import → jobs_raw → Normalize → Trust Gate → Dedup → Rule Filter → Job Pool → Return to Source → Status / Next Step / Comment`

V0 is complete only when the Exit Criteria and Acceptance Criteria in `docs/PRD.md` pass.

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
- Full application CRM or communication history
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
- Human-set Status, Favorite, Next Step, Comment, and applied_at are never overwritten by a collector run.
- Favorite is independent from lifecycle Status.
- `sponsorship` stores visa / work-permit / employer-sponsorship info. CN jobs may leave it empty. EN and Global jobs should prefer filling it when available. Keep existing enrichment and Job Pool display; do not remove or redesign sponsorship in pipeline/tracking PRs.
- New jobs default to `NULL` (no lifecycle status until the user sets one).
- Valid Status values are `saved`, `to_do`, `applied`, `closed`, and `reference`.
- Setting Status to `Applied` writes applied_at when it is empty.
- Excluded jobs remain stored with filter reasons and stay hidden from the default view.
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
