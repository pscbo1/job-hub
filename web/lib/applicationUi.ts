import type { Application } from "@/lib/api";
import { materialCountLabel } from "@/lib/materialsUi";
import { formatDateTimeInAppTz } from "@/lib/timezone";

export type ApplicationDrawerTab = "overview" | "materials" | "notes";

/** Opening an application lands on Overview, not the packet tab. */
export const DEFAULT_APPLICATION_TAB: ApplicationDrawerTab = "overview";

export function parseApplicationTab(raw: string | null | undefined): ApplicationDrawerTab {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "packet" || value === "materials") return "materials";
  if (value === "notes") return "notes";
  return "overview";
}

export function tabQueryValue(tab: ApplicationDrawerTab): string | null {
  if (tab === "overview") return null;
  if (tab === "materials") return "packet";
  return tab;
}

export function packetWorkbenchPath(appId: string): string {
  return `/applications/${encodeURIComponent(appId)}/packet`;
}

/** Shared assist action-row chrome: one filled primary, outline secondaries. */
export const ASSIST_BTN =
  "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:pointer-events-none disabled:opacity-50";
export const ASSIST_BTN_PRIMARY = `${ASSIST_BTN} bg-ink text-white shadow-sm hover:bg-night`;
export const ASSIST_BTN_SECONDARY =
  `${ASSIST_BTN} border border-line bg-surface text-ink hover:border-ink/30 hover:bg-bg`;

export const APPLICATION_ROW_MORE_LABEL = "More actions";

export function applicationRowMoreLabel(title?: string | null): string {
  const role = (title ?? "").trim() || "Untitled";
  return `${APPLICATION_ROW_MORE_LABEL} for ${role}`;
}

export const APPLICATION_VIEW_OPTIONS_LABEL = "View options";
export const APPLICATION_VIEW_OPTIONS_GROUPS = {
  views: "Views",
  tags: "Tags",
  cleanup: "Cleanup settings",
} as const;

export const APPLICATION_LIST_COLUMN_KEYS = [
  "select",
  "title",
  "stage",
  "next_step",
  "applied_date",
  "materials",
  "actions",
] as const;

export function nextStepLabel(nextStep?: string | null): string {
  const value = (nextStep ?? "").trim();
  return value || "—";
}

/** Assist workbench: no fake disabled Open apply control. */
export const ASSIST_NO_APPLY_URL = "No apply URL stored";

export const ASSIST_COPY = {
  heading: "Current materials",
  purpose: "Select materials, then open the apply page.",
  packet: "Current materials",
  choose: "Select materials",
  empty: "Nothing selected yet.",
  loading: "Loading…",
  loadFailed: "Could not load materials.",
  retry: "Retry",
  openApply: "Open apply page",
  markSubmitted: "Mark submitted",
  download: "Download",
  copy: "Copy",
  copyLink: "Copy link",
  copied: "Copied",
  copyFailed: "Copy failed",
  noCopy: "Nothing to copy",
  add: "Add",
  attach: "Attach",
  cancel: "Cancel",
  search: "Search",
  answers: "Templates & answers",
  hideAnswers: "Hide templates",
  history: "Submission history",
  pickerTitle: "Select materials",
  openWindow: "Open in new window",
  filesSection: "Files",
  knowledgeSection: "Templates & answers",
  filesHint: "Resumes, portfolios, PDFs",
  knowledgeHint: "Messages and application answers",
  emptyFiles: "No files in this packet.",
  emptyKnowledge: "No templates in this packet.",
  backOverview: "Back to application",
  remove: "Remove",
  more: "More",
  changeVersion: "Version",
  newName: "New material name",
  addMaterial: "Add material",
  preview: "Open",
} as const;

export function assistSelectedCount(count: number): string {
  return `${count} selected`;
}

export function assistPacketReadiness(count: number): string {
  if (count <= 0) return ASSIST_COPY.empty;
  return assistSelectedCount(count);
}

export function latestSubmissionLine(app: Application): string | null {
  const submissions = app.submissions ?? [];
  if (submissions.length === 0) return null;
  const latest = submissions[submissions.length - 1];
  const items = latest.packet_snapshot?.items ?? [];
  const count =
    items.length > 0 ? items.length : (latest.packet_snapshot?.material_version_ids?.length ?? 0);
  const when = formatDateTimeInAppTz(latest.submitted_at);
  if (count === 0) return `Last submission ${when} · No materials recorded`;
  return `Last submission ${when} · ${materialCountLabel(count)}`;
}
