/**
 * popup.js — Job Sentinel Clip-to-Track
 *
 * Flow:
 *  1. On open, inject the extractor into the active tab via chrome.scripting.executeScript.
 *  2. Show extracted fields in editable inputs (user can correct anything).
 *  3. On "Track this job", POST to the local Job Sentinel API.
 *  4. Show success with a link, or a clear error if the API is unreachable.
 *
 * Extraction priority:
 *  a) schema.org JobPosting JSON-LD  ← covers LinkedIn, Greenhouse, Lever, Indeed, many ATS
 *  b) og:title / document.title for the title field
 *  c) og:url / location.href for the URL
 *  d) Common meta / selector heuristics for employer / location
 *
 * All fields are optional — the extractor never throws.
 */

"use strict";

/* ── Constants ──────────────────────────────────────────── */

const DEFAULT_API_BASE = "http://127.0.0.1:8000";
const STORAGE_KEY_API_BASE = "apiBase";

/* ── DOM refs ────────────────────────────────────────────── */

const $ = (id) => document.getElementById(id);

const stateLoading   = $("state-loading");
const stateErrorPage = $("state-error-page");
const stateForm      = $("state-form");
const stateSuccess   = $("state-success");

const sourceLine  = $("source-line");
const fTitle      = $("f-title");
const fEmployer   = $("f-employer");
const fLocation   = $("f-location");
const fSalary     = $("f-salary");
const fUrl        = $("f-url");
const btnTrack    = $("btn-track");
const trackError  = $("track-error");
const linkApp     = $("link-app");

const btnSettingsToggle = $("btn-settings-toggle");
const settingsPanel     = $("settings-panel");
const fApiBase          = $("f-api-base");
const btnSaveSettings   = $("btn-save-settings");
const settingsSaved     = $("settings-saved");

/* ── Helpers ─────────────────────────────────────────────── */

function show(el)  { el.classList.remove("hidden"); }
function hide(el)  { el.classList.add("hidden"); }

function showOnly(...els) {
  [stateLoading, stateErrorPage, stateForm, stateSuccess].forEach(hide);
  els.forEach(show);
}

/* ── Extractor (runs inside the target page via executeScript) ── */

/**
 * extractJobPosting()
 *
 * Injected into the active tab. Must be a self-contained function expression
 * (no imports, no closure over popup scope). Returns a plain object:
 *   { title, employer, location, url, salary, remote, _source }
 * Every field may be undefined/null — callers must handle that.
 */
function extractJobPosting() {
  /* ── 1. schema.org JobPosting JSON-LD ───────────────── */
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      let data;
      try { data = JSON.parse(s.textContent); } catch { continue; }

      // JSON-LD can be a single object or an array of objects.
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        // Some pages wrap in @graph.
        const candidates = node["@graph"]
          ? (Array.isArray(node["@graph"]) ? node["@graph"] : [node["@graph"]])
          : [node];
        for (const item of candidates) {
          if (item["@type"] !== "JobPosting") continue;

          // Title
          const title = item.title || item.name || undefined;

          // Employer — hiringOrganization can be a string or an object.
          let employer;
          const ho = item.hiringOrganization;
          if (typeof ho === "string") employer = ho;
          else if (ho && typeof ho === "object") employer = ho.name || undefined;

          // Location — jobLocation can be object or array.
          let location;
          const locs = ho => {
            if (!ho) return [];
            return Array.isArray(ho) ? ho : [ho];
          };
          for (const loc of locs(item.jobLocation)) {
            const addr = loc.address || loc;
            if (typeof addr === "string") { location = addr; break; }
            if (addr && typeof addr === "object") {
              const city   = addr.addressLocality  || "";
              const region = addr.addressRegion     || "";
              const parts  = [city, region].filter(Boolean);
              if (parts.length) { location = parts.join(", "); break; }
            }
          }

          // Salary — baseSalary can be a MonetaryAmount or a string.
          let salary;
          const bs = item.baseSalary;
          if (typeof bs === "string") {
            salary = bs;
          } else if (bs && typeof bs === "object") {
            const val = bs.value;
            if (typeof val === "number") {
              salary = `${val}${bs.currency ? " " + bs.currency : ""}`;
            } else if (val && typeof val === "object") {
              // QuantitativeValue
              const lo = val.minValue;
              const hi = val.maxValue;
              if (lo && hi) salary = `${lo}–${hi}${bs.currency ? " " + bs.currency : ""}`;
              else if (lo)  salary = `${lo}${bs.currency ? " " + bs.currency : ""}`;
            }
          }

          // Remote — jobLocationType: TELECOMMUTE signals remote.
          const remote = (item.jobLocationType || "").toUpperCase().includes("TELECOMMUTE");

          // URL — use the canonical URL or current page.
          const url = item.url || document.location.href;

          return { title, employer, location, url, salary, remote, _source: "JSON-LD" };
        }
      }
    }
  } catch (_) { /* fall through */ }

  /* ── 2. OG / meta / heuristic fallbacks ─────────────── */
  const getMeta = (prop) => {
    const el =
      document.querySelector(`meta[property="${prop}"]`) ||
      document.querySelector(`meta[name="${prop}"]`);
    return el ? (el.getAttribute("content") || "").trim() : "";
  };

  const ogTitle   = getMeta("og:title");
  const ogUrl     = getMeta("og:url");
  const title     = ogTitle || document.title || "";

  // Try common employer selectors used by Greenhouse, Lever, Workday, etc.
  const EMPLOYER_SELECTORS = [
    '[data-company]',
    '.company-name',
    '.employer-name',
    '[class*="company"][class*="name"]',
    // Greenhouse
    '.company--name',
    // Lever
    '.posting-categories .sort-by-team',
    // Indeed
    '[data-testid="inlineHeader-companyName"] a',
    '[data-testid="company-name"]',
    // LinkedIn (fallback — JSON-LD should fire first)
    '.top-card-layout__company-name',
    '.jobs-unified-top-card__company-name a',
  ];
  let employer = "";
  for (const sel of EMPLOYER_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) { employer = el.textContent.trim(); break; }
  }

  // Location heuristics.
  const LOCATION_SELECTORS = [
    '[data-testid="job-location"]',
    '[data-testid="inlineHeader-locationText"]',
    '.location',
    '.job-location',
    '[class*="location"]',
    // Indeed
    '[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
    // LinkedIn fallback
    '.jobs-unified-top-card__bullet',
  ];
  let location = "";
  for (const sel of LOCATION_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) { location = el.textContent.trim(); break; }
  }

  const url = ogUrl || document.location.href;

  return {
    title:    title   || undefined,
    employer: employer || undefined,
    location: location || undefined,
    url:      url      || undefined,
    salary:   undefined,
    remote:   false,
    _source:  "heuristic",
  };
}

/* ── Main popup logic ────────────────────────────────────── */

async function getApiBase() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_API_BASE], (result) => {
      resolve(result[STORAGE_KEY_API_BASE] || DEFAULT_API_BASE);
    });
  });
}

async function init() {
  showOnly(stateLoading);

  // Load saved API base into the settings panel.
  const apiBase = await getApiBase();
  fApiBase.value = apiBase;

  // Get the active tab.
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showOnly(stateErrorPage);
    return;
  }

  // Inject the extractor.
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractJobPosting,
    });
  } catch (err) {
    // Restricted pages (chrome://, about:, etc.) throw here.
    showOnly(stateErrorPage);
    return;
  }

  const data = results && results[0] && results[0].result;
  if (!data) {
    showOnly(stateErrorPage);
    return;
  }

  // Populate form fields with extracted values (all editable).
  fTitle.value    = data.title    || "";
  fEmployer.value = data.employer || "";
  fLocation.value = data.location || "";
  fSalary.value   = data.salary   || "";
  fUrl.value      = data.url      || tab.url || "";

  // Source attribution line.
  const domain = (() => {
    try { return new URL(fUrl.value).hostname.replace(/^www\./, ""); }
    catch { return ""; }
  })();
  const method = data._source === "JSON-LD" ? "via schema.org JSON-LD" : "via page heuristics";
  sourceLine.textContent = [domain, method].filter(Boolean).join(" · ");

  showOnly(stateForm);
}

/* ── Track button ────────────────────────────────────────── */

btnTrack.addEventListener("click", async () => {
  hide(trackError);
  btnTrack.disabled = true;
  btnTrack.textContent = "Saving…";

  const apiBase = await getApiBase();
  const payload = {
    title:    fTitle.value.trim(),
    employer: fEmployer.value.trim(),
    location: fLocation.value.trim(),
    url:      fUrl.value.trim(),
    salary:   fSalary.value.trim(),
    source:   "extension",
    stage:    "saved",
  };

  try {
    const resp = await fetch(`${apiBase}/api/applications`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (!resp.ok) {
      let detail = `HTTP ${resp.status}`;
      try {
        const body = await resp.json();
        if (body.detail) detail = body.detail;
      } catch { /* ignore */ }
      throw new Error(detail);
    }

    // Success!
    const webUrl = apiBase.replace(":8000", ":3000").replace("127.0.0.1", "localhost");
    linkApp.href = webUrl;
    showOnly(stateSuccess);

  } catch (err) {
    btnTrack.disabled = false;
    btnTrack.textContent = "Track this job";
    const isNetworkError = err instanceof TypeError && err.message.toLowerCase().includes("fetch");
    if (isNetworkError) {
      trackError.textContent =
        'Job Hub is not running. Start it with: job-sentinel web';
    } else {
      trackError.textContent = `Error: ${err.message}`;
    }
    show(trackError);
  }
});

/* ── Settings panel ──────────────────────────────────────── */

btnSettingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

btnSaveSettings.addEventListener("click", () => {
  const val = fApiBase.value.trim().replace(/\/$/, "") || DEFAULT_API_BASE;
  fApiBase.value = val;
  chrome.storage.local.set({ [STORAGE_KEY_API_BASE]: val }, () => {
    hide(settingsSaved);
    // Briefly show "Saved." feedback.
    show(settingsSaved);
    setTimeout(() => hide(settingsSaved), 1800);
  });
});

/* ── Boot ────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", init);
