import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseCountryParam,
  parsePostedParam,
  parseRemoteParam,
  parseSourcesParam,
} from "@/lib/discoveredRange";
import {
  countryFilterOptions,
  jobInMarketView,
  parseMarketId,
  parseSourceMarket,
  sourceInMarket,
  storedToMarketId,
} from "@/lib/markets";
import {
  collectSourcesStorageKey,
  readCollectSourceIds,
  readLastMarket,
  readPoolPrefs,
  writeCollectSourceIds,
  writeLastMarket,
  writePoolPrefs,
} from "@/lib/marketPrefs";

describe("parseMarketId", () => {
  it("maps view ids and does not treat global as a view", () => {
    expect(parseMarketId("cn")).toBe("cn");
    expect(parseMarketId("CN")).toBe("cn");
    expect(parseMarketId("en")).toBe("en");
    expect(parseMarketId("GLOBAL")).toBeNull();
    expect(parseSourceMarket("GLOBAL")).toBe("global");
    expect(parseMarketId("jp")).toBeNull();
  });
});

describe("source isolation", () => {
  it("groups by source_market; global appears in both views", () => {
    expect(sourceInMarket("cn", "cn")).toBe(true);
    expect(sourceInMarket("CN", "en")).toBe(false);
    expect(sourceInMarket("en", "en")).toBe(true);
    expect(sourceInMarket("global", "en")).toBe(true);
    expect(sourceInMarket("global", "cn")).toBe(true);
    expect(sourceInMarket("", "cn")).toBe(false);
  });

  it("does not default missing source market to CN", () => {
    expect(storedToMarketId(undefined)).toBeNull();
  });

  it("routes global jobs by country and keeps en sources in EN", () => {
    const registry = { palantir: "global", linkedin: "en", zhaopin: "cn" };
    expect(jobInMarketView({ source: "palantir", country: "CN" }, "cn", registry)).toBe(true);
    expect(jobInMarketView({ source: "palantir", country: "GB" }, "cn", registry)).toBe(false);
    expect(jobInMarketView({ source: "palantir", country: "GB" }, "en", registry)).toBe(true);
    expect(jobInMarketView({ source: "linkedin", country: "CN" }, "en", registry)).toBe(true);
    expect(jobInMarketView({ source: "linkedin", country: "CN" }, "cn", registry)).toBe(false);
    expect(jobInMarketView({ source: "zhaopin", country: "GB" }, "cn", registry)).toBe(true);
  });
});

describe("country URL parsing and unknown", () => {
  it("normalizes UK and unknown", () => {
    expect(parseCountryParam(undefined)).toBe("");
    expect(parseCountryParam("all")).toBe("");
    expect(parseCountryParam("uk")).toBe("GB");
    expect(parseCountryParam("unknown")).toBe("XX");
    expect(parseRemoteParam("true")).toBe(true);
    expect(parsePostedParam("7")).toBe("7");
    expect(parseSourcesParam("linkedin,hiring_cafe")).toEqual(["linkedin", "hiring_cafe"]);
  });

  it("always includes seed countries plus Unknown", () => {
    const opts = countryFilterOptions([{ country: "XX", country_name: "Unknown / Global" }]);
    const codes = opts.map((o) => o.code);
    expect(codes).toContain("US");
    expect(codes).toContain("GB");
    expect(codes).toContain("XX");
  });
});

describe("preference isolation", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not copy CN source selection onto EN", () => {
    writeLastMarket("cn");
    writeCollectSourceIds("cn", ["zhaopin", "liepin"]);
    writePoolPrefs("cn", {
      country: "",
      sources: ["zhaopin"],
      remote: false,
      postedDays: "",
      showSponsorship: false,
    });
    writePoolPrefs("en", {
      country: "GB",
      sources: ["linkedin"],
      remote: true,
      postedDays: "7",
      showSponsorship: true,
    });

    expect(readLastMarket()).toBe("cn");
    expect(readCollectSourceIds("cn")).toEqual(["zhaopin", "liepin"]);
    expect(readCollectSourceIds("en")).toBeNull();
    expect(readPoolPrefs("en").sources).toEqual(["linkedin"]);
    expect(readPoolPrefs("en").country).toBe("GB");
    expect(readPoolPrefs("cn").sources).toEqual(["zhaopin"]);
    expect(collectSourcesStorageKey("cn")).not.toBe(collectSourcesStorageKey("en"));
  });
});
