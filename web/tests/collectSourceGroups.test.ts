import { describe, expect, it } from "vitest";

import {
  bucketCollectSources,
  groupCheckState,
  initialSourceSelection,
  persistableSourceIds,
  resolveSourceGroup,
  toggleGroupSelection,
  toggleSourceSelection,
} from "@/lib/collectSourceGroups";

const catalog = [
  { id: "zhaopin", kind: "platform" as const, enabled: true, runnable: true },
  { id: "liepin", kind: "platform" as const, enabled: true, runnable: true },
  { id: "boss", kind: "platform" as const, enabled: true, runnable: true },
  { id: "hiring_cafe", kind: "platform" as const, enabled: true, runnable: true },
  { id: "linkedin", kind: "platform" as const, enabled: true, runnable: true },
  { id: "impactpool", kind: "vertical" as const, enabled: true, runnable: true },
  { id: "dimagi", kind: "career_page" as const, enabled: true, runnable: true },
  { id: "automattic", kind: "career_page" as const, enabled: true, runnable: true },
  { id: "palantir", kind: "career_page" as const, enabled: true, runnable: true },
  { id: "tencent", kind: "career_page" as const, enabled: true, runnable: true },
  { id: "unwired", kind: "platform" as const, enabled: true, runnable: false },
  { id: "fao", kind: "career_page" as const, enabled: false, runnable: true },
];

describe("resolveSourceGroup", () => {
  it("maps kind and prefers explicit source_group", () => {
    expect(resolveSourceGroup({ id: "x", kind: "career_page" })).toBe("company_careers");
    expect(resolveSourceGroup({ id: "x", kind: "vertical" })).toBe("vertical");
    expect(resolveSourceGroup({ id: "x", kind: "platform" })).toBe("platform");
    expect(
      resolveSourceGroup({ id: "x", kind: "platform", source_group: "company_careers" }),
    ).toBe("company_careers");
  });
});

describe("bucketCollectSources", () => {
  it("splits into three groups and drops non-runnable sources", () => {
    const buckets = bucketCollectSources(catalog);
    expect(buckets.map((b) => b.id)).toEqual(["platform", "vertical", "company_careers"]);
    expect(buckets[0].sources.map((s) => s.id)).toEqual([
      "zhaopin",
      "liepin",
      "boss",
      "hiring_cafe",
      "linkedin",
    ]);
    expect(buckets[1].sources.map((s) => s.id)).toEqual(["impactpool"]);
    expect(buckets[2].sources.map((s) => s.id)).toEqual([
      "dimagi",
      "automattic",
      "palantir",
      "tencent",
    ]);
    expect(buckets.flatMap((b) => b.sources.map((s) => s.id))).not.toContain("unwired");
    expect(buckets.flatMap((b) => b.sources.map((s) => s.id))).not.toContain("fao");
  });
});

describe("group selection", () => {
  it("selects all, then clears all, and reports partial", () => {
    const ids = ["zhaopin", "liepin", "boss"];
    const all = toggleGroupSelection(ids, new Set());
    expect([...all].sort()).toEqual([...ids].sort());
    expect(groupCheckState(ids, all)).toBe("all");

    const none = toggleGroupSelection(ids, all);
    expect(none.size).toBe(0);
    expect(groupCheckState(ids, none)).toBe("none");

    const partial = toggleSourceSelection("liepin", new Set(["zhaopin"]));
    expect(groupCheckState(ids, partial)).toBe("partial");
    expect(partial.has("liepin")).toBe(true);
    expect(partial.has("zhaopin")).toBe(true);
  });
});

describe("persistence", () => {
  it("stores individual ids and does not add new group members later", () => {
    const saved = persistableSourceIds(["zhaopin", "gone"], ["zhaopin", "liepin"]);
    expect(saved).toEqual(["zhaopin"]);
    const nextCatalog = ["zhaopin", "liepin", "boss"];
    expect(initialSourceSelection(saved, nextCatalog, ["zhaopin", "liepin"])).toEqual([
      "zhaopin",
    ]);
  });

  it("uses defaults only when nothing was remembered", () => {
    expect(
      initialSourceSelection(null, ["zhaopin", "liepin", "boss"], ["zhaopin", "liepin"]),
    ).toEqual(["zhaopin", "liepin"]);
    expect(initialSourceSelection([], ["zhaopin"], ["zhaopin"])).toEqual([]);
  });
});
