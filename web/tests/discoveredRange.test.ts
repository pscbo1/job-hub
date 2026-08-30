import { describe, expect, it } from "vitest";

import {
  jobsPoolHref,
  parseDiscoveredRange,
  resolveDiscoveredFilter,
  sinceForPreset,
} from "@/lib/discoveredRange";

const noonCst = new Date(2026, 7, 30, 12, 0, 0);

describe("sinceForPreset", () => {
  it("computes calendar lower bounds from today", () => {
    expect(sinceForPreset("7d", noonCst)).toBe("2026-08-23");
    expect(sinceForPreset("30d", noonCst)).toBe("2026-07-31");
    expect(sinceForPreset("90d", noonCst)).toBe("2026-06-01");
  });
});

describe("parseDiscoveredRange", () => {
  it("defaults to last 7 days", () => {
    expect(parseDiscoveredRange(undefined, undefined)).toBe("7d");
  });

  it("treats a bare since param as custom", () => {
    expect(parseDiscoveredRange(undefined, "2026-08-25")).toBe("custom");
  });
});

describe("resolveDiscoveredFilter", () => {
  it("All drops the discovered_at lower bound", () => {
    expect(resolveDiscoveredFilter({ range: "all" }, noonCst)).toEqual({
      range: "all",
      since: undefined,
      customSince: "",
    });
  });

  it("rolling presets fill since from today", () => {
    expect(resolveDiscoveredFilter({ range: "7d" }, noonCst).since).toBe("2026-08-23");
  });

  it("custom keeps the manual date", () => {
    expect(resolveDiscoveredFilter({ range: "custom", since: "2026-08-01" }, noonCst)).toEqual({
      range: "custom",
      since: "2026-08-01",
      customSince: "2026-08-01",
    });
  });
});

describe("jobsPoolHref", () => {
  it("encodes range and custom since", () => {
    expect(jobsPoolHref("7d")).toBe("/jobs?range=7d");
    expect(jobsPoolHref("all")).toBe("/jobs?range=all");
    expect(jobsPoolHref("custom", "2026-08-25")).toBe("/jobs?range=custom&since=2026-08-25");
  });
});
