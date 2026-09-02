/** Company Sources table helpers. Tags match Application direction tags. */

import { normalizeApplicationTags } from "@/lib/applicationTags";

export const COMPANY_SOURCES_COPY = {
  title: "Company Sources",
  subtitle:
    "Companies you can collect from. This list is not jobs — Collect still runs only enabled companies you check for this run.",
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

export interface CompanySourceRow {
  id: string;
  company: string;
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

export function filterCompanySources(
  rows: readonly CompanySourceRow[],
  tag: string,
): CompanySourceRow[] {
  const wanted = tag.trim().toLowerCase();
  if (!wanted) return [...rows];
  return rows.filter((row) => row.tags.some((item) => item.toLowerCase() === wanted));
}

export function companySourceTags(rows: readonly CompanySourceRow[]): string[] {
  return normalizeApplicationTags(rows.flatMap((row) => row.tags));
}
