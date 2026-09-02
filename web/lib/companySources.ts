/** Manage sources: Companies class vs Vertical channels class. */

import { normalizeApplicationTags } from "@/lib/applicationTags";

export const SOURCE_CLASS_TABS = ["companies", "verticals"] as const;
export type SourceClassTab = (typeof SOURCE_CLASS_TABS)[number];

export const MANAGE_SOURCES_COPY = {
  title: "Manage sources",
  subtitle:
    "Two classes: companies you can collect from, and vertical channels you keep as a directory. This page is not the job list.",
  companiesTab: "Companies",
  verticalsTab: "Vertical channels",
} as const;

export const COMPANY_SOURCES_COPY = {
  title: "Companies",
  subtitle:
    "Companies you can collect from. Collect still runs only enabled companies you check for this run.",
  add: "Add company",
  company: "Company",
  cn: "CN",
  en: "EN",
  enabled: "Enabled",
  thisRun: "This run",
  tags: "Tags",
  note: "Note",
  notePlaceholder: "Who is this company?",
  tagFilter: "Filter by tag",
  careersUrl: "Careers URL (optional)",
  careersHint: "Paste a Greenhouse, Lever, Ashby, or Workday board link if you want Collect to fetch it.",
  empty: "No companies yet. Add one to keep it off the Collect clutter until you enable it.",
  notRunnable: "Listed only — no public board to collect",
} as const;

export const VERTICAL_CHANNEL_TYPES = ["wechat", "community", "other"] as const;
export type VerticalChannelType = (typeof VERTICAL_CHANNEL_TYPES)[number];

export const VERTICAL_CHANNEL_TYPE_LABELS: Record<VerticalChannelType, string> = {
  wechat: "WeChat",
  community: "Community",
  other: "Other",
};

export const VERTICAL_CHANNELS_COPY = {
  title: "Vertical channels",
  subtitle:
    "WeChat, community, and other channels you track by hand. Auto Collect does not scrape these.",
  add: "Add channel",
  name: "Name",
  type: "Type",
  handle: "URL or handle (optional)",
  enabled: "Enabled",
  tags: "Tags",
  note: "Note",
  notePlaceholder: "Who runs this channel?",
  typeFilter: "Filter by type",
  tagFilter: "Filter by tag",
  empty: "No vertical channels yet. Add as many as you need — they stay in this class.",
} as const;

export interface CompanySourceRow {
  id: string;
  company: string;
  kind?: "company" | "vertical";
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

export interface VerticalChannelRow {
  id: string;
  name: string;
  channel_type: VerticalChannelType | string;
  handle: string;
  enabled: boolean;
  tags: string[];
  note: string;
  kind?: "vertical";
}

export function isCompanySourceRow(row: { kind?: string }): boolean {
  return row.kind !== "vertical";
}

export function filterCompanySources(
  rows: readonly CompanySourceRow[],
  tag: string,
): CompanySourceRow[] {
  const companies = rows.filter(isCompanySourceRow);
  const wanted = tag.trim().toLowerCase();
  if (!wanted) return [...companies];
  return companies.filter((row) => row.tags.some((item) => item.toLowerCase() === wanted));
}

export function companySourceTags(rows: readonly CompanySourceRow[]): string[] {
  return normalizeApplicationTags(rows.filter(isCompanySourceRow).flatMap((row) => row.tags));
}

export function filterVerticalChannels(
  rows: readonly VerticalChannelRow[],
  opts: { type?: string; tag?: string } = {},
): VerticalChannelRow[] {
  const wantedType = (opts.type ?? "").trim().toLowerCase();
  const wantedTag = (opts.tag ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (wantedType && row.channel_type.toLowerCase() !== wantedType) return false;
    if (wantedTag && !row.tags.some((item) => item.toLowerCase() === wantedTag)) return false;
    return true;
  });
}

export function verticalChannelTags(rows: readonly VerticalChannelRow[]): string[] {
  return normalizeApplicationTags(rows.flatMap((row) => row.tags));
}

export function verticalTypeLabel(type: string): string {
  if (type === "wechat" || type === "community" || type === "other") {
    return VERTICAL_CHANNEL_TYPE_LABELS[type];
  }
  return type || VERTICAL_CHANNEL_TYPE_LABELS.other;
}
