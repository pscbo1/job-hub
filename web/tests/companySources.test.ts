import { describe, expect, it } from "vitest";

import {
  COMPANY_SOURCES_COPY,
  companySourceTags,
  filterCompanySources,
  type CompanySourceRow,
} from "@/lib/companySources";

function row(partial: Partial<CompanySourceRow>): CompanySourceRow {
  return {
    id: "x",
    company: "Acme",
    collect_cn: false,
    collect_en: true,
    enabled: true,
    include_in_run: false,
    tags: [],
    note: "",
    ...partial,
  };
}

describe("company sources copy", () => {
  it("is a company table, not jobs", () => {
    expect(COMPANY_SOURCES_COPY.title).toBe("Company Sources");
    expect(COMPANY_SOURCES_COPY.thisRun).toBe("This run");
    expect(COMPANY_SOURCES_COPY.subtitle.toLowerCase()).toMatch(/not jobs/);
  });
});

describe("company source filters", () => {
  it("filters by free-text tag without a tag admin", () => {
    const rows = [
      row({ id: "a", tags: ["research"] }),
      row({ id: "b", company: "Beta", tags: ["civic"] }),
    ];
    expect(filterCompanySources(rows, "research").map((item) => item.id)).toEqual(["a"]);
    expect(companySourceTags(rows)).toEqual(["research", "civic"]);
  });
});
