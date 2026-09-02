/** Manage sources: one page, two tabs (Companies | Vertical channels). */

import { normalizeApplicationTags } from "@/lib/applicationTags";

export const SOURCE_CLASS_TABS = ["companies", "verticals"] as const;
export type SourceClassTab = (typeof SOURCE_CLASS_TABS)[number];

export const VERTICAL_CHANNEL_TYPES = ["wechat", "community", "other"] as const;
export type VerticalChannelType = (typeof VERTICAL_CHANNEL_TYPES)[number];
export type SourceKind = "company" | VerticalChannelType;

export const MANAGE_SOURCES_COPY = {
  title: "Manage sources",
  subtitle:
    "Two sheets on this page: companies you can collect from, and vertical channels you keep by hand. Auto Collect does not scrape WeChat or community rows.",
  companiesTab: "Companies",
  verticalsTab: "Vertical channels",
} as const;

export const COMPANY_SOURCES_COPY = {
  title: "Companies",
  subtitle: "Collect runs only enabled companies you check for this run.",
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
  empty: "No companies yet. Add one to keep it off Collect until you enable it.",
} as const;

export const VERTICAL_CHANNEL_TYPE_LABELS: Record<VerticalChannelType, string> = {
  wechat: "WeChat",
  community: "Community",
  other: "Other",
};

export const VERTICAL_CHANNELS_COPY = {
  title: "Vertical channels",
  subtitle: "WeChat, community, and other channels you track by hand. Not scraped this round.",
  add: "Add channel",
  name: "Name",
  type: "Type",
  enabled: "Enabled",
  thisRun: "This run",
  tags: "Tags",
  note: "Note",
  notePlaceholder: "Who runs this channel?",
  tagFilter: "Filter by tag",
  empty: "No vertical channels yet. Add as many as you need — they stay on this sheet.",
} as const;

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

export function verticalTypeLabel(type: string): string {
  if (type === "wechat" || type === "community" || type === "other") {
    return VERTICAL_CHANNEL_TYPE_LABELS[type];
  }
  return type || VERTICAL_CHANNEL_TYPE_LABELS.other;
}

export function filterCompanySources<T extends CompanySourceRow>(
  rows: readonly T[],
  tag: string,
): T[] {
  const companies = rows.filter((row) => isCompanyKind(row));
  const wanted = tag.trim().toLowerCase();
  if (!wanted) return [...companies];
  return companies.filter((row) => row.tags.some((item) => item.toLowerCase() === wanted));
}

export function companySourceTags(rows: readonly CompanySourceRow[]): string[] {
  return normalizeApplicationTags(rows.filter(isCompanyKind).flatMap((row) => row.tags));
}

export function filterVerticalChannels<T extends CompanySourceRow>(
  rows: readonly T[],
  tag: string,
): T[] {
  const channels = rows.filter((row) => !isCompanyKind(row));
  const wanted = tag.trim().toLowerCase();
  if (!wanted) return [...channels];
  return channels.filter((row) => row.tags.some((item) => item.toLowerCase() === wanted));
}

export function verticalChannelTags(rows: readonly CompanySourceRow[]): string[] {
  return normalizeApplicationTags(rows.filter((row) => !isCompanyKind(row)).flatMap((row) => row.tags));
}
