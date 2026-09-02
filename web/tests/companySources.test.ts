import { describe, expect, it } from "vitest";

import {
  COMPANY_SOURCES_COPY,
  MANAGE_SOURCES_COPY,
  VERTICAL_CHANNELS_COPY,
  companySourceTags,
  filterCompanySources,
  filterVerticalChannels,
  isCompanyKind,
  verticalChannelTags,
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

describe("manage sources tabs", () => {
  it("is one page with Companies and Vertical channels sheets", () => {
    expect(MANAGE_SOURCES_COPY.companiesTab).toBe("Companies");
    expect(MANAGE_SOURCES_COPY.verticalsTab).toBe("Vertical channels");
    expect(COMPANY_SOURCES_COPY.add).toBe("Add company");
    expect(VERTICAL_CHANNELS_COPY.add).toBe("Add channel");
    expect(JSON.stringify({ ...COMPANY_SOURCES_COPY, ...VERTICAL_CHANNELS_COPY })).not.toMatch(
      /careers|greenhouse|yaml|adapter|scraper|config path|handle/i,
    );
    expect(isCompanyKind({ kind: "wechat" })).toBe(false);
    expect(isCompanyKind({ kind: "company" })).toBe(true);
  });

  it("keeps each tab's table and tag filter separate", () => {
    const rows = [
      row({ id: "a", tags: ["research"] }),
      row({ id: "b", company: "Beta", tags: ["civic"] }),
      row({ id: "w", company: "Research Circle", kind: "wechat", tags: ["research"] }),
      row({ id: "c", company: "Civic Discord", kind: "community", tags: ["civic"] }),
    ];
    expect(filterCompanySources(rows, "").map((item) => item.id)).toEqual(["a", "b"]);
    expect(filterCompanySources(rows, "research").map((item) => item.id)).toEqual(["a"]);
    expect(filterVerticalChannels(rows, "").map((item) => item.id)).toEqual(["w", "c"]);
    expect(filterVerticalChannels(rows, "research").map((item) => item.id)).toEqual(["w"]);
    expect(companySourceTags(rows)).toEqual(["research", "civic"]);
    expect(verticalChannelTags(rows)).toEqual(["research", "civic"]);
  });
});
