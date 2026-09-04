# Job Hub — Clip to Track (Browser Extension)

One-click job clipping for Chrome and Firefox. Navigate to any job posting, click the
extension, review the auto-filled fields, and save the role straight into your local
Job Hub application tracker. No account, no cloud service — everything stays on
your machine.

## What it does

- Extracts job details from the current page (title, company, location, salary, URL).
- Displays them in editable fields so you can correct anything before saving.
- POSTs to your locally running API (`http://127.0.0.1:8000`).
- Shows a success state with a direct link to the web dashboard.

Extraction is best-effort and prioritised:

1. **schema.org `JobPosting` JSON-LD** — covers LinkedIn, Greenhouse, Lever, Indeed,
   Workday, and most modern ATS boards.
2. **OpenGraph tags + common DOM selectors** — fallback for pages without structured data.

All fields are optional and user-editable before saving, so partial extraction is fine.

## Prerequisites

Job Hub must be running locally before you click "Track this job":

```
job-sentinel web      # starts the API + Next.js UI together
# or
job-sentinel serve    # API only (http://127.0.0.1:8000)
```

## Loading the extension

### Chrome / Chromium / Edge

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (toggle, top-right).
3. Click **Load unpacked**.
4. Select the `extension/` folder inside this repository.
5. The "Job Hub — Clip to Track" extension appears in your toolbar.

### Firefox

1. Open `about:debugging`.
2. Click **This Firefox** in the left sidebar.
3. Click **Load Temporary Add-on…**.
4. Navigate to the `extension/` folder and select `manifest.json`.

> **Note:** Firefox temporary add-ons are removed when the browser restarts. For a
> persistent install, the extension would need to be signed via AMO.

## Settings

Click the **Settings** link at the bottom of the popup to change the API base URL if
you run Job Hub on a non-default port. The setting is stored in
`chrome.storage.local` and persists across browser restarts.

## Privacy

This extension communicates **only** with your local Job Hub instance
(`http://127.0.0.1:8000` by default). No data is sent to any remote server. No
analytics, no telemetry. The source is plain JS with no build step — read it.
