# Adding a collection channel

Job Hub V0 collects through one pipeline:

`adapter → CollectorRecord → jobs_raw → normalize → filter → dedup → jobs → Job Pool`

Do not add a source-specific Job Pool, table, or ingest path.

## What to add

1. **Registry row** in `src/job_sentinel/ingestion/collect_sources.py`
   - `id`, `label`, `kind` (`platform` / `vertical` / `career_page`)
   - `integration` (`mcp_jobs`, `ats_board`, `http_json`, `public_html`, `ssr_json`)
   - `market`, `runnable=True` only when a collector is wired
   - For Greenhouse / Lever / Ashby company careers: add a row in
     `src/job_sentinel/ingestion/company_ats.yaml` (`company` + `ats`/`slug` or
     `careers_url`). Reuse `ats_board`; do not add a Python adapter.
   - Search lists only `enabled` and `runnable` sources

2. **Adapter** (skip if `ats_board` already covers it)
   - Emit `CollectorRecord` (`channel_key` = registry `id`, `source_url`, `title`, `company`, `source_job_id` when known)
   - Map into `collect_adapter_records` in `ingestion/adapters/run.py`
   - Keep site-specific HTTP in the adapter; do not change `pipeline.py`

3. **Tests**
   - respx (or a fixture payload) proving mapping + keyword filter
   - collect → `jobs_raw` / `jobs` if behavior is new

mcp-jobs CN platforms stay `integration="mcp_jobs"` and do not need a Python adapter.

## Prefer, in order

Public JSON / ATS board API → RSS/XML → SSR JSON island → small public HTML parse.

Stop if the source needs login, partner credentials, or an unstable private API
that cannot be called without a session.

FAO Careers (Taleo) is an example of that stop.

LinkedIn Jobs is a runnable `public_html` collector. It uses undocumented
`/jobs-guest/jobs/api/seeMoreJobPostings/search` and
`/jobs-guest/jobs/api/jobPosting/{jobId}` HTML endpoints with no login or
cookies. Treat markup and query params as unstable; do not add a compatibility
layer.

## Company ATS (Greenhouse / Lever / Ashby)

Public board APIs (no auth):

| ATS | List endpoint | Careers URL pattern |
|---|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` | `boards.greenhouse.io/{slug}` or `job-boards.greenhouse.io/{slug}` |
| Lever | `GET https://api.lever.co/v0/postings/{slug}?mode=json` | `jobs.lever.co/{slug}` |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` | `jobs.ashbyhq.com/{slug}` |

Records go through the same `CollectorRecord → jobs_raw → normalize → filter → dedup → jobs` path as other adapters.

### Taleo (not collected)

Oracle Taleo Enterprise career sections (`*.taleo.net/careersection/…`) and Oracle Recruiting Cloud (`*/hcmUI/CandidateExperience`) have no public job-board API. The page is a shell; jobs are loaded by a session-bound undocumented `POST /careersection/rest/jobboard/searchjobs` that needs a per-tenant portal id, cookies, and timezone headers. Descriptions are a second HTML scrape. RSS is admin-optional, default off, and capped at 10 jobs. Job Hub detects those URLs and refuses them instead of scraping that surface.
