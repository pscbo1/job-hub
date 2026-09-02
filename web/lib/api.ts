/**
 * Typed client for the local Job Sentinel API (see src/job_sentinel/api/app.py).
 * Every call degrades gracefully: on any failure it returns a safe empty value
 * instead of throwing, so pages render an empty state rather than a crash.
 *
 * In the hosted demo (NEXT_PUBLIC_DEMO=1) the client returns bundled sample
 * data from lib/demo instead of calling a backend, so every screen is alive.
 */

import * as demo from "@/lib/demo";
import { uniqueApplicationTags } from "@/lib/applicationTags";
import { parseMarketId, sourceInMarket } from "@/lib/markets";
import type { CommonSearchFilters, SearchPreset } from "@/lib/searchCapabilities";
import { jobBelongsOnTasks } from "@/lib/taskBoard";

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

export type JobEngagement = "reference" | "under_study" | "to_do";
export type HubJobStatus = JobEngagement;

export interface TaskReminder {
  id: string;
  task_id: string;
  due_date: string;
  reminder_on: string;
  kind: "advance" | "due";
  enabled: boolean;
  created_at: string;
  in_app_triggered_at?: string | null;
  in_app_skipped_at?: string | null;
  read_at?: string | null;
}

export interface JobTask {
  id: string;
  job_id: string;
  title: string;
  due_at: string | null;
  done: boolean;
  sort_order: number;
  created_at: string;
  application_id?: string | null;
  notes?: string | null;
  source_url?: string | null;
  reminders?: TaskReminder[];
  attachments?: TaskAttachment[];
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  original_filename: string;
  file_ref: string;
  content_type: string;
  byte_size: number;
  created_at: string;
}

export interface JobTaskCreateBody {
  title: string;
  due_at?: string | null;
  notes?: string | null;
  source_url?: string | null;
  application_id?: string | null;
  reminders?: string[] | null;
}

export interface JobTaskPatch {
  title?: string;
  due_at?: string | null;
  done?: boolean;
  sort_order?: number;
  notes?: string | null;
  source_url?: string | null;
  reminders?: string[] | null;
}

export interface HubJob {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  source_note?: string;
  job_url: string;
  published_at: string | null;
  discovered_at: string;
  engagement: JobEngagement | null;
  status: JobEngagement | null;
  favorite?: boolean;
  reference?: boolean;
  comment?: string;
  contact?: string;
  next_step?: string;
  deadline?: string | null;
  follow_up_at?: string | null;
  dismissed_at?: string | null;
  archived_at?: string | null;
  application_id?: string | null;
  last_activity_at?: string | null;
  tasks?: JobTask[];
  comm_notes?: ApplicationCommNote[];
  match_score: number | null;
  salary?: string;
  description?: string;
  filter_state?: string;
  filter_reasons?: string[];
  market?: string;
  country?: string;
  country_name?: string;
  is_remote?: boolean;
  sponsorship?: SponsorshipInfo | null;
}

export type SponsorshipStatus = "explicit_yes" | "explicit_no" | "employer_eligible" | "unknown";

export interface SponsorshipEvidence {
  kind: string;
  rule?: string;
  snippet?: string;
  country?: string | null;
  registry_name?: string | null;
  registry_source?: string | null;
  matched_name?: string | null;
  matched_id?: string | null;
}

export interface SponsorshipInfo {
  status: SponsorshipStatus;
  country?: string | null;
  registry_match?: boolean;
  registry_name?: string | null;
  visa_route?: string | null;
  relocation_support?: boolean | null;
  evidence?: SponsorshipEvidence[];
  confidence?: number;
}

export type PoolFilterState = "included" | "excluded" | "all";

export interface JobsListQuery {
  market?: string;
  country?: string;
  sources?: string[];
  remote?: boolean;
  postedDays?: number | string;
  view?: "discover" | "tasks" | "my_jobs";
  includeDismissed?: boolean;
  includeArchived?: boolean;
  q?: string;
  hasDraft?: boolean;
}

export function getJobs(
  limit = 50,
  since?: string,
  filterState: PoolFilterState = "included",
  query: JobsListQuery = {},
): Promise<HubJob[]> {
  if (demo.DEMO) {
    let rows = demo.demoHubJobs;
    if (filterState === "excluded") {
      rows = rows.filter((j) => Boolean(j.dismissed_at) || j.filter_state === "excluded");
    } else if (filterState !== "all") {
      rows = rows.filter((j) => !j.dismissed_at && j.filter_state !== "excluded");
    }
    if (query.market) rows = rows.filter((j) => (j.market || "global") === query.market);
    if (query.country && query.country !== "all") rows = rows.filter((j) => (j.country || "") === query.country);
    if (query.remote) rows = rows.filter((j) => j.is_remote || (j.location || "").toLowerCase().includes("remote"));
    if (query.sources?.length) rows = rows.filter((j) => query.sources?.includes(j.source));
    if (query.view === "tasks" || query.view === "my_jobs") {
      rows = rows.filter((j) => jobBelongsOnTasks(j));
    }
    if (query.hasDraft === true) {
      rows = [];
    }
    return Promise.resolve(rows.slice(0, limit).map(withDemoCommNotes));
  }
  const q = new URLSearchParams({ limit: String(limit), filter_state: filterState });
  if (since) q.set("since", since);
  if (query.market) q.set("market", query.market);
  if (query.country && query.country !== "all") q.set("country", query.country);
  if (query.sources && query.sources.length > 0) q.set("sources", query.sources.join(","));
  if (query.remote) q.set("remote", "true");
  if (query.postedDays) q.set("posted_days", String(query.postedDays));
  if (query.view) q.set("view", query.view);
  if (query.includeDismissed) q.set("include_dismissed", "true");
  if (query.includeArchived) q.set("include_archived", "true");
  if (query.q) q.set("q", query.q);
  if (query.hasDraft === true) q.set("has_draft", "true");
  if (query.hasDraft === false) q.set("has_draft", "false");
  return getJSON<HubJob[]>(`/api/jobs?${q.toString()}`, []);
}

export async function patchHubJobStatus(
  jobId: string,
  status: JobEngagement | null,
): Promise<HubJob | null> {
  return patchHubJob(jobId, { engagement: status });
}

export async function patchHubJob(
  jobId: string,
  body: {
    engagement?: JobEngagement | null;
    favorite?: boolean;
    reference?: boolean;
    comment?: string;
    next_step?: string;
    deadline?: string | null;
    follow_up_at?: string | null;
  },
): Promise<HubJob | null> {
  if (demo.DEMO) {
    const current = demo.demoHubJobs.find((j) => j.id === jobId);
    if (!current) {
      return {
        id: jobId,
        title: "",
        company: "",
        location: "",
        source: "",
        job_url: "",
        published_at: null,
        discovered_at: "",
        engagement: body.engagement ?? null,
        status: body.engagement ?? null,
        favorite: body.favorite,
        match_score: null,
      };
    }
    const next: HubJob = {
      ...current,
        engagement: body.engagement !== undefined ? body.engagement : current.engagement,
        status: body.engagement !== undefined ? body.engagement : current.status,
        favorite: body.favorite !== undefined ? body.favorite : current.favorite,
        reference: body.reference !== undefined ? body.reference : current.reference,
      comment: body.comment !== undefined ? body.comment : current.comment,
      next_step: body.next_step !== undefined ? body.next_step : current.next_step,
      deadline: body.deadline !== undefined ? body.deadline : current.deadline,
      follow_up_at: body.follow_up_at !== undefined ? body.follow_up_at : current.follow_up_at,
      tasks: current.tasks,
    };
    Object.assign(current, next);
    for (const row of demo.demoApplications) {
      if (row.job_id !== jobId) continue;
      if (body.next_step !== undefined) row.next_step = body.next_step;
      if (body.deadline !== undefined) row.job_deadline = body.deadline ?? "";
      if (body.comment !== undefined) row.job_comment = body.comment;
    }
    return next;
  }
  try {
    const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as HubJob;
  } catch {
    return null;
  }
}

async function postJobAction(jobId: string, action: string, body: object = {}): Promise<HubJob | null> {
  if (demo.DEMO) {
    const referenced = action === "reference" ? true : action === "unreference" ? false : undefined;
    const favorite = action === "save" ? true : action === "unsave" ? false : undefined;
    const dismissed = action === "dismiss" ? new Date().toISOString() : null;
    return {
      id: jobId,
      title: "",
      company: "",
      location: "",
      source: "",
      job_url: "",
      published_at: null,
      discovered_at: "",
      engagement: action === "dismiss" ? null : null,
      status: action === "dismiss" ? null : null,
      favorite: action === "dismiss" ? false : favorite,
      reference: action === "dismiss" ? false : referenced,
      dismissed_at: dismissed,
      match_score: null,
      filter_state: action === "dismiss" ? "excluded" : "included",
      filter_reasons: action === "dismiss" ? ["manual_dismiss"] : [],
    };
  }
  try {
    const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as HubJob;
  } catch {
    return null;
  }
}

export function saveHubJob(jobId: string): Promise<HubJob | null> {
  return postJobAction(jobId, "save");
}
export function unsaveHubJob(jobId: string): Promise<HubJob | null> {
  return postJobAction(jobId, "unsave");
}
export function referenceHubJob(jobId: string): Promise<HubJob | null> {
  return postJobAction(jobId, "reference");
}
export function unreferenceHubJob(jobId: string): Promise<HubJob | null> {
  return postJobAction(jobId, "unreference");
}
export function archiveHubJob(jobId: string, reason = ""): Promise<HubJob | null> {
  return postJobAction(jobId, "archive", { reason });
}
export function unarchiveHubJob(jobId: string): Promise<HubJob | null> {
  return postJobAction(jobId, "unarchive");
}

export interface ArchiveSettings {
  enabled: boolean;
  idle_days: number;
}

export function getArchiveSettings(): Promise<ArchiveSettings> {
  if (demo.DEMO) return Promise.resolve({ enabled: false, idle_days: 14 });
  return getJSON<ArchiveSettings>("/api/archive-settings", { enabled: false, idle_days: 14 });
}

export async function putArchiveSettings(
  body: ArchiveSettings,
): Promise<ArchiveSettings | null> {
  if (demo.DEMO) return body;
  try {
    const res = await fetch(`${API_BASE}/api/archive-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as ArchiveSettings;
  } catch {
    return null;
  }
}

export interface IdleCleanupSettings {
  enabled: boolean;
  idle_days: number;
}

export function getIdleCleanupSettings(): Promise<IdleCleanupSettings> {
  if (demo.DEMO) return Promise.resolve({ enabled: true, idle_days: 14 });
  return getJSON<IdleCleanupSettings>("/api/idle-cleanup-settings", {
    enabled: false,
    idle_days: 14,
  });
}

export async function putIdleCleanupSettings(
  body: IdleCleanupSettings,
): Promise<IdleCleanupSettings | null> {
  if (demo.DEMO) return body;
  try {
    const res = await fetch(`${API_BASE}/api/idle-cleanup-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as IdleCleanupSettings;
  } catch {
    return null;
  }
}

export type MaterialKind =
  | "resume"
  | "cover_letter"
  | "portfolio"
  | "transcript"
  | "other"
  | "message_template"
  | "application_answer";

export interface MaterialVersion {
  id: string;
  material_id: string;
  version_number: number;
  version_label: string;
  version_date?: string | null;
  purpose: string[];
  file_ref: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  url: string;
  notes: string;
  text?: string;
  archived_at?: string | null;
  created_at: string;
  display_label?: string;
}

export interface Material {
  id: string;
  title: string;
  kind: string;
  direction?: string | null;
  language?: "zh" | "en" | null;
  purpose: string[];
  notes: string;
  is_pinned?: boolean;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  versions: MaterialVersion[];
}

export interface PacketItem {
  binding: {
    id: string;
    application_id: string;
    material_id: string;
    material_version_id: string;
    sort_order: number;
    created_at: string;
  };
  material: Material | null;
  version: MaterialVersion | null;
}

export function getMaterials(includeArchived = false): Promise<Material[]> {
  if (demo.DEMO) {
    return Promise.resolve(
      includeArchived ? demo.demoMaterials : demo.demoMaterials.filter((m) => !m.archived_at),
    );
  }
  const q = includeArchived ? "?include_archived=true" : "";
  return getJSON<Material[]>(`/api/materials${q}`, []);
}

export async function getMaterial(id: string, includeArchived = true): Promise<Material | null> {
  if (demo.DEMO) {
    return demo.demoMaterials.find((m) => m.id === id) ?? null;
  }
  return getJSON<Material | null>(
    `/api/materials/${encodeURIComponent(id)}?include_archived=${includeArchived ? "true" : "false"}`,
    null,
  );
}

export async function createMaterial(body: {
  title: string;
  kind?: string;
  purpose?: string[];
  notes?: string;
  url?: string;
  version_label?: string;
  version_purpose?: string[];
  version_notes?: string;
  content?: string;
  direction?: string | null;
  language?: "zh" | "en" | null;
  version_date?: string | null;
  request_id?: string;
}): Promise<Material | null> {
  if (demo.DEMO) {
    const created = demo.makeDemoMaterial(body);
    demo.demoMaterials.unshift(created);
    return created;
  }
  try {
    const res = await fetch(`${API_BASE}/api/materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as Material;
  } catch {
    return null;
  }
}

export async function uploadMaterial(form: FormData): Promise<Material | null> {
  if (demo.DEMO) {
    const title = String(form.get("title") || "Uploaded file");
    const created = demo.makeDemoMaterial({ title, kind: String(form.get("kind") || "other") });
    demo.demoMaterials.unshift(created);
    return created;
  }
  try {
    const res = await fetch(`${API_BASE}/api/materials/upload`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: form,
    });
    if (!res.ok) return null;
    return (await res.json()) as Material;
  } catch {
    return null;
  }
}

export async function patchMaterial(
  id: string,
  body: { title?: string; kind?: string; purpose?: string[]; notes?: string; is_pinned?: boolean },
): Promise<Material | null> {
  if (demo.DEMO) {
    const found = demo.demoMaterials.find((m) => m.id === id);
    if (!found) return null;
    Object.assign(found, body, { updated_at: new Date().toISOString() });
    return found;
  }
  try {
    const res = await fetch(`${API_BASE}/api/materials/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as Material;
  } catch {
    return null;
  }
}

export interface MaterialUseItem {
  material_id: string;
  material_version_id: string;
  material_title: string;
  kind: string;
  version_label: string;
  version_date?: string | null;
  block_key: string | null;
  block_title: string | null;
  heading_path: string[];
  purpose: string[];
  original_filename: string;
  has_file: boolean;
  url: string | null;
  copy_text: string | null;
  preview_text: string;
  is_pinned: boolean;
  archived: boolean;
  unavailable_reason: string | null;
}

export interface MaterialUsePresetItem {
  material_version_id: string;
  block_key: string | null;
}

export interface MaterialUsePreset {
  id: string;
  name: string;
  items: MaterialUsePresetItem[];
  revision: number;
  created_at: string;
  updated_at: string;
}

export async function getMaterialUseItems(query: {
  query?: string;
  purpose?: string;
  application_id?: string;
  preset_id?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: MaterialUseItem[]; total: number; has_more: boolean }> {
  const empty = { items: [], total: 0, has_more: false };
  if (demo.DEMO) return demo.demoMaterialUseItems(query);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, String(value));
  return getJSON(`/api/material-use-items?${params.toString()}`, empty);
}

export async function getMaterialVersionUseItems(versionId: string): Promise<MaterialUseItem[]> {
  if (demo.DEMO) {
    return demo.demoMaterialUseItems().items.filter((item) => item.material_version_id === versionId);
  }
  const data = await getJSON<{ items?: MaterialUseItem[] }>(
    `/api/material-versions/${encodeURIComponent(versionId)}/use-items`,
    { items: [] },
  );
  return data.items ?? [];
}

export async function listMaterialUsePresets(): Promise<MaterialUsePreset[]> {
  if (demo.DEMO) return demo.listDemoMaterialUsePresets();
  return getJSON<MaterialUsePreset[]>("/api/material-use-presets", []);
}

export async function createMaterialUsePreset(
  name: string,
  items: MaterialUsePresetItem[],
): Promise<MaterialUsePreset | null> {
  if (demo.DEMO) return demo.createDemoMaterialUsePreset(name, items);
  try {
    const res = await fetch(`${API_BASE}/api/material-use-presets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, items }),
    });
    if (!res.ok) return null;
    return (await res.json()) as MaterialUsePreset;
  } catch {
    return null;
  }
}

export async function updateMaterialUsePreset(
  id: string,
  body: { name: string; items: MaterialUsePresetItem[]; expected_revision: number },
): Promise<MaterialUsePreset | null> {
  if (demo.DEMO) return demo.updateDemoMaterialUsePreset(id, body);
  try {
    const res = await fetch(`${API_BASE}/api/material-use-presets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as MaterialUsePreset;
  } catch {
    return null;
  }
}

export async function deleteMaterialUsePreset(id: string, expectedRevision: number): Promise<boolean> {
  if (demo.DEMO) return demo.deleteDemoMaterialUsePreset(id, expectedRevision);
  try {
    const res = await fetch(
      `${API_BASE}/api/material-use-presets/${encodeURIComponent(id)}?expected_revision=${expectedRevision}`,
      { method: "DELETE", headers: authHeaders() },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function archiveMaterial(id: string, restore = false): Promise<Material | null> {
  if (demo.DEMO) {
    const found = demo.demoMaterials.find((m) => m.id === id);
    if (!found) return null;
    found.archived_at = restore ? null : new Date().toISOString();
    return found;
  }
  try {
    const res = await fetch(
      `${API_BASE}/api/materials/${encodeURIComponent(id)}/${restore ? "restore" : "archive"}`,
      { method: "POST", headers: { ...authHeaders() } },
    );
    if (!res.ok) return null;
    return (await res.json()) as Material;
  } catch {
    return null;
  }
}

export async function addMaterialVersion(
  materialId: string,
  body: { url?: string; version_label?: string; purpose?: string[]; notes?: string; content?: string },
): Promise<MaterialVersion | null> {
  if (demo.DEMO) {
    const found = demo.demoMaterials.find((m) => m.id === materialId);
    if (!found) return null;
    const version = demo.makeDemoVersion(found, body);
    found.versions.unshift(version);
    return version;
  }
  try {
    const res = await fetch(`${API_BASE}/api/materials/${encodeURIComponent(materialId)}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as MaterialVersion;
  } catch {
    return null;
  }
}

export async function uploadMaterialVersion(
  materialId: string,
  form: FormData,
): Promise<MaterialVersion | null> {
  if (demo.DEMO) {
    const found = demo.demoMaterials.find((m) => m.id === materialId);
    if (!found) return null;
    const version = demo.makeDemoVersion(found, { version_label: String(form.get("version_label") || "") });
    found.versions.unshift(version);
    return version;
  }
  try {
    const res = await fetch(
      `${API_BASE}/api/materials/${encodeURIComponent(materialId)}/versions/upload`,
      { method: "POST", headers: { ...authHeaders() }, body: form },
    );
    if (!res.ok) return null;
    return (await res.json()) as MaterialVersion;
  } catch {
    return null;
  }
}

export function materialVersionFileUrl(versionId: string): string {
  return `${API_BASE}/api/material-versions/${encodeURIComponent(versionId)}/file`;
}

export function submissionSnapshotFileUrl(
  appId: string,
  submissionId: string,
  index: number,
  revision?: number,
): string {
  const suffix = revision === undefined ? "" : `?revision=${revision}`;
  return `${API_BASE}/api/applications/${encodeURIComponent(appId)}/submissions/${encodeURIComponent(submissionId)}/items/${index}/file${suffix}`;
}

export async function getPacket(appId: string): Promise<PacketItem[]> {
  const result = await loadPacket(appId);
  return result.ok ? result.items : [];
}

/** Distinguish empty packet from fetch failure (DBG-02 Retry vs empty). */
export async function loadPacket(
  appId: string,
  signal?: AbortSignal,
): Promise<{ ok: true; items: PacketItem[] } | { ok: false }> {
  if (demo.DEMO) return { ok: true, items: demo.demoPacketFor(appId) };
  try {
    const res = await fetch(`${API_BASE}/api/applications/${encodeURIComponent(appId)}/packet`, {
      cache: "no-store",
      headers: authHeaders(),
      signal,
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { items?: PacketItem[] };
    return { ok: true, items: data.items ?? [] };
  } catch {
    if (signal?.aborted) return { ok: false };
    return { ok: false };
  }
}

export async function replacePacket(appId: string, versionIds: string[]): Promise<PacketItem[]> {
  if (demo.DEMO) {
    demo.setDemoPacket(appId, versionIds);
    return demo.demoPacketFor(appId);
  }
  try {
    const res = await fetch(`${API_BASE}/api/applications/${encodeURIComponent(appId)}/packet`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ material_version_ids: versionIds }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items: PacketItem[] };
    return data.items;
  } catch {
    return [];
  }
}

export async function addPacketBinding(appId: string, versionId: string): Promise<boolean> {
  if (demo.DEMO) {
    const current = demo.demoPacketFor(appId).map((item) => item.binding.material_version_id);
    if (!current.includes(versionId)) demo.setDemoPacket(appId, [...current, versionId]);
    return true;
  }
  try {
    const res = await fetch(
      `${API_BASE}/api/applications/${encodeURIComponent(appId)}/packet/bindings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ material_version_id: versionId }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function changePacketVersion(
  appId: string,
  bindingId: string,
  versionId: string,
): Promise<boolean> {
  if (demo.DEMO) {
    demo.changeDemoPacketVersion(appId, bindingId, versionId);
    return true;
  }
  try {
    const res = await fetch(
      `${API_BASE}/api/applications/${encodeURIComponent(appId)}/packet/bindings/${encodeURIComponent(bindingId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ material_version_id: versionId }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function removePacketBinding(appId: string, bindingId: string): Promise<boolean> {
  if (demo.DEMO) {
    demo.removeDemoPacketBinding(appId, bindingId);
    return true;
  }
  try {
    const res = await fetch(
      `${API_BASE}/api/applications/${encodeURIComponent(appId)}/packet/bindings/${encodeURIComponent(bindingId)}`,
      { method: "DELETE", headers: { ...authHeaders() } },
    );
    return res.ok;
  } catch {
    return false;
  }
}

function demoJobById(jobId: string): HubJob | undefined {
  return demo.demoHubJobs.find((j) => j.id === jobId);
}

function withDemoCommNotes(job: HubJob): HubJob {
  return {
    ...job,
    comm_notes: demo.listDemoCommNotesForJob(job.id),
    contact: demo.leftoverDemoJobContact(job.id) || job.contact || "",
  };
}

export async function listJobCommNotes(jobId: string): Promise<ApplicationCommNote[]> {
  if (demo.DEMO) return demo.listDemoCommNotesForJob(jobId);
  return getJSON<ApplicationCommNote[]>(
    `/api/jobs/${encodeURIComponent(jobId)}/comm-notes`,
    [],
  );
}

export function leftoverJobContact(jobId: string, initial = ""): string {
  if (demo.DEMO) return demo.leftoverDemoJobContact(jobId) || initial;
  return initial;
}

export function getHubJob(jobId: string): Promise<HubJob | null> {
  if (demo.DEMO) {
    return Promise.resolve(demoJobById(jobId) ?? null);
  }
  return getJSON<HubJob | null>(`/api/jobs/${encodeURIComponent(jobId)}`, null);
}

export type ReminderInboxView = "unread" | "all";

export interface ReminderInboxItem {
  id: string;
  task_id: string;
  job_id: string;
  task_title: string;
  job_title: string;
  company: string;
  reminder_on: string;
  due_date: string;
  kind: "advance" | "due";
  due_status: "upcoming" | "due_today" | "overdue";
  read_at?: string | null;
  in_app_triggered_at?: string | null;
  market?: string;
}

export interface ReminderInbox {
  items: ReminderInboxItem[];
  unread_count: number;
  total: number;
  today: string;
  tz: string;
}

function notifyRemindersChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("job-hub:reminders-refresh"));
}

export async function syncReminders(): Promise<ReminderInbox["today"] | null> {
  if (demo.DEMO) return todayFallback();
  try {
    const res = await fetch(`${API_BASE}/api/reminders/sync`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { today?: string };
    return body.today ?? null;
  } catch {
    return null;
  }
}

function todayFallback(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listReminders(query: {
  view?: ReminderInboxView;
  market?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ReminderInbox> {
  const empty: ReminderInbox = {
    items: [],
    unread_count: 0,
    total: 0,
    today: todayFallback(),
    tz: "Asia/Shanghai",
  };
  if (demo.DEMO) return demo.listDemoReminders(query.view ?? "unread");
  const q = new URLSearchParams({ view: query.view ?? "unread" });
  if (query.market) q.set("market", query.market);
  if (query.limit) q.set("limit", String(query.limit));
  if (query.offset) q.set("offset", String(query.offset));
  return getJSON<ReminderInbox>(`/api/reminders?${q.toString()}`, empty);
}

export async function markReminderRead(reminderId: string): Promise<TaskReminder | null> {
  if (demo.DEMO) return demo.markDemoReminderRead(reminderId);
  try {
    const res = await fetch(
      `${API_BASE}/api/reminders/${encodeURIComponent(reminderId)}/read`,
      { method: "PATCH", headers: authHeaders() },
    );
    if (!res.ok) return null;
    return (await res.json()) as TaskReminder;
  } catch {
    return null;
  }
}

export async function listJobTasks(jobId: string): Promise<JobTask[]> {
  if (demo.DEMO) {
    return demoJobById(jobId)?.tasks ?? [];
  }
  return getJSON<JobTask[]>(`/api/jobs/${encodeURIComponent(jobId)}/tasks`, []);
}

export async function createJobTask(
  jobId: string,
  body: JobTaskCreateBody,
): Promise<JobTask | null> {
  if (demo.DEMO) {
    const job = demoJobById(jobId);
    const created: JobTask = {
      id: `demo-task-${Date.now()}`,
      job_id: jobId,
      title: body.title,
      due_at: body.due_at ?? null,
      done: false,
      sort_order: job?.tasks?.length ?? 0,
      created_at: new Date().toISOString(),
      notes: body.notes ?? null,
      source_url: body.source_url ?? null,
      application_id: body.application_id ?? null,
      reminders: (body.reminders ?? []).map((day) => ({
        id: `demo-rem-${day}`,
        task_id: `demo-task-${Date.now()}`,
        due_date: body.due_at ?? day,
        reminder_on: day,
        kind: day === (body.due_at ?? "") ? ("due" as const) : ("advance" as const),
        enabled: true,
        created_at: new Date().toISOString(),
      })),
      attachments: [],
    };
    if (job) job.tasks = [...(job.tasks ?? []), created];
    notifyRemindersChanged();
    return created;
  }
  try {
    const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const created = (await res.json()) as JobTask;
    notifyRemindersChanged();
    return created;
  } catch {
    return null;
  }
}

export async function patchJobTask(
  jobId: string,
  taskId: string,
  patch: JobTaskPatch,
): Promise<JobTask | null> {
  if (demo.DEMO) {
    const job = demoJobById(jobId);
    const current = (job?.tasks ?? []).find((t) => t.id === taskId);
    if (!current) return null;
    const saved: JobTask = {
      ...current,
      title: patch.title ?? current.title,
      due_at: patch.due_at !== undefined ? patch.due_at : current.due_at,
      done: patch.done ?? current.done,
      sort_order: patch.sort_order ?? current.sort_order,
      notes: patch.notes !== undefined ? patch.notes : current.notes,
      source_url: patch.source_url !== undefined ? patch.source_url : current.source_url,
    };
    if (job) job.tasks = (job.tasks ?? []).map((t) => (t.id === taskId ? saved : t));
    notifyRemindersChanged();
    return saved;
  }
  try {
    const res = await fetch(
      `${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/tasks/${encodeURIComponent(taskId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(patch),
      },
    );
    if (!res.ok) return null;
    const saved = (await res.json()) as JobTask;
    notifyRemindersChanged();
    return saved;
  } catch {
    return null;
  }
}

export async function deleteJobTask(jobId: string, taskId: string): Promise<boolean> {
  if (demo.DEMO) {
    const job = demoJobById(jobId);
    if (job) job.tasks = (job.tasks ?? []).filter((t) => t.id !== taskId);
    notifyRemindersChanged();
    return true;
  }
  try {
    const res = await fetch(
      `${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: "DELETE", headers: authHeaders() },
    );
    if (res.ok) notifyRemindersChanged();
    return res.ok;
  } catch {
    return false;
  }
}

export async function startApplicationForJob(
  jobId: string,
): Promise<{ job: HubJob; application: Application } | null> {
  if (demo.DEMO) return demo.startDemoApplication(jobId);
  try {
    const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/start-application`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
    if (!res.ok) return null;
    return (await res.json()) as { job: HubJob; application: Application };
  } catch {
    return null;
  }
}

export async function dismissHubJob(jobId: string): Promise<HubJob | null> {
  const job = await postJobAction(jobId, "dismiss");
  if (demo.DEMO && job) {
        return { ...job, filter_state: "excluded", filter_reasons: ["manual_dismiss"], favorite: false, reference: false, engagement: null, status: null };
  }
  return job;
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
      engagement: null,
      status: null,
      favorite: false,
      dismissed_at: null,
      match_score: null,
      filter_state: "included",
      filter_reasons: [],
    };
  }
  return postJobAction(jobId, "undismiss");
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

export type ApplicationStage = "draft" | "applied" | "interview" | "offer" | "closed";

export type CloseReason = "not_selected" | "no_response" | "withdrew" | "other";

export const CLOSE_REASON_LABELS_ZH: Record<CloseReason, string> = {
  not_selected: "未录用",
  no_response: "无回复",
  withdrew: "主动结束",
  other: "其他",
};

export interface PacketSnapshotItem {
  binding_id: string;
  material_id: string;
  material_version_id: string;
  title: string;
  kind: string;
  version_number: number;
  version_label: string;
  original_filename: string;
  file_ref: string;
  snapshot_file_ref?: string;
  url: string;
  material_purpose: string[];
  version_purpose: string[];
  material_notes: string;
  version_notes: string;
}

export interface ApplicationSubmission {
  id: string;
  application_id: string;
  submitted_at: string;
  channel: string;
  packet_snapshot?: {
    binding_ids: string[];
    material_version_ids: string[];
    items?: PacketSnapshotItem[];
    note: string;
  };
  notes: string;
  idempotency_key?: string;
  effective_packet_snapshot?: NonNullable<ApplicationSubmission["packet_snapshot"]>;
  material_revision?: number;
  materials_corrected_at?: string | null;
}

export interface ProfileVersion {
  id: string;
  version_number: number;
  profile?: Profile;
  profile_schema_version: number;
  version_label: string;
  notes: string;
  version_date: string;
  created_at: string;
  request_id: string;
  request_hash: string;
}

export function getProfileVersions(limit = 100): Promise<ProfileVersion[]> {
  if (demo.DEMO) return Promise.resolve([]);
  return getJSON<ProfileVersion[]>(`/api/profile/versions?limit=${limit}`, []);
}

export async function createProfileVersion(body: {
  version_label?: string;
  notes?: string;
  version_date?: string;
  request_id?: string;
}): Promise<{ version: ProfileVersion | null; status: number }> {
  if (demo.DEMO) return { version: null, status: 0 };
  try {
    const res = await fetch(`${API_BASE}/api/profile/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    return {
      version: res.ok ? ((await res.json()) as ProfileVersion) : null,
      status: res.status,
    };
  } catch {
    return { version: null, status: 0 };
  }
}

export function profileVersionFileUrl(versionId: string): string {
  return `${API_BASE}/api/profile/versions/${encodeURIComponent(versionId)}/file`;
}

export async function uploadTaskAttachment(
  jobId: string,
  taskId: string,
  file: File,
): Promise<TaskAttachment | null> {
  if (demo.DEMO) return null;
  const form = new FormData();
  form.set("file", file);
  try {
    const res = await fetch(
      `${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/tasks/${encodeURIComponent(taskId)}/attachments`,
      { method: "POST", headers: authHeaders(), body: form },
    );
    return res.ok ? ((await res.json()) as TaskAttachment) : null;
  } catch {
    return null;
  }
}

export async function deleteTaskAttachment(
  jobId: string,
  taskId: string,
  attachmentId: string,
): Promise<boolean> {
  if (demo.DEMO) return false;
  try {
    const res = await fetch(
      `${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { method: "DELETE", headers: authHeaders() },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export function taskAttachmentFileUrl(jobId: string, taskId: string, attachmentId: string): string {
  const taskPath = `/api/jobs/${encodeURIComponent(jobId)}/tasks/${encodeURIComponent(taskId)}`;
  return `${API_BASE}${taskPath}/attachments/${encodeURIComponent(attachmentId)}/file`;
}

export interface SubmissionMaterialHistoryEntry {
  revision: number;
  packet_snapshot: NonNullable<ApplicationSubmission["packet_snapshot"]>;
  created_at: string;
  note: string;
}

export interface MaterialRevisionResult {
  submission_id: string;
  material_revision: number;
  packet_snapshot: NonNullable<ApplicationSubmission["packet_snapshot"]>;
  created_at: string;
  note: string;
}

export function effectiveSubmissionSnapshot(
  submission: ApplicationSubmission,
): NonNullable<ApplicationSubmission["packet_snapshot"]> {
  return submission.effective_packet_snapshot ?? submission.packet_snapshot ?? {
    binding_ids: [],
    material_version_ids: [],
    items: [],
    note: "",
  };
}

export async function listSubmissionMaterialRevisions(
  appId: string,
  submissionId: string,
): Promise<SubmissionMaterialHistoryEntry[]> {
  if (demo.DEMO) return demo.listDemoSubmissionMaterialRevisions(submissionId);
  const data = await getJSON<{ revisions?: SubmissionMaterialHistoryEntry[] }>(
    `/api/applications/${encodeURIComponent(appId)}/submissions/${encodeURIComponent(submissionId)}/material-revisions`,
    { revisions: [] },
  );
  return data.revisions ?? [];
}

export async function createSubmissionMaterialRevision(
  appId: string,
  submissionId: string,
  body: {
    expected_revision: number;
    items: Array<{ retain_item_index?: number; material_version_id?: string }>;
    confirm_empty?: boolean;
    note?: string;
    idempotency_key: string;
  },
): Promise<{ ok: true; result: MaterialRevisionResult } | { ok: false; code: string; message: string }> {
  if (demo.DEMO) {
    return demo.createDemoSubmissionMaterialRevision(
      submissionId,
      body.expected_revision,
      body.items,
      Boolean(body.confirm_empty),
      body.note ?? "",
    );
  }
  try {
    const res = await fetch(
      `${API_BASE}/api/applications/${encodeURIComponent(appId)}/submissions/${encodeURIComponent(submissionId)}/material-revisions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { detail?: { code?: string; message?: string }; [key: string]: unknown };
    if (!res.ok) return { ok: false, code: data.detail?.code ?? "request_failed", message: data.detail?.message ?? "Could not save correction." };
    return { ok: true, result: data as unknown as MaterialRevisionResult };
  } catch {
    return { ok: false, code: "network_error", message: "Could not save correction." };
  }
}

export interface ApplicationCommNote {
  id: string;
  application_id?: string | null;
  job_id?: string | null;
  body: string;
  created_at: string;
}

export interface Application {
  id: string;
  job_id?: string | null;
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
  /** Optional free-text contact. Empty is allowed. Not required to mark submitted. */
  contact?: string;
  /** Optional free-text direction tags. Not shown as a list column. */
  tags?: string[];
  close_reason?: CloseReason | null;
  close_note?: string;
  stale_applied?: boolean;
  exclude_from_idle?: boolean;
  posting_id: string | null;
  resume_document_id: string | null;
  created_at: string;
  updated_at: string;
  raw_data: Record<string, unknown>;
  submissions?: ApplicationSubmission[];
  current_material_count?: number;
  comm_notes?: ApplicationCommNote[];
  /** Job.next_step projection. Not stored on the application row. */
  next_step?: string;
  /** Job.deadline (YYYY-MM-DD). Distinct from Application.deadline. */
  job_deadline?: string;
  job_description?: string;
  /** Job.comment (research notes). Never merged with Application.notes. */
  job_comment?: string;
  /** Stored apply URL from ingest payload when present. Never inferred. */
  apply_url?: string;
  /** Job.job_url / canonical_url projection for Open source. */
  job_url?: string;
}

export interface ApplicationCreateBody {
  job_id?: string;
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

export interface ManualApplicationCreateBody {
  request_id: string;
  title: string;
  company: string;
  job_url?: string;
  location?: string;
  source_note?: string;
  market?: "cn" | "en";
  create_separately?: boolean;
}

export interface ManualApplicationDuplicate {
  job: Pick<HubJob, "id" | "title" | "company" | "location" | "job_url" | "market">;
  application: { id: string; stage: ApplicationStage; deleted: boolean } | null;
}

export type ManualApplicationCreateResult =
  | {
      ok: true;
      job: HubJob;
      application: Application;
      replayed: boolean;
    }
  | { ok: false; kind: "validation"; fields: Record<string, string> }
  | { ok: false; kind: "duplicate"; duplicate: ManualApplicationDuplicate }
  | { ok: false; kind: "cancelled" }
  | { ok: false; kind: "network"; message: string };

export async function createManualApplication(
  body: ManualApplicationCreateBody,
): Promise<ManualApplicationCreateResult> {
  if (demo.DEMO) {
    const created = demo.createDemoManualApplication(body);
    if (!created) {
      return { ok: false, kind: "network", message: "Could not create this demo application." };
    }
    return { ok: true, ...created };
  }
  try {
    const response = await fetch(`${API_BASE}/api/applications/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      job?: HubJob | null;
      application?: Application | null;
      replayed?: boolean;
      cancelled?: boolean;
      detail?:
        | string
        | {
            code?: string;
            message?: string;
            duplicate_candidate?: ManualApplicationDuplicate | null;
          }
        | Array<{ loc?: Array<string | number>; msg?: string }>;
    };
    if (response.ok && payload.cancelled) return { ok: false, kind: "cancelled" };
    if (response.ok && payload.job && payload.application) {
      return {
        ok: true,
        job: payload.job,
        application: payload.application,
        replayed: payload.replayed === true,
      };
    }
    if (
      response.status === 409 &&
      !Array.isArray(payload.detail) &&
      typeof payload.detail === "object" &&
      payload.detail?.code === "duplicate_candidate" &&
      payload.detail.duplicate_candidate
    ) {
      return {
        ok: false,
        kind: "duplicate",
        duplicate: payload.detail.duplicate_candidate,
      };
    }
    if (response.status === 422 && Array.isArray(payload.detail)) {
      const fields: Record<string, string> = {};
      for (const issue of payload.detail) {
        const field = String(issue.loc?.at(-1) ?? "form");
        if (!fields[field]) fields[field] = issue.msg ?? "Check this field";
      }
      return { ok: false, kind: "validation", fields };
    }
    const detail = typeof payload.detail === "string" ? payload.detail : "";
    return {
      ok: false,
      kind: "network",
      message: detail || `Could not create draft (${response.status})`,
    };
  } catch {
    return {
      ok: false,
      kind: "network",
      message: "Could not reach the local API. Your draft was not created.",
    };
  }
}

export interface ApplicationPatch {
  stage?: ApplicationStage;
  notes?: string;
  contact?: string;
  tags?: string[];
  applied_date?: string;
  deadline?: string;
  salary?: string;
  resume_document_id?: string | null;
  title?: string;
  employer?: string;
  location?: string;
  url?: string;
  source?: string;
  exclude_from_idle?: boolean;
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
  query: { view?: "open" | "closed" | "all"; staleApplied?: boolean; tag?: string } = {},
): Promise<Application[]> {
  if (demo.DEMO) {
    let rows = demo.demoApplications;
    if (stage) rows = rows.filter((a) => a.stage === stage);
    if (query.view === "open") {
      rows = rows.filter((a) => a.stage !== "closed");
    } else if (query.view === "closed") {
      rows = rows.filter((a) => a.stage === "closed");
    }
    if (query.staleApplied) {
      rows = rows.filter((a) => a.stale_applied && !a.exclude_from_idle && a.stage === "applied");
    }
    if (query.tag) {
      const wanted = query.tag;
      rows = rows.filter((a) =>
        (a.tags ?? []).some((tag) => tag.toLowerCase() === wanted.toLowerCase()),
      );
    }
    return Promise.resolve(rows);
  }
  const params = new URLSearchParams();
  if (stage) params.set("stage", stage);
  params.set("limit", String(limit));
  if (query.view && query.view !== "all") params.set("view", query.view);
  if (query.staleApplied) params.set("stale_applied", "true");
  if (query.tag) params.set("tag", query.tag);
  return getJSON<Application[]>(`/api/applications?${params}`, []);
}

export async function listApplicationTags(): Promise<string[]> {
  if (demo.DEMO) return uniqueApplicationTags(demo.demoApplications);
  const payload = await getJSON<{ tags: string[] }>("/api/applications/tags", { tags: [] });
  return payload.tags ?? [];
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
      stage: body.stage ?? "draft",
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
  if (demo.DEMO) {
    return Promise.resolve(demo.demoApplications.find((row) => row.id === id) ?? null);
  }
  return getJSON<Application | null>(`/api/applications/${encodeURIComponent(id)}`, null);
}

/** Partially update a tracked application. */
export async function updateApplication(
  id: string,
  patch: ApplicationPatch,
): Promise<Application | null> {
  if (demo.DEMO) {
    const found = demo.demoApplications.find((a) => a.id === id);
    if (!found) return Promise.resolve(null);
    Object.assign(found, patch);
    return Promise.resolve({ ...found });
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

export type SubmitResult =
  | { ok: true; application: Application }
  | { ok: false; code: string; message: string };

export async function submitApplication(
  id: string,
  body: {
    channel?: string;
    notes?: string;
    confirm_empty?: boolean;
    expected_version_ids?: string[] | null;
    idempotency_key?: string;
  } = {},
): Promise<SubmitResult> {
  if (demo.DEMO) {
    return demo.recordDemoSubmissionResult(id, body);
  }
  try {
    const res = await fetch(`${API_BASE}/api/applications/${encodeURIComponent(id)}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      return { ok: true, application: (await res.json()) as Application };
    }
    const payload = (await res.json().catch(() => null)) as
      | { detail?: string | { code?: string; message?: string } }
      | null;
    const detail = payload?.detail;
    if (detail && typeof detail === "object") {
      return {
        ok: false,
        code: detail.code || "error",
        message: detail.message || "Could not record submission",
      };
    }
    return { ok: false, code: "error", message: typeof detail === "string" ? detail : "Could not record submission" };
  } catch {
    return { ok: false, code: "error", message: "Could not record submission" };
  }
}

export async function listCommNotes(appId: string): Promise<ApplicationCommNote[]> {
  const result = await loadCommNotes(appId);
  return result.ok ? result.notes : [];
}

export async function loadCommNotes(
  appId: string,
  signal?: AbortSignal,
): Promise<{ ok: true; notes: ApplicationCommNote[] } | { ok: false }> {
  if (demo.DEMO) return { ok: true, notes: demo.listDemoCommNotes(appId) };
  try {
    const res = await fetch(
      `${API_BASE}/api/applications/${encodeURIComponent(appId)}/comm-notes`,
      { cache: "no-store", headers: authHeaders(), signal },
    );
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as ApplicationCommNote[];
    return { ok: true, notes: Array.isArray(data) ? data : [] };
  } catch {
    if (signal?.aborted) return { ok: false };
    return { ok: false };
  }
}

export async function addCommNote(appId: string, body: string): Promise<ApplicationCommNote | null> {
  if (demo.DEMO) return demo.addDemoCommNote(appId, body);
  try {
    const res = await fetch(`${API_BASE}/api/applications/${encodeURIComponent(appId)}/comm-notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ApplicationCommNote;
  } catch {
    return null;
  }
}

export async function deleteCommNote(appId: string, noteId: string): Promise<boolean> {
  if (demo.DEMO) return demo.deleteDemoCommNote(appId, noteId);
  try {
    const res = await fetch(
      `${API_BASE}/api/applications/${encodeURIComponent(appId)}/comm-notes/${encodeURIComponent(noteId)}`,
      { method: "DELETE", headers: { ...authHeaders() } },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function closeApplication(
  id: string,
  close_reason: CloseReason | null = null,
  close_note = "",
): Promise<Application | null> {
  if (demo.DEMO) {
    const found = demo.demoApplications.find((a) => a.id === id) ?? demo.demoApplications[0];
    return { ...found, stage: "closed", close_reason, close_note };
  }
  try {
    const res = await fetch(`${API_BASE}/api/applications/${encodeURIComponent(id)}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ close_reason, close_note }),
    });
    if (!res.ok) return null;
    return (await res.json()) as Application;
  } catch {
    return null;
  }
}

export async function abandonApplication(id: string): Promise<boolean> {
  if (demo.DEMO) return demo.abandonDemoApplication(id);
  try {
    const res = await fetch(`${API_BASE}/api/applications/${encodeURIComponent(id)}/abandon`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Delete a never-submitted draft. Submitted applications must be Closed, not deleted. */
export async function deleteApplication(id: string): Promise<boolean> {
  return abandonApplication(id);
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
        { stage: "draft", count: 5, pct_of_applied: null },
        { stage: "applied", count: 12, pct_of_applied: null },
        { stage: "interview", count: 3, pct_of_applied: 25.0 },
        { stage: "offer", count: 1, pct_of_applied: 8.3 },
        { stage: "closed", count: 4, pct_of_applied: 33.3 },
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
  search_fields?: string[];
  collect_cn?: boolean;
  collect_en?: boolean;
  include_in_run?: boolean;
  tags?: string[];
  company?: string;
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

export function getCollectSources(market?: string): Promise<{ sources: CollectSource[] } | null> {
  if (demo.DEMO) {
    const all: CollectSource[] = [
      { id: "zhaopin", label: "Zhaopin", kind: "platform", collector_id: "zhaopin", integration: "mcp_jobs", market: "cn", notes: "", enabled: true },
      { id: "liepin", label: "Liepin", kind: "platform", collector_id: "liepin", integration: "mcp_jobs", market: "cn", notes: "", enabled: true },
      { id: "boss", label: "Boss", kind: "platform", collector_id: "boss", integration: "mcp_jobs", market: "cn", notes: "local Chrome login", enabled: true },
      { id: "impactpool", label: "Impactpool", kind: "vertical", collector_id: "impactpool", integration: "public_html", market: "en", notes: "", enabled: true },
      { id: "dimagi", label: "Dimagi Careers", kind: "career_page", collector_id: "dimagi", integration: "ats_board", market: "global", notes: "", enabled: true },
      { id: "automattic", label: "Automattic Careers", kind: "career_page", collector_id: "automattic", integration: "ats_board", market: "global", notes: "", enabled: true },
      { id: "palantir", label: "Palantir Careers", kind: "career_page", collector_id: "palantir", integration: "ats_board", market: "global", notes: "", enabled: true },
      { id: "redhat", label: "Red Hat Careers", kind: "career_page", collector_id: "redhat", integration: "ats_board", market: "global", notes: "", enabled: true },
      { id: "tencent", label: "Tencent Careers", kind: "career_page", collector_id: "tencent", integration: "http_json", market: "cn", notes: "", enabled: true },
      { id: "hiring_cafe", label: "HiringCafe", kind: "platform", collector_id: "hiring_cafe", integration: "ssr_json", market: "en", notes: "", enabled: true },
      { id: "linkedin", label: "LinkedIn", kind: "platform", collector_id: "linkedin", integration: "public_html", market: "en", notes: "guest HTML", enabled: true },
    ];
    const filtered = market
      ? all.filter((s) => {
          const view = parseMarketId(market);
          return view != null && sourceInMarket(s.market, view);
        })
      : all;
    return Promise.resolve({ sources: filtered });
  }
  const q = market ? `?market=${encodeURIComponent(market)}` : "";
  return getJSON<{ sources: CollectSource[] } | null>(`/api/collect/sources${q}`, null);
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
  market?: string;
  source_overrides?: Record<string, Record<string, unknown>>;
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

const DEMO_PRESETS_KEY = "job-hub.search.presets.demo";

function readDemoPresets(): SearchPreset[] {
  try {
    const raw = localStorage.getItem(DEMO_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SearchPreset[]) : [];
  } catch {
    return [];
  }
}

function writeDemoPresets(rows: SearchPreset[]): void {
  try {
    localStorage.setItem(DEMO_PRESETS_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

export async function listSearchPresets(market: string): Promise<SearchPreset[] | null> {
  if (demo.DEMO) {
    return readDemoPresets().filter((row) => row.market === market);
  }
  const q = `?market=${encodeURIComponent(market)}`;
  const data = await getJSON<{ presets: SearchPreset[] } | null>(`/api/search/presets${q}`, null);
  return data?.presets ?? null;
}

export async function createSearchPreset(body: {
  name: string;
  market: string;
  sources: string[];
  common_filters: CommonSearchFilters;
  source_overrides?: Record<string, Record<string, unknown>>;
}): Promise<SearchPreset | null> {
  if (demo.DEMO) {
    const now = new Date().toISOString();
    const row: SearchPreset = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      market: body.market,
      sources: body.sources,
      common_filters: body.common_filters,
      source_overrides: body.source_overrides ?? {},
      created_at: now,
      updated_at: now,
    };
    writeDemoPresets([...readDemoPresets(), row]);
    return row;
  }
  try {
    const res = await fetch(`${API_BASE}/api/search/presets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as SearchPreset;
  } catch {
    return null;
  }
}

export async function updateSearchPreset(
  presetId: string,
  body: {
    name?: string;
    sources?: string[];
    common_filters?: CommonSearchFilters;
    source_overrides?: Record<string, Record<string, unknown>>;
  },
): Promise<SearchPreset | null> {
  if (demo.DEMO) {
    const rows = readDemoPresets();
    const idx = rows.findIndex((row) => row.id === presetId);
    if (idx < 0) return null;
    const next = {
      ...rows[idx],
      ...body,
      updated_at: new Date().toISOString(),
    };
    rows[idx] = next;
    writeDemoPresets(rows);
    return next;
  }
  try {
    const res = await fetch(`${API_BASE}/api/search/presets/${encodeURIComponent(presetId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as SearchPreset;
  } catch {
    return null;
  }
}

export async function deleteSearchPreset(presetId: string): Promise<boolean> {
  if (demo.DEMO) {
    const rows = readDemoPresets();
    const next = rows.filter((row) => row.id !== presetId);
    if (next.length === rows.length) return false;
    writeDemoPresets(next);
    return true;
  }
  try {
    const res = await fetch(`${API_BASE}/api/search/presets/${encodeURIComponent(presetId)}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    return res.ok;
  } catch {
    return false;
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

export interface CompanySource {
  id: string;
  company: string;
  kind?: "company" | "vertical";
  name?: string;
  collect_cn: boolean;
  collect_en: boolean;
  enabled: boolean;
  include_in_run: boolean;
  tags: string[];
  note: string;
  careers_url?: string;
  runnable?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CompanySourceWrite {
  company: string;
  collect_cn?: boolean;
  collect_en?: boolean;
  enabled?: boolean;
  include_in_run?: boolean;
  tags?: string[];
  note?: string;
  careers_url?: string;
}


export interface VerticalChannel {
  id: string;
  name: string;
  kind?: "vertical";
  channel_type: string;
  handle: string;
  enabled: boolean;
  tags: string[];
  note: string;
  created_at?: string;
  updated_at?: string;
}

export interface VerticalChannelWrite {
  name: string;
  channel_type?: string;
  handle?: string;
  enabled?: boolean;
  tags?: string[];
  note?: string;
}
export interface NotebookPage {
  id: string;
  title: string;
  markdown_body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  topics: string[];
}

export function getCompanySources(tag?: string): Promise<{ sources: CompanySource[]; tags: string[] }> {
  if (demo.DEMO) return Promise.resolve(demo.listDemoCompanySources(tag));
  const q = tag ? `?tag=${encodeURIComponent(tag)}` : "";
  return getJSON<{ sources: CompanySource[]; tags: string[] }>(`/api/company-sources${q}`, {
    sources: [],
    tags: [],
  });
}

export async function createCompanySource(body: CompanySourceWrite): Promise<CompanySource | null> {
  if (demo.DEMO) return demo.createDemoCompanySource(body);
  try {
    const res = await fetch(`${API_BASE}/api/company-sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as CompanySource;
  } catch {
    return null;
  }
}

export async function patchCompanySource(
  id: string,
  body: Partial<CompanySourceWrite>,
): Promise<CompanySource | null> {
  if (demo.DEMO) return demo.patchDemoCompanySource(id, body);
  try {
    const res = await fetch(`${API_BASE}/api/company-sources/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as CompanySource;
  } catch {
    return null;
  }
}


export function getVerticalChannels(opts?: {
  tag?: string;
  channel_type?: string;
}): Promise<{ channels: VerticalChannel[]; tags: string[] }> {
  if (demo.DEMO) return Promise.resolve(demo.listDemoVerticalChannels(opts));
  const params = new URLSearchParams();
  if (opts?.tag) params.set("tag", opts.tag);
  if (opts?.channel_type) params.set("channel_type", opts.channel_type);
  const q = params.toString() ? `?${params.toString()}` : "";
  return getJSON<{ channels: VerticalChannel[]; tags: string[] }>(`/api/vertical-channels${q}`, {
    channels: [],
    tags: [],
  });
}

export async function createVerticalChannel(body: VerticalChannelWrite): Promise<VerticalChannel | null> {
  if (demo.DEMO) return demo.createDemoVerticalChannel(body);
  try {
    const res = await fetch(`${API_BASE}/api/vertical-channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as VerticalChannel;
  } catch {
    return null;
  }
}

export async function patchVerticalChannel(
  id: string,
  body: Partial<VerticalChannelWrite>,
): Promise<VerticalChannel | null> {
  if (demo.DEMO) return demo.patchDemoVerticalChannel(id, body);
  try {
    const res = await fetch(`${API_BASE}/api/vertical-channels/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as VerticalChannel;
  } catch {
    return null;
  }
}
export function getNotebookPages(opts?: {
  q?: string;
  topic?: string;
  sort?: "updated" | "title";
}): Promise<{ pages: NotebookPage[]; topics: string[] }> {
  if (demo.DEMO) return Promise.resolve(demo.listDemoNotebookPages(opts));
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.topic) params.set("topic", opts.topic);
  if (opts?.sort) params.set("sort", opts.sort);
  const q = params.toString() ? `?${params.toString()}` : "";
  return getJSON<{ pages: NotebookPage[]; topics: string[] }>(`/api/notebook/pages${q}`, {
    pages: [],
    topics: [],
  });
}

export async function createNotebookPage(body?: {
  title?: string;
  markdown_body?: string;
}): Promise<NotebookPage | null> {
  if (demo.DEMO) return demo.createDemoNotebookPage(body);
  try {
    const res = await fetch(`${API_BASE}/api/notebook/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) return null;
    return (await res.json()) as NotebookPage;
  } catch {
    return null;
  }
}

export async function patchNotebookPage(
  id: string,
  body: { title?: string; markdown_body?: string; sort_order?: number },
): Promise<NotebookPage | null> {
  if (demo.DEMO) return demo.patchDemoNotebookPage(id, body);
  try {
    const res = await fetch(`${API_BASE}/api/notebook/pages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as NotebookPage;
  } catch {
    return null;
  }
}

export async function deleteNotebookPage(id: string): Promise<boolean> {
  if (demo.DEMO) return demo.deleteDemoNotebookPage(id);
  try {
    const res = await fetch(`${API_BASE}/api/notebook/pages/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
