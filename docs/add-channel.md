# Adding a collection channel

Job Hub V0 collects through one pipeline:

`adapter → CollectorRecord → jobs_raw → normalize → filter → dedup → jobs → Job Pool`

Do not add a source-specific Job Pool, table, or ingest path.

## What to add

1. **Registry row** in `src/job_sentinel/ingestion/collect_sources.py`
   - `id`, `label`, `kind` (`platform` / `vertical` / `career_page`)
   - `integration` (`mcp_jobs`, `ats_board`, `http_json`, `public_html`, `ssr_json`)
   - `market`, `runnable=True` only when a collector is wired
   - For Greenhouse / Lever / Ashby / Workday company careers: add a row in
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

## Company ATS (Greenhouse / Lever / Ashby / Workday)

Public board JSON (no auth):

| ATS | List endpoint | Careers URL pattern |
|---|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` | `boards.greenhouse.io/{slug}` or `job-boards.greenhouse.io/{slug}` |
| Lever | `GET https://api.lever.co/v0/postings/{slug}?mode=json` | `jobs.lever.co/{slug}` |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` | `jobs.ashbyhq.com/{slug}` |
| Workday | `POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` then `GET …/wday/cxs/{tenant}/{site}{externalPath}` for the JD | `{tenant}.wd{N}.myworkdayjobs.com/{site}` — slug is `{host}/{site}` |

Workday's CXS feed is the careers SPA's own JSON (undocumented, unauthenticated). There is no official public job-board API; tenant HCM APIs are customer-only. Config must include the real host shard (`wd5`, `wd12`, …) and site name (case-sensitive). List pages are 20 rows; Job Hub hydrates details up to `max_results` (hard cap 15 pages).

Records go through the same `CollectorRecord → jobs_raw → normalize → filter → dedup → jobs` path as other adapters.

### Taleo (not collected)

Oracle Taleo Enterprise career sections (`*.taleo.net/careersection/…`) and Oracle Recruiting Cloud (`*/hcmUI/CandidateExperience`) have no public job-board API. The page is a shell; jobs are loaded by a session-bound undocumented `POST /careersection/rest/jobboard/searchjobs` that needs a per-tenant portal id, cookies, and timezone headers. Descriptions are a second HTML scrape. RSS is admin-optional, default off, and capped at 10 jobs. Job Hub detects those URLs and refuses them instead of scraping that surface.

### iCIMS (not collected)

iCIMS Talent Cloud / Job Portal APIs (`api.icims.com`) need a numeric customer id and partner credentials. The optimized XML feed is for approved job boards. Public `{careers,jobs}-*.icims.com` portals return HTML listings (`mode=rss` still HTML); there is no stable anonymous JSON list. Job pages can expose schema.org JSON-LD, but that is per-job HTML and varies by tenant (iframe vs JS shell vs bot wall). Job Hub detects `*.icims.com` and refuses them.
