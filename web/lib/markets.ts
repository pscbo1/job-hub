/** UI market views (cn / en). Source market is cn / en / global (global → EN). */

export type MarketId = "cn" | "en";
export type SourceMarket = "cn" | "en" | "global";

export interface MarketConfig {
  id: MarketId;
  label: string;
  defaultCountry: string | null;
  filters: readonly string[];
  defaultCollectSources: readonly string[];
  route: string;
}

export const MARKET_ORDER: MarketId[] = ["cn", "en"];

export const MARKETS: Record<MarketId, MarketConfig> = {
  cn: {
    id: "cn",
    label: "CN",
    defaultCountry: "CN",
    filters: ["source"],
    defaultCollectSources: ["zhaopin", "liepin"],
    route: "/cn",
  },
  en: {
    id: "en",
    label: "EN",
    defaultCountry: null,
    filters: ["country", "remote", "posted", "source", "sponsorship_display"],
    defaultCollectSources: ["linkedin", "hiring_cafe"],
    route: "/en",
  },
};

export const EN_COUNTRY_SEED: { code: string; name: string }[] = [
  { code: "GB", name: "United Kingdom" },
  { code: "NL", name: "Netherlands" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "JP", name: "Japan" },
];

export const UNKNOWN_COUNTRY = { code: "XX", name: "Unknown / Global" };

export function parseSourceMarket(raw: string | undefined | null): SourceMarket | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (lower === "cn" || lower === "en" || lower === "global") return lower;
  return null;
}

export function parseMarketId(raw: string | undefined | null): MarketId | null {
  const sm = parseSourceMarket(raw);
  if (sm === "global") return "en";
  if (sm === "cn" || sm === "en") return sm;
  return null;
}

export function marketFromPath(pathname: string): MarketId | null {
  const first = pathname.split("/").filter(Boolean)[0];
  return parseMarketId(first ?? "");
}

export function marketHasFilter(market: MarketId, name: string): boolean {
  return MARKETS[market].filters.includes(name);
}

export function storedToMarketId(stored: string | undefined | null): MarketId | null {
  return parseMarketId(stored);
}

export function sourceInMarket(sourceMarket: string | undefined | null, market: MarketId): boolean {
  const sm = parseSourceMarket(sourceMarket);
  if (sm == null) return false;
  if (sm === "global") return market === "en";
  return sm === market;
}

export function jobInMarketView(
  job: { source?: string; market?: string; country?: string },
  view: MarketId,
  sourceMarketById: Record<string, string | undefined>,
): boolean {
  const fromRegistry = sourceMarketById[(job.source || "").toLowerCase()];
  const sm = parseSourceMarket(fromRegistry) ?? parseSourceMarket(job.market);
  if (sm == null) return false;
  if (sm === "cn") return view === "cn";
  return view === "en";
}

export function countryFilterOptions(
  jobs: readonly { country?: string; country_name?: string }[],
): { code: string; name: string }[] {
  const byCode = new Map<string, string>();
  for (const row of EN_COUNTRY_SEED) byCode.set(row.code, row.name);
  for (const job of jobs) {
    const code = (job.country || "XX").toUpperCase();
    if (code === "UK") {
      byCode.set("GB", "United Kingdom");
      continue;
    }
    if (code === "XX" || code === "UNKNOWN") continue;
    if (!byCode.has(code)) byCode.set(code, job.country_name || code);
  }
  const rows = [...byCode.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  rows.push(UNKNOWN_COUNTRY);
  return rows;
}

export function jobsPath(market: MarketId): string {
  return `/${market}/jobs`;
}

export function myJobsPath(_market: MarketId): string {
  return "/tasks";
}

export function searchPath(market: MarketId): string {
  return `/${market}/search`;
}
