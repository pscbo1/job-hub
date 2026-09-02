import type { Application } from "@/lib/api";
import { materialCountLabel } from "@/lib/materialsUi";
import { formatDateTimeInAppTz } from "@/lib/timezone";

export type ApplicationDrawerTab = "overview" | "materials" | "notes";

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

export const APPLICATION_ROW_MORE_LABEL = "More actions";
export const APPLICATION_VIEW_OPTIONS_LABEL = "View options";
export const APPLICATION_VIEW_OPTIONS_GROUPS = {
  views: "Views",
  cleanup: "Cleanup settings",
} as const;

export function nextStepLabel(nextStep?: string | null): string {
  const value = (nextStep ?? "").trim();
  return value || "—";
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
