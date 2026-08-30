import { MARKETS, parseMarketId, type MarketId } from "@/lib/markets";

const LAST_KEY = "job-hub.market";
const LEGACY_COLLECT_SOURCES = "job-hub.collect.sources";

export interface PoolPrefs {
  country: string;
  sources: string[];
  remote: boolean;
  postedDays: string;
  showSponsorship: boolean;
}

const EMPTY_POOL: PoolPrefs = {
  country: "",
  sources: [],
  remote: false,
  postedDays: "",
  showSponsorship: false,
};

function poolKey(market: MarketId): string {
  return `job-hub.pool.${market}`;
}

export function collectSourcesStorageKey(market: MarketId): string {
  return `job-hub.collect.sources.${market}`;
}

export function readLastMarket(): MarketId {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return parseMarketId(raw) ?? "cn";
  } catch {
    return "cn";
  }
}

export function writeLastMarket(market: MarketId): void {
  try {
    localStorage.setItem(LAST_KEY, market);
  } catch {
    /* ignore quota */
  }
}

export function readPoolPrefs(market: MarketId): PoolPrefs {
  try {
    const raw = localStorage.getItem(poolKey(market));
    if (!raw) return { ...EMPTY_POOL };
    const parsed = JSON.parse(raw) as Partial<PoolPrefs>;
    return {
      country: typeof parsed.country === "string" ? parsed.country : "",
      sources: Array.isArray(parsed.sources)
        ? parsed.sources.filter((s): s is string => typeof s === "string")
        : [],
      remote: parsed.remote === true,
      postedDays: typeof parsed.postedDays === "string" ? parsed.postedDays : "",
      showSponsorship: parsed.showSponsorship === true,
    };
  } catch {
    return { ...EMPTY_POOL };
  }
}

export function writePoolPrefs(market: MarketId, prefs: PoolPrefs): void {
  try {
    localStorage.setItem(poolKey(market), JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}

export function readCollectSourceIds(market: MarketId): string[] | null {
  try {
    const raw = localStorage.getItem(collectSourcesStorageKey(market));
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    }
    if (market === "cn") {
      const legacy = localStorage.getItem(LEGACY_COLLECT_SOURCES);
      if (legacy) {
        const parsed = JSON.parse(legacy) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === "string");
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeCollectSourceIds(market: MarketId, ids: string[]): void {
  try {
    localStorage.setItem(collectSourcesStorageKey(market), JSON.stringify(ids));
  } catch {
    /* ignore quota */
  }
}

export function defaultCollectSources(market: MarketId): readonly string[] {
  return MARKETS[market].defaultCollectSources;
}

export interface CollectQueryPrefs {
  remote: boolean;
  postedDays: string;
  location: string;
}

export function collectQueryKey(market: MarketId): string {
  return `job-hub.collect.query.${market}`;
}

export function readCollectQueryPrefs(market: MarketId): CollectQueryPrefs {
  try {
    const raw = localStorage.getItem(collectQueryKey(market));
    if (!raw) return { remote: false, postedDays: "", location: "" };
    const parsed = JSON.parse(raw) as Partial<CollectQueryPrefs>;
    return {
      remote: parsed.remote === true,
      postedDays: typeof parsed.postedDays === "string" ? parsed.postedDays : "",
      location: typeof parsed.location === "string" ? parsed.location : "",
    };
  } catch {
    return { remote: false, postedDays: "", location: "" };
  }
}

export function writeCollectQueryPrefs(market: MarketId, prefs: CollectQueryPrefs): void {
  try {
    localStorage.setItem(collectQueryKey(market), JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}
