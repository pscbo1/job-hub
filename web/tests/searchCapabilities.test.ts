import { describe, expect, it } from "vitest";

import {
  fieldIsPartial,
  presetLoadWarnings,
  snapshotEquals,
  sourcesForField,
  type CapableSource,
} from "@/lib/searchCapabilities";

const catalog: CapableSource[] = [
  { id: "linkedin", label: "LinkedIn", search_fields: ["keywords", "location", "remote", "date_posted_days", "max_results"] },
  { id: "hiring_cafe", label: "HiringCafe", search_fields: ["keywords", "location", "max_results"] },
  { id: "boss", label: "Boss", search_fields: ["keywords", "location", "max_results"] },
];

describe("sourcesForField", () => {
  it("tags remote as LinkedIn-only in a multi-source EN preset", () => {
    const selected = ["linkedin", "hiring_cafe"];
    expect(sourcesForField("remote", selected, catalog).map((s) => s.id)).toEqual(["linkedin"]);
    expect(fieldIsPartial("remote", selected, catalog)).toBe(true);
    expect(fieldIsPartial("keywords", selected, catalog)).toBe(false);
  });
});

describe("presetLoadWarnings", () => {
  it("ignores stale source-specific fields without failing the preset", () => {
    const warnings = presetLoadWarnings(
      {
        sources: ["linkedin", "hiring_cafe", "gone"],
        common_filters: {
          keywords: "ux",
          location: "",
          remote: true,
          date_posted_days: 7,
          max_results: 50,
        },
        source_overrides: {
          hiring_cafe: { remote: true, gone: "x" },
        },
      },
      catalog,
    );
    expect(warnings.some((w) => w.includes("gone is no longer available"))).toBe(true);
    expect(warnings.some((w) => w.includes("hiring_cafe"))).toBe(true);
  });
});

describe("snapshotEquals", () => {
  it("treats source order as irrelevant", () => {
    const common = {
      keywords: "ux",
      location: "US",
      remote: true as boolean | null,
      date_posted_days: 7,
      max_results: 50,
    };
    expect(
      snapshotEquals(
        { sources: ["hiring_cafe", "linkedin"], common, overrides: {} },
        { sources: ["linkedin", "hiring_cafe"], common, overrides: {} },
      ),
    ).toBe(true);
  });
});
