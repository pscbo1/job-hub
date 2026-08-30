/** Job Pool discovered_at presets. Filtering still uses the existing ``since`` query. */

import type { MarketId } from "@/lib/markets";

export type DiscoveredRange = "7d" | "30d" | "90d" | "all" | "custom";

export const DISCOVERED_RANGE_OPTIONS: { value: DiscoveredRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom date" },
];

const PRESET_DAYS: Record<"7d" | "30d" | "90d", number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar date (YYYY-MM-DD), not UTC, so evening CN use matches the picker. */
export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addCalendarDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export function sinceForPreset(range: "7d" | "30d" | "90d", now = new Date()): string {
  return localIsoDate(addCalendarDays(now, -PRESET_DAYS[range]));
}

export function parseDiscoveredRange(
  range: string | undefined,
  since: string | undefined,
): DiscoveredRange {
  if (range === "7d" || range === "30d" || range === "90d" || range === "all" || range === "custom") {
    return range;
  }
  if (since?.trim()) return "custom";
  return "7d";
}

export function resolveDiscoveredFilter(
  params: { range?: string; since?: string },
  now = new Date(),
): { range: DiscoveredRange; since: string | undefined; customSince: string } {
  const range = parseDiscoveredRange(params.range, params.since);
  const customSince = params.since?.trim() ?? "";
  if (range === "all") return { range, since: undefined, customSince };
  if (range === "custom") {
    return { range, since: customSince || undefined, customSince };
  }
  return { range, since: sinceForPreset(range, now), customSince };
}

export type PoolView = "included" | "excluded";

export function jobsPoolHref(input: {
  market: MarketId;
  range: DiscoveredRange;
  customSince?: string;
  pool?: PoolView;
  country?: string;
  remote?: boolean;
  postedDays?: string;
  sources?: string[];
}): string {
  const params = new URLSearchParams();
  params.set("range", input.range);
  if (input.range === "custom" && input.customSince) params.set("since", input.customSince);
  if (input.pool === "excluded") params.set("pool", "excluded");
  if (input.country && input.country !== "all") params.set("country", input.country);
  if (input.remote) params.set("remote", "true");
  if (input.postedDays) params.set("posted", input.postedDays);
  if (input.sources && input.sources.length > 0) params.set("sources", input.sources.join(","));
  return `/${input.market}/jobs?${params.toString()}`;
}

export function parseCountryParam(raw: string | undefined): string {
  const v = raw?.trim() ?? "";
  if (!v || v.toLowerCase() === "all") return "";
  if (v.toLowerCase() === "unknown" || v.toLowerCase() === "global") return "XX";
  if (v.toUpperCase() === "UK") return "GB";
  return v.toUpperCase();
}

export function parseSourcesParam(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parsePostedParam(raw: string | undefined): string {
  if (raw === "1" || raw === "7" || raw === "30") return raw;
  return "";
}

export function parseRemoteParam(raw: string | undefined): boolean {
  return raw === "true" || raw === "1";
}
