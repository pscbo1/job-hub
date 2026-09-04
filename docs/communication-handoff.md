# Communication Hub Handoff

## Cursor handoff (2026-09-04)

Communication Hub is implemented on branch `codex/communication-hub`. The current slice includes Gmail OAuth/sync through the dedicated job-search mailbox, unread-only recruiting-message filtering with stage classification and phishing quarantine, local purge of old Job Hub email records, manual communication records with WeChat/Liepin/Zhaopin/BOSS/custom channels, Job and Tasks association, retention archiving, and a `Rules` info popover. The Today page is a rule-driven suggestion surface with an empty-state `Getting started` mode and dynamic suggestions based on Jobs, Applications, and Tasks; it never mutates records automatically. The UI also includes the renamed `Reminders` task inbox, `Overview` navigation, and `Ask AI` secondary entry. Run the backend on `127.0.0.1:8000` and the frontend on `127.0.0.1:8081`; verify with `pytest tests/unit/test_communication`, `ruff check src/job_sentinel/communication tests/unit/test_communication`, and `npm run typecheck` from `web/`. Known follow-up work: replace the temporary Today client-side status fetch with a typed aggregate endpoint, remove any remaining demo-data assumptions, and run the broader repository quality gates before merging.

Updated: 2026-09-04

## Repository state

- Repository: `E:\Projects\job-hub-pr3`
- Working branch: `codex/communication-hub`
- Required base: `cursor/company-sources-notebook-8991`, PR #5, commit `c84d7cab1682ff161f0adb88ec88be9d868bf772` (schema 23)
- Do not checkout or merge `main`.
- Do not push or commit unless explicitly requested.

## Completed

- Added independent English `Communication` primary navigation and `/communication` page.
- Added Communication workspace with Pending / Retained views, source and market filters, search, manual record, Keep, Archive, Not interested, Delete, and Undo.
- Added local-only conversation persistence, idempotency, message records, source/channel fields, optional Job/Application links, and task linking.
- Added editable Communication settings: keep words, skip words, stale days, skip companies, LinkedIn noise, gig noise, default sources/market, and retention.
- Gmail is the only active mailbox integration. OAuth scope is read-only `gmail.readonly`; sync is incremental from the last successful sync and deduplicates by Gmail thread.
- Gmail credentials are read from `GMAIL_CREDENTIALS_PATH`; the local `credentials.json` is ignored and must never be pasted into chat or committed.
- Removed Outlook from the visible account list and active account routes. Historical Outlook adapter files remain as inactive internal code only.
- BOSS, Liepin, and Zhaopin use an explicit, browser-only, read-only capture flow through a separate Chrome profile and local CDP.
- Capture starts Chrome minimized on request, never auto-sends messages, never bypasses login/CAPTCHA, and never persists cookies or raw page dumps.
- BOSS visible chat-list parsing is implemented. Capture shows a review preview and saves only after explicit `Save captures`.
- Page-level platform noise is rejected; configurable skip words are applied per conversation entry so one bad entry cannot hide useful chats.
- Default skip words are specific role terms: `localization,localized,english teacher,英语教师,英语老师,高中英语,本地化`. A generic `英语` token is intentionally not used.
- Dedicated launcher: `scripts/start-communication-browser.ps1`; profile directory `.communication-chrome/` is ignored.

## Verification

- Communication backend tests: `26 passed, 1 warning`.
- Frontend `eslint app/communication/page.tsx`: passed.
- Frontend `tsc --noEmit`: passed.
- Backend `compileall`: passed.
- Full-repository Ruff still has pre-existing baseline failures outside this slice, especially in `src/job_sentinel/api/app.py` and `src/job_sentinel/db/repository.py`; do not broad-format unrelated code.

## Current local runtime

- FastAPI: `http://127.0.0.1:8000`
- Next.js: `http://127.0.0.1:3000`
- Browser CDP: `http://127.0.0.1:9222`
- Gmail credentials path: `E:\Projects\job-hub-pr3\credentials.json` (path only; contents are secret)
- Gmail proxy, when required by the local network: `GMAIL_HTTP_PROXY=http://127.0.0.1:7890`
- Browser setting: `COMM_BROWSER_CDP_URL=http://127.0.0.1:9222`

## User action required

- Gmail authorization is already connected for the Gmail account used during OAuth. No Outlook action is needed.
- The dedicated Chrome profile keeps domestic-platform login state. The user must manually log in to BOSS, Liepin, or Zhaopin once in that profile; CAPTCHA, OTP, and risk-control checks remain human-only.
- After login, click `Read page`, review the preview, then click `Save captures`.

## Next implementation order

1. Capture one real Liepin page and one real Zhaopin page after the user logs in, then add fixture-based parsing for sender, company, role, preview, and timestamp.
2. Add entry-level tests for those fixtures and verify repeated saves remain idempotent.
3. Add clearer login-expired / CAPTCHA states in the Communication UI without attempting automation around them.
4. Run the full applicable backend and frontend suites before declaring the Communication slice ready for joint acceptance.

## Key files

- API routes: `src/job_sentinel/api/app.py`
- Domestic browser capture: `src/job_sentinel/communication/domestic.py`
- Platform manifest: `src/job_sentinel/communication/platforms.py`
- Gmail OAuth/sync: `src/job_sentinel/communication/gmail.py`
- Communication models: `src/job_sentinel/communication/models.py`
- Persistence and settings: `src/job_sentinel/db/repository.py`
- UI: `web/app/communication/page.tsx`
- Navigation: `web/components/Nav.tsx`, `web/lib/commandPaletteNav.ts`
- Domestic plan and safety boundary: `docs/communication-domestic-plan.md`
- Tests: `tests/unit/test_communication/`
