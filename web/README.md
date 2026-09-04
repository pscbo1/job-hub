# Job Hub — Web UI

A local-first web surface over the local engine, built with **Next.js 15
(App Router) + React 19 + TypeScript + Tailwind + framer-motion**. It talks to
the local FastAPI backend through one typed client (`lib/api.ts`) — there's no
business logic here, only views. Every call degrades gracefully to an empty
state when the backend is down, so the UI never hard-crashes.

## Run it

```bash
# One command from the repo root (API + UI together)
job-sentinel web              # http://localhost:3000

# Or run the two processes manually
job-sentinel serve            # API on http://127.0.0.1:8000
cd web
npm install
npm run dev                   # UI on http://localhost:3000
```

`NEXT_PUBLIC_API_BASE` overrides the API URL (defaults to `http://127.0.0.1:8000`).

## Pages

- `/` — landing (3D hero, the local-first pitch, market + comparison).
- `/dashboard` — pipeline funnel, closing-soon deadlines, source health, activity.
- `/search` — search jobs across sources with full filters; track in one click;
  follow a company's ATS board; per-source config.
- `/applications` — the pipeline tracker (sortable table, inline stage editing).
- `/resumes` — library of every generated résumé / cover letter (ATS scores, provider).
- `/profile` — your profile rendered as a live résumé sheet; edit + import + PDF.
- `/studio` — paste a JD → ATS match score + tailored résumé / cover-letter PDFs.
- `/chat` — grounded assistant over your jobs, profile, and a local/BYO model.
- `/settings` — LLM providers (Ollama or BYO key) for chat + embeddings.
- `/jobs` — postings the watcher has tracked, with status + deadlines.
- `/login` — optional auth (demo / required modes).

Press **⌘K / Ctrl+K** anywhere for the command palette.

## Demo mode

Set `NEXT_PUBLIC_DEMO=1` to render every screen from a bundled sample dataset
(`lib/demo.ts`) with no backend — this is how the hosted demo works.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest
```

## Companion

A **clip-to-track browser extension** lives in [`../extension/`](../extension/) —
one click saves any job posting to your tracker via the local API.
