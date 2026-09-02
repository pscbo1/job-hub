import { describe, expect, it } from "vitest";

import {
  MANAGE_SOURCES_COPY,
  filterManagedSources,
  isCompanyKind,
  sourceKindOf,
  type CompanySourceRow,
} from "@/lib/companySources";

function row(partial: Partial<CompanySourceRow>): CompanySourceRow {
  return {
    id: "x",
    company: "Acme",
    kind: "company",
    collect_cn: false,
    collect_en: true,
    enabled: true,
    include_in_run: false,
    tags: [],
    note: "",
    ...partial,
  };
}

describe("manage sources one table", () => {
  it("keeps companies and verticals on the same list with a type field", () => {
    expect(MANAGE_SOURCES_COPY.title).toBe("Manage sources");
    expect(MANAGE_SOURCES_COPY.subtitle.toLowerCase()).toMatch(/one table/);
    expect(sourceKindOf({ kind: "wechat" })).toBe("wechat");
    expect(sourceKindOf({ kind: "vertical", channel_type: "community" })).toBe("community");
    expect(isCompanyKind({ kind: "wechat" })).toBe(false);
    expect(isCompanyKind({ kind: "company" })).toBe(true);
  });

  it("filters the shared list by type and tag", () => {
    const rows = [
      row({ id: "a", tags: ["research"] }),
      row({ id: "b", company: "Beta", tags: ["civic"] }),
      row({ id: "w", company: "Research Circle", kind: "wechat", tags: ["research"] }),
      row({ id: "c", company: "Discord", kind: "community", tags: ["civic"] }),
    ];
    expect(filterManagedSources(rows, { type: "wechat" }).map((item) => item.id)).toEqual(["w"]);
    expect(filterManagedSources(rows, { type: "company" }).map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
    expect(filterManagedSources(rows, { tag: "research" }).map((item) => item.id)).toEqual([
      "a",
      "w",
    ]);
  });
});
