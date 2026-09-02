import type { Application } from "@/lib/api";
import { materialCountLabel } from "@/lib/materialsUi";
import { formatDateTimeInAppTz } from "@/lib/timezone";

export type ApplicationDrawerTab = "overview" | "materials" | "notes";

/** Opening an application lands on the packet workbench. */
export const DEFAULT_APPLICATION_TAB: ApplicationDrawerTab = "materials";

export function parseApplicationTab(raw: string | null | undefined): ApplicationDrawerTab {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "overview") return "overview";
  if (value === "notes") return "notes";
  return "materials";
}

export function tabQueryValue(tab: ApplicationDrawerTab): string | null {
  if (tab === "materials") return "packet";
  return tab;
}

/** Shared assist action-row chrome: one filled primary, outline secondaries. */
export const ASSIST_BTN =
  "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:pointer-events-none disabled:opacity-50";
export const ASSIST_BTN_PRIMARY = `${ASSIST_BTN} bg-ink text-white shadow-sm hover:bg-night`;
export const ASSIST_BTN_SECONDARY =
  `${ASSIST_BTN} border border-line bg-surface text-ink hover:border-ink/30`;

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
export const ASSIST_NO_APPLY_URL = "No apply URL is stored. You can still prepare materials.";

export function assistPacketReadiness(count: number): string {
  if (count <= 0) {
    return "No materials selected. You can still open the apply page and copy answers.";
  }
  return `${materialCountLabel(count)} ready for this application.`;
}

export function latestSubmissionLine(app: Application): string | null {
  const submissions = app.submissions ?? [];
  if (submissions.length === 0) return null;
  const latest = submissions[submissions.length - 1];
  const items = latest.packet_snapshot?.items ?? [];
  const count =
    items.length > 0 ? items.length : (latest.packet_snapshot?.material_version_ids?.length ?? 0);
  const when = formatDateTimeInAppTz(latest.submitted_at);
  if (count === 0) return `Last submission ${when} · 当次材料未记录`;
  return `Last submission ${when} · ${materialCountLabel(count)}`;
}
