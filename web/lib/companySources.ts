/** Manage sources: one table for companies and vertical channels. */

import { normalizeApplicationTags } from "@/lib/applicationTags";

export const SOURCE_KINDS = ["company", "wechat", "community", "other"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const MANAGE_SOURCES_COPY = {
  title: "Manage sources",
  subtitle:
    "One table for companies and vertical channels. Auto Collect still runs only enabled companies you check for this run. WeChat and community rows stay listed so you do not forget them.",
  add: "Add source",
  name: "Name",
  type: "Type",
  cn: "CN",
  en: "EN",
  enabled: "Enabled",
  thisRun: "This run",
  tags: "Tags",
  note: "Note",
  handle: "URL or handle (optional)",
  notePlaceholder: "Who is this source?",
  typeFilter: "Filter by type",
  tagFilter: "Filter by tag",
  careersUrl: "Careers URL (optional)",
  careersHint: "For companies, paste a Greenhouse, Lever, Ashby, or Workday board link.",
  empty: "No sources yet. Add a company or a vertical channel.",
  notRunnable: "Listed only — Auto Collect does not scrape this",
} as const;

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  company: "Company",
  wechat: "WeChat",
  community: "Community",
  other: "Other",
};

export interface CompanySourceRow {
  id: string;
  company: string;
  name?: string;
  kind?: string;
  channel_type?: string;
  handle?: string;
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

export function sourceKindOf(row: { kind?: string; channel_type?: string }): SourceKind {
  const raw = (row.kind || row.channel_type || "company").toLowerCase();
  if (raw === "wechat" || raw === "community" || raw === "other" || raw === "company") {
    return raw;
  }
  if (raw === "vertical") {
    const typed = (row.channel_type || "other").toLowerCase();
    if (typed === "wechat" || typed === "community" || typed === "other") return typed;
    return "other";
  }
  return "company";
}

export function isCompanyKind(row: { kind?: string; channel_type?: string }): boolean {
  return sourceKindOf(row) === "company";
}

export function sourceKindLabel(kind: string): string {
  if (kind === "company" || kind === "wechat" || kind === "community" || kind === "other") {
    return SOURCE_KIND_LABELS[kind];
  }
  return kind || SOURCE_KIND_LABELS.other;
}

export function filterManagedSources(
  rows: readonly CompanySourceRow[],
  opts: { type?: string; tag?: string } = {},
): CompanySourceRow[] {
  const wantedType = (opts.type ?? "").trim().toLowerCase();
  const wantedTag = (opts.tag ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    const kind = sourceKindOf(row);
    if (wantedType === "vertical" && kind === "company") return false;
    if (wantedType && wantedType !== "vertical" && kind !== wantedType) return false;
    if (wantedTag && !row.tags.some((item) => item.toLowerCase() === wantedTag)) return false;
    return true;
  });
}

export function managedSourceTags(rows: readonly CompanySourceRow[]): string[] {
  return normalizeApplicationTags(rows.flatMap((row) => row.tags));
}
