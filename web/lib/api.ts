/**
 * Typed client for the local Job Sentinel API (see src/job_sentinel/api/app.py).
 * Every call degrades gracefully: on any failure it returns a safe empty value
 * instead of throwing, so pages render an empty state rather than a crash.
 *
 * In the hosted demo (NEXT_PUBLIC_DEMO=1) the client returns bundled sample
 * data from lib/demo instead of calling a backend, so every screen is alive.
 */

import * as demo from "@/lib/demo";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export interface Link {
  label: string;
  url: string;
}
export interface Basics {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: Link[];
  summary: string;
}
export interface Experience {
  company: string;
  role: string;
  location: string;
  start: string;
  end: string;
  bullets: string[];
  tags: string[];
}
export interface Project {
  name: string;
  description: string;
  url: string;
  bullets: string[];
  tags: string[];
}
export interface Education {
  institution: string;
  degree: string;
  location: string;
  start: string;
  end: string;
  gpa: string;
  highlights: string[];
}
export interface SkillGroup {
  category: string;
  skills: string[];
}
export interface Certification {
  name: string;
  issuer: string;
  date: string;
  tags?: string[];
}
export interface Award {
  title: string;
  issuer: string;
  date: string;
  description: string;
  tags?: string[];
}
export interface Publication {
  title: string;
  venue: string;
  date: string;
  url: string;
  tags?: string[];
}
export interface Profile {
  basics: Basics;
  education: Education[];
  experience: Experience[];
  projects: Project[];
  skills: SkillGroup[];
  certifications: Certification[];
  awards: Award[];
  publications: Publication[];
}
export interface JobDetail {
  description?: string;
  salary?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  openings?: number | null;
  industry?: string;
  job_function?: string;
  work_study_required?: boolean | null;
  application_begins?: string | null;
  job_start_date?: string | null;
  application_documents?: string[];
  contact_name?: string | null;
  contact_title?: string | null;
  contact_email?: string | null;
  apply_via_site?: boolean | null;
  external_url?: string | null;
  num_applicants?: number | null;
  required_work_auth?: string | null;
  time_commitment?: string | null;
}
export interface JobPosting {
  posting_id: string;
  title: string;
  employer: string;
  location: string;
  job_type: string;
  posted_date: string;
  deadline: string;
  description_snippet: string;
  status: string;
  portal_url: string;
  /** Source/adapter that produced this record (e.g. "remoteok", "12twenty"). */
  source_adapter?: string;
  raw_data?: { detail?: JobDetail; [key: string]: unknown };
}
export interface TailorResult {
  score: number;
  matched_keywords: string[];
  missing_keywords: string[];
  profile: Profile;
}

export interface MatchResult {
  /** Blended fit score (0..1); multiply by 100 for percentage. */
  score: number;
  /** ATS keyword coverage (0..1). */
  coverage: number;
  /** Embedding cosine similarity (0..1); null when embedder unavailable. */
  semantic: number | null;
  matched_keywords: string[];
  missing_keywords: string[];
  /** "strong" | "moderate" | "weak" */
  verdict: string;
  rationale: string;
  strengths: string[];
  gaps: string[];
}

const TOKEN_KEY = "sentinel_token";

/** Bearer-token header from localStorage (no-op during SSR / when logged out). */
function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function getJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", headers: authHeaders() });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export function getProfile(): Promise<Profile | null> {
  if (demo.DEMO) return Promise.resolve(demo.demoProfile);
  return getJSON<Profile | null>("/api/profile", null);
}

export type HubJobStatus = "saved" | "to_do" | "applied" | "closed" | "reference";

export interface HubJob {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  job_url: string;
  published_at: string | null;
  discovered_at: string;
  status: HubJobStatus | null;
  match_score: number | null;
  salary?: string;
  description?: string;
  filter_state?: string;
  filter_reasons?: string[];
}

export type PoolFilterState = "included" | "excluded" | "all";

export function getJobs(
  limit = 50,
  since?: string,
  filterState: PoolFilterState = "included",
): Promise<HubJob[]> {
  if (demo.DEMO) return Promise.resolve(demo.demoHubJobs.slice(0, limit));
  const q = new URLSearchParams({ limit: String(limit), filter_state: filterState });
  if (since) q.set("since", since);
  return getJSON<HubJob[]>(`/api/jobs?${q.toString()}`, []);
}

export async function patchHubJobStatus(
  jobId: string,
  status: HubJobStatus | null,
): Promise<HubJob | null> {
  if (demo.DEMO) return { id: jobId, title: "", company: "", location: "", source: "", job_url: "", published_at: null, discovered_at: "", status, match_score: null };
  try {
    const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return null;
    return (await res.json()) as HubJob;
  } catch {
    return null;
  }
}

export async function dismissHubJob(jobId: string): Promise<HubJob | null> {
  if (demo.DEMO) {
    return {
      id: jobId,
      title: "",
      company: "",
      location: "",
      source: "",
      job_url: "",
      published_at: null,
      discovered_at: "",
      status: null,
      match_score: null,
      filter_state: "excluded",
      filter_reasons: ["manual_dismiss"],
    };
  }
  try {
    const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/dismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
    if (!res.ok) return null;
    return (await res.json()) as HubJob;
  } catch {
    return null;
  }
}

export async function undismissHubJob(jobId: string): Promise<HubJob | null> {
  if (demo.DEMO) {
    return {
      id: jobId,
      title: "",
      company: "",
      location: "",
      source: "",
      job_url: "",
      published_at: null,
      discovered_at: "",
      status: null,
      match_score: null,
      filter_state: "included",
      filter_reasons: [],
    };
  }
  try {
    const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/undismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
    if (!res.ok) return null;
    return (await res.json()) as HubJob;
  } catch {
    return null;
  }
}

export async function tailorResume(jobDescription: string): Promise<TailorResult | null> {
  if (demo.DEMO) return demo.demoTailor;
  try {
    const res = await fetch(`${API_BASE}/api/resume/tailor`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ job_description: jobDescription }),
    });
    if (!res.ok) return null;
    return (await res.json()) as TailorResult;
  } catch {
    return null;
  }
}

/**
 * Score how well the stored profile fits a job.
 *
 * Pass either `job_description` (raw text) or `posting_id` (looks up a stored
 * JobPosting).  `ai` defaults to true — set to false to skip the LLM rationale.
 * Returns null on any transport or server failure.
 */
export async function matchJob(body: {
  job_description?: string;
  posting_id?: string;
  ai?: boolean;
}): Promise<MatchResult | null> {
  if (demo.DEMO) return new Promise((r) => setTimeout(() => r(demo.demoMatch), 600));
  try {
    const res = await fetch(`${API_BASE}/api/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as MatchResult;
  } catch {
    return null;
  }
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
export interface ChatReply {
  reply: string;
  source: "rules" | "llm";
}

/** Ask the Sentinel assistant. Returns null on any transport failure. */
export async function sendChat(messages: ChatTurn[]): Promise<ChatReply | null> {
  if (demo.DEMO) return demo.demoChatReply();
  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ChatReply;
  } catch {
    return null;
  }
}

/** Update a posting's tracking status. Returns true on success. */
export async function setJobStatus(postingId: string, status: string): Promise<boolean> {
  if (demo.DEMO) return true;
  try {
    const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(postingId)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ImportResult {
  ok: boolean;
  profile?: Profile;
  detail?: string;
}

/** Upload a resume PDF and get back a parsed Profile draft (nothing is saved). */
export async function importResume(file: File, ai = true): Promise<ImportResult> {
  if (demo.DEMO) return { ok: true, profile: demo.demoProfile };
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/api/profile/import-resume?ai=${ai}`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      return { ok: false, detail: body.detail ?? `Import failed (${res.status})` };
    }
    return { ok: true, profile: (await res.json()) as Profile };
  } catch {
    return { ok: false, detail: "Could not reach the API. Is `job-sentinel serve` running?" };
  }
}

/** Persist the full profile. Returns the saved (validated) profile, or null. */
export async function putProfile(profile: Profile): Promise<Profile | null> {
  if (demo.DEMO) return profile;
  try {
    const res = await fetch(`${API_BASE}/api/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(profile),
    });
    if (!res.ok) return null;
    return (await res.json()) as Profile;
  } catch {
    return null;
  }
}

export interface OpStatus {
  state: "idle" | "running" | "ok" | "error";
  message: string;
  started_at: string | null;
  finished_at: string | null;
  detail: Record<string, unknown>;
}
export interface OpsStatus {
  config_ok: boolean;
  config_error: string;
  session: { exists: boolean; saved_at: string | null };
  login: OpStatus;
  scrape: OpStatus;
  watcher: { running: boolean; interval_seconds: number | null };
  adapter: string | null;
  adapters: string[];
}
export interface LlmStatus {
  base_url: string;
  reachable: boolean;
  chat_model: string;
  chat_ready: boolean;
  embed_model: string;
  embed_ready: boolean;
}
export interface StartResult {
  ok: boolean;
  detail?: string;
}

/** Snapshot of session/login/scrape/watcher state. Null if the API is down. */
export function getOpsStatus(): Promise<OpsStatus | null> {
  if (demo.DEMO) return Promise.resolve(demo.demoOps);
  return getJSON<OpsStatus | null>("/api/ops/status", null);
}

/** Counts per tracking status (db stats). */
export function getStats(): Promise<Record<string, number>> {
  if (demo.DEMO) return Promise.resolve(demo.demoStats);
  return getJSON<Record<string, number>>("/api/stats", {});
}

/** Local-LLM health (resume doctor). */
export function getLlmStatus(): Promise<LlmStatus | null> {
  if (demo.DEMO) return Promise.resolve(demo.demoLlmStatus);
  return getJSON<LlmStatus | null>("/api/llm/status", null);
}

async function postJSON(path: string, body: unknown): Promise<StartResult> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body ?? {}),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    return { ok: false, detail: data.detail ?? `Request failed (${res.status})` };
  } catch {
    return { ok: false, detail: "Could not reach the API. Is `job-sentinel serve` running?" };
  }
}

/** Open the interactive portal login (a browser opens on the API machine). */
export function startLogin(timeout = 300): Promise<StartResult> {
  if (demo.DEMO)
    return Promise.resolve({ ok: false, detail: "Portal login runs locally on your machine." });
  return postJSON("/api/ops/login", { timeout });
}

export interface SessionCheck {
  valid: boolean;
  user: string;
  detail: string;
  checked: boolean;
}

/** Headless probe: is the saved portal session still valid? Null = API down/conflict. */
export async function checkSession(): Promise<SessionCheck | null> {
  if (demo.DEMO)
    return { valid: true, user: "alex.rivera (demo)", detail: "Session valid", checked: true };
  try {
    const res = await fetch(`${API_BASE}/api/ops/session/check`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionCheck;
  } catch {
    return null;
  }
}

/** Run one scrape cycle. `send` actually sends alerts (default dry-run). */
export function startScrape(send = false): Promise<StartResult> {
  if (demo.DEMO)
    return Promise.resolve({ ok: false, detail: "Scraping runs locally — clone the repo to try it." });
  return postJSON("/api/ops/scrape", { send });
}

/** Start / stop the continuous watcher (scrape on an interval + alerts). */
export function startWatcher(): Promise<StartResult> {
  if (demo.DEMO) return Promise.resolve({ ok: false, detail: "The watcher runs locally." });
  return postJSON("/api/ops/watcher/start", {});
}
export function stopWatcher(): Promise<StartResult> {
  return postJSON("/api/ops/watcher/stop", {});
}

// ── LLM provider config ──────────────────────────────────────────────────────

export interface LlmSlotConfig {
  provider: string;
  model: string;
  base_url: string;
  api_key_set: boolean;
  api_key_masked: string;
}

export interface LlmProviderInfo {
  id: string;
  label: string;
  default_base_url: string;
  requires_key: boolean;
  supports_embeddings: boolean;
}

export interface LlmConfig {
  chat: LlmSlotConfig;
  embed: LlmSlotConfig;
  providers: LlmProviderInfo[];
}

export interface LlmConfigBody {
  chat: { provider: string; model: string; base_url: string; api_key?: string };
  embed: { provider: string; model: string; base_url: string; api_key?: string };
}

export interface LlmTestResult {
  ok: boolean;
  detail: string;
  latency_ms: number | null;
}

/** Fetch the current LLM provider config (chat + embed). Returns null if the API is down. */
export function getLlmConfig(): Promise<LlmConfig | null> {
  return getJSON<LlmConfig | null>("/api/llm/config", null);
}

/**
 * Persist LLM provider config. Omit `api_key` to leave unchanged; pass `""` to clear.
 * Returns the updated masked config, or null on failure.
 */
export async function putLlmConfig(body: LlmConfigBody): Promise<LlmConfig | null> {
  try {
    const res = await fetch(`${API_BASE}/api/llm/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as LlmConfig;
  } catch {
    return null;
  }
}

/** Probe a chat or embedding slot. Returns {ok:false} on any transport failure. */
export async function testLlm(target: "chat" | "embed"): Promise<LlmTestResult> {
  try {
    const res = await fetch(`${API_BASE}/api/llm/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ target }),
    });
    if (!res.ok) return { ok: false, detail: `Request failed (${res.status})`, latency_ms: null };
    return (await res.json()) as LlmTestResult;
  } catch {
    return { ok: false, detail: "Could not reach the API. Is `job-sentinel serve` running?", latency_ms: null };
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  username: string;
  is_admin: boolean;
}
export interface AuthStatus {
  mode: "off" | "demo" | "required";
  users_exist: boolean;
  user: AuthUser | null;
}

/** Current auth mode and (if a valid token is held) the logged-in user. */
export function getAuthStatus(): Promise<AuthStatus | null> {
  if (demo.DEMO) return Promise.resolve(demo.demoAuth);
  return getJSON<AuthStatus | null>("/api/auth/status", null);
}

/** Log in; stores the token on success. */
export async function authLogin(
  username: string,
  password: string,
): Promise<{ ok: boolean; detail?: string; user?: AuthUser }> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      token?: string;
      user?: AuthUser;
      detail?: string;
    };
    if (!res.ok || !body.token) return { ok: false, detail: body.detail ?? "Login failed." };
    setAuthToken(body.token);
    return { ok: true, user: body.user };
  } catch {
    return { ok: false, detail: "Could not reach the API." };
  }
}

export function authLogout(): void {
  setAuthToken(null);
}

export interface BuildResult {
  ok: boolean;
  blob?: Blob;
  detail?: string;
}

/** Build a (optionally tailored / LLM) résumé PDF and return the bytes. */
export async function buildResume(jobDescription = "", ai = false): Promise<BuildResult> {
  if (demo.DEMO)
    return { ok: false, detail: "PDF generation runs locally — clone the repo to build real PDFs." };
  try {
    const res = await fetch(`${API_BASE}/api/resume/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ job_description: jobDescription, ai }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      return { ok: false, detail: body.detail ?? `Build failed (${res.status})` };
    }
    return { ok: true, blob: await res.blob() };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

// ── Application tracker ──────────────────────────────────────────────────────

export type ApplicationStage =
  | "saved"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected"
  | "archived";

export interface Application {
  id: string;
  title: string;
  employer: string;
  location: string;
  url: string;
  source: string;
  stage: ApplicationStage;
  salary: string;
  applied_date: string;
  deadline: string;
  notes: string;
  posting_id: string | null;
  resume_document_id: string | null;
  created_at: string;
  updated_at: string;
  raw_data: Record<string, unknown>;
}

export interface ApplicationCreateBody {
  posting_id?: string;
  title?: string;
  employer?: string;
  location?: string;
  url?: string;
  source?: string;
  stage?: ApplicationStage;
  salary?: string;
  applied_date?: string;
  deadline?: string;
  notes?: string;
  resume_document_id?: string | null;
}

export interface ApplicationPatch {
  stage?: ApplicationStage;
  notes?: string;
  applied_date?: string;
  deadline?: string;
  salary?: string;
  resume_document_id?: string | null;
  title?: string;
  employer?: string;
  location?: string;
  url?: string;
  source?: string;
}

export type DocumentKind = "resume" | "cover_letter";

export interface GeneratedDocument {
  id: string;
  kind: DocumentKind;
  label: string;
  title: string;
  employer: string;
  file_path: string;
  tex_path: string | null;
  ats_score: number | null;
  provider: string;
  tailored: boolean;
  job_snippet: string;
  application_id: string | null;
  posting_id: string | null;
  created_at: string;
  raw_data: Record<string, unknown>;
}

/** List applications, optionally filtered by stage. */
export function getApplications(
  stage?: ApplicationStage,
  limit = 200,
): Promise<Application[]> {
  if (demo.DEMO)
    return Promise.resolve(
      stage ? demo.demoApplications.filter((a) => a.stage === stage) : demo.demoApplications,
    );
  const params = new URLSearchParams();
  if (stage) params.set("stage", stage);
  params.set("limit", String(limit));
  return getJSON<Application[]>(`/api/applications?${params}`, []);
}

/** Create a new tracked application (from a posting or manually). */
export async function createApplication(body: ApplicationCreateBody): Promise<Application | null> {
  if (demo.DEMO)
    return {
      ...demo.demoApplications[0],
      id: `demo-${Date.now()}`,
      title: body.title ?? "Tracked role",
      employer: body.employer ?? "",
      location: body.location ?? "",
      url: body.url ?? "",
      source: body.source ?? "",
      stage: body.stage ?? "saved",
    };
  try {
    const res = await fetch(`${API_BASE}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as Application;
  } catch {
    return null;
  }
}

/** Fetch a single application by id. */
export function getApplication(id: string): Promise<Application | null> {
  return getJSON<Application | null>(`/api/applications/${encodeURIComponent(id)}`, null);
}

/** Partially update a tracked application. */
export async function updateApplication(
  id: string,
  patch: ApplicationPatch,
): Promise<Application | null> {
  if (demo.DEMO) {
    const found = demo.demoApplications.find((a) => a.id === id) ?? demo.demoApplications[0];
    return { ...found, ...patch };
  }
  try {
    const res = await fetch(`${API_BASE}/api/applications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    return (await res.json()) as Application;
  } catch {
    return null;
  }
}

/** Delete a tracked application. Returns true on success. */
export async function deleteApplication(id: string): Promise<boolean> {
  if (demo.DEMO) return true;
  try {
    const res = await fetch(`${API_BASE}/api/applications/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Count of applications per stage plus total. */
export function getApplicationStats(): Promise<Record<string, number>> {
  if (demo.DEMO) return Promise.resolve(demo.demoStats);
  return getJSON<Record<string, number>>("/api/applications/stats", {});
}

export interface ApplicationFunnelEntry {
  stage: string;
  count: number;
  pct_of_applied: number | null;
}

export interface ApplicationSourceStat {
  source: string;
  applied: number;
  responded: number;
  response_rate: number | null;
}

export interface ApplicationWeekVolume {
  week: string;
  count: number;
}

export interface ApplicationAnalytics {
  funnel: ApplicationFunnelEntry[];
  overall_response_rate: number | null;
  by_source: ApplicationSourceStat[];
  weekly_volume: ApplicationWeekVolume[];
}

/** Richer analytics: funnel conversion, response rate by source, weekly volume. */
export function getApplicationAnalytics(): Promise<ApplicationAnalytics> {
  if (demo.DEMO)
    return Promise.resolve({
      funnel: [
        { stage: "saved", count: 5, pct_of_applied: null },
        { stage: "applied", count: 12, pct_of_applied: null },
        { stage: "interviewing", count: 3, pct_of_applied: 25.0 },
        { stage: "offer", count: 1, pct_of_applied: 8.3 },
        { stage: "rejected", count: 4, pct_of_applied: 33.3 },
        { stage: "archived", count: 2, pct_of_applied: null },
      ],
      overall_response_rate: 33.3,
      by_source: [
        { source: "adzuna", applied: 6, responded: 2, response_rate: 33.3 },
        { source: "wellfound", applied: 4, responded: 1, response_rate: 25.0 },
        { source: "manual", applied: 2, responded: 1, response_rate: 50.0 },
      ],
      weekly_volume: [
        { week: "2026-W23", count: 3 },
        { week: "2026-W24", count: 5 },
        { week: "2026-W25", count: 4 },
      ],
    });
  return getJSON<ApplicationAnalytics>("/api/applications/analytics", {
    funnel: [],
    overall_response_rate: null,
    by_source: [],
    weekly_volume: [],
  });
}

/** List generated documents, optionally filtered by kind. */
export function getDocuments(kind?: DocumentKind, limit = 200): Promise<GeneratedDocument[]> {
  if (demo.DEMO)
    return Promise.resolve(kind ? demo.demoDocuments.filter((d) => d.kind === kind) : demo.demoDocuments);
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  params.set("limit", String(limit));
  return getJSON<GeneratedDocument[]>(`/api/documents?${params}`, []);
}

/** Return the URL that serves the PDF file for a document. */
export function documentFileUrl(id: string): string {
  return `${API_BASE}/api/documents/${encodeURIComponent(id)}/file`;
}

/** Delete a generated document record (and its file on disk). Returns true on success. */
export async function deleteDocument(id: string): Promise<boolean> {
  if (demo.DEMO) return true;
  try {
    const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Job Sources ───────────────────────────────────────────────────────────────

export interface JobQuery {
  keywords?: string;
  location?: string;
  remote?: boolean | null;
  job_type?: string;
  salary_min?: number | null;
  date_posted_days?: number | null;
  radius_km?: number | null;
  seniority?: string;
  company?: string;
  limit?: number;
  /** Restrict search to these source IDs only. */
  sources?: string[];
}

export interface JobSourceStatus {
  id: string;
  label: string;
  enabled: boolean;
  requires_key: boolean;
  is_scraper: boolean;
  configured: boolean;
  homepage: string;
}

export interface SourceError {
  source: string;
  detail: string;
}

export interface SearchResponse {
  results: JobPosting[];
  errors: SourceError[];
  counts: Record<string, number>;
}

export interface SourceConfigKeys {
  ADZUNA_APP_ID?: string;
  ADZUNA_APP_KEY?: string;
  ADZUNA_COUNTRY?: string;
  USAJOBS_API_KEY?: string;
  USAJOBS_EMAIL?: string;
  THEMUSE_API_KEY?: string;
}

export interface SourceConfigBody {
  enabled_sources?: string[];
  keys?: SourceConfigKeys;
}

/** List all known job sources with their configuration status. */
export function getSources(): Promise<{ sources: JobSourceStatus[] } | null> {
  if (demo.DEMO) return Promise.resolve({ sources: demo.demoSources });
  return getJSON<{ sources: JobSourceStatus[] } | null>("/api/sources", null);
}

/**
 * Update enabled sources and/or API keys.
 * Raw keys are never returned — response contains configured booleans only.
 */
export async function updateSourcesConfig(
  body: SourceConfigBody,
): Promise<{ sources: JobSourceStatus[] } | null> {
  if (demo.DEMO) return { sources: demo.demoSources };
  try {
    const res = await fetch(`${API_BASE}/api/sources/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as { sources: JobSourceStatus[] };
  } catch {
    return null;
  }
}

export interface IngestResult {
  raw_inserted: number;
  jobs_created: number;
  jobs_updated: number;
  invalid: number;
  skipped: number;
  errors: string[];
}

export interface CollectSource {
  id: string;
  label: string;
  kind: "platform" | "career_page" | "vertical";
  collector_id: string;
  integration?: "mcp_jobs" | "ats_board" | "http_json" | "public_html" | "ssr_json";
  source_group?: "platform" | "vertical" | "company_careers" | null;
  collection_group?: string | null;
  market?: string;
  runnable?: boolean;
  notes: string;
  enabled: boolean;
}

export type CollectStatus = "completed" | "failed" | "partial";

export interface CollectOutcome {
  status: CollectStatus;
  jobs_created: number;
  jobs_updated: number;
  raw_inserted: number;
  invalid: number;
  excluded?: number;
  source_results: Array<{
    name?: string;
    succeeded?: boolean;
    jobCount?: number;
    errors?: string[];
    [key: string]: unknown;
  }>;
  errors: string[];
  since: string;
  message: string;
  max_results?: number;
}

export interface FilterSettings {
  exclude_outsourcing: boolean;
  exclude_part_time: boolean;
  exclude_internship: boolean;
  custom_keywords: string[];
  excluded_companies: string[];
}

export function getFilterSettings(): Promise<FilterSettings | null> {
  if (demo.DEMO) {
    return Promise.resolve({
      exclude_outsourcing: true,
      exclude_part_time: true,
      exclude_internship: true,
      custom_keywords: [],
      excluded_companies: [],
    });
  }
  return getJSON<FilterSettings | null>("/api/filters", null);
}

export async function saveFilterSettings(
  body: FilterSettings & { apply?: boolean },
): Promise<{ settings: FilterSettings; reapplied?: { scanned: number; included: number; excluded: number } } | null> {
  if (demo.DEMO) return { settings: body };
  try {
    const res = await fetch(`${API_BASE}/api/filters`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as { settings: FilterSettings; reapplied?: { scanned: number; included: number; excluded: number } };
  } catch {
    return null;
  }
}

export function getCollectSources(): Promise<{ sources: CollectSource[] } | null> {
  if (demo.DEMO) {
    return Promise.resolve({
      sources: [
        { id: "zhaopin", label: "Zhaopin", kind: "platform", collector_id: "zhaopin", integration: "mcp_jobs", notes: "", enabled: true },
        { id: "liepin", label: "Liepin", kind: "platform", collector_id: "liepin", integration: "mcp_jobs", notes: "", enabled: true },
        { id: "boss", label: "Boss", kind: "platform", collector_id: "boss", integration: "mcp_jobs", notes: "local Chrome login", enabled: true },
        { id: "impactpool", label: "Impactpool", kind: "vertical", collector_id: "impactpool", integration: "public_html", notes: "", enabled: true },
        { id: "dimagi", label: "Dimagi Careers", kind: "career_page", collector_id: "dimagi", integration: "ats_board", notes: "", enabled: true },
        { id: "automattic", label: "Automattic Careers", kind: "career_page", collector_id: "automattic", integration: "ats_board", notes: "", enabled: true },
        { id: "palantir", label: "Palantir Careers", kind: "career_page", collector_id: "palantir", integration: "ats_board", notes: "", enabled: true },
        { id: "redhat", label: "Red Hat Careers", kind: "career_page", collector_id: "redhat", integration: "ats_board", notes: "", enabled: true },
        { id: "tencent", label: "Tencent Careers", kind: "career_page", collector_id: "tencent", integration: "http_json", notes: "", enabled: true },
        { id: "hiring_cafe", label: "HiringCafe", kind: "platform", collector_id: "hiring_cafe", integration: "ssr_json", notes: "", enabled: true },
        { id: "linkedin", label: "LinkedIn", kind: "platform", collector_id: "linkedin", integration: "public_html", notes: "guest HTML", enabled: true },
      ],
    });
  }
  return getJSON<{ sources: CollectSource[] } | null>("/api/collect/sources", null);
}

/** Run mcp-jobs for the selected sources, then ingest into Job Pool. */
export async function collectJobs(body: {
  keywords: string;
  location: string;
  sources: string[];
  max_results: number;
  remote?: boolean | null;
  date_posted_days?: number | null;
  exclude_outsourcing: boolean;
  exclude_part_time: boolean;
  exclude_internship: boolean;
  custom_keywords: string;
  excluded_companies: string;
}): Promise<CollectOutcome | null> {
  if (demo.DEMO) {
    return {
      status: "completed",
      jobs_created: 0,
      jobs_updated: 0,
      raw_inserted: 0,
      invalid: 0,
      excluded: 0,
      source_results: [],
      errors: [],
      since: new Date().toISOString().slice(0, 10),
      message: "Demo mode — collection is not run",
      max_results: body.max_results,
    };
  }
  try {
    const res = await fetch(`${API_BASE}/api/collect/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as CollectOutcome;
  } catch {
    return null;
  }
}

/** Import mcp-jobs / collector JSON into jobs_raw then jobs. */
export async function ingestJobs(payload: unknown): Promise<IngestResult | null> {
  if (demo.DEMO) {
    return {
      raw_inserted: 0,
      jobs_created: 0,
      jobs_updated: 0,
      invalid: 0,
      skipped: 0,
      errors: [],
    };
  }
  try {
    const res = await fetch(`${API_BASE}/api/ingest/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return (await res.json()) as IngestResult;
  } catch {
    return null;
  }
}

/** Search for jobs across enabled (or specified) sources. Results are ephemeral. */
export async function searchJobs(query: JobQuery): Promise<SearchResponse | null> {
  if (demo.DEMO) return demo.demoSearch;
  try {
    const res = await fetch(`${API_BASE}/api/sources/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(query),
    });
    if (!res.ok) return null;
    return (await res.json()) as SearchResponse;
  } catch {
    return null;
  }
}

/**
 * Fetch all current openings from a company's public ATS board.
 * @param ats  One of "greenhouse", "lever", "ashby".
 * @param slug The company slug (e.g. "stripe", "linear").
 */
export async function fetchCompanyBoard(
  ats: string,
  slug: string,
): Promise<{ results: JobPosting[] } | null> {
  if (demo.DEMO) return { results: demo.demoJobs.slice(0, 3) };
  try {
    const res = await fetch(`${API_BASE}/api/sources/company`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ats, slug }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { results: JobPosting[] };
  } catch {
    return null;
  }
}

/** Build a cover-letter PDF and return the bytes. */
export async function buildCover(
  jobDescription = "",
  role = "",
  company = "",
  ai = false,
): Promise<BuildResult> {
  if (demo.DEMO)
    return { ok: false, detail: "PDF generation runs locally — clone the repo to build real PDFs." };
  try {
    const res = await fetch(`${API_BASE}/api/resume/cover`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ job_description: jobDescription, role, company, ai }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      return { ok: false, detail: body.detail ?? `Build failed (${res.status})` };
    }
    return { ok: true, blob: await res.blob() };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

export interface InterviewQuestion {
  category: string;
  question: string;
}

export interface InterviewQuestionsResponse {
  questions: InterviewQuestion[];
  source: "llm" | "deterministic";
  role_hint: string;
}

export interface InterviewQuestionsRequest {
  job_description?: string;
  role?: string;
  count?: number;
  ai?: boolean;
}

export async function getInterviewQuestions(
  req: InterviewQuestionsRequest,
): Promise<InterviewQuestionsResponse | null> {
  if (demo.DEMO) {
    return {
      questions: [
        { category: "Behavioural", question: "Tell me about a time you learned a new technology quickly." },
        { category: "Technical", question: "How would you design a scalable API for this role?" },
        { category: "Role-specific", question: "What's the most complex project you shipped end-to-end?" },
        { category: "Culture fit", question: "Why are you interested in this company specifically?" },
      ],
      source: "deterministic",
      role_hint: req.role ?? "Software Engineer",
    };
  }
  try {
    const res = await fetch(`${API_BASE}/api/interview/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(req),
    });
    if (!res.ok) return null;
    return (await res.json()) as InterviewQuestionsResponse;
  } catch {
    return null;
  }
}
