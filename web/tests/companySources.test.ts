import { describe, expect, it } from "vitest";

import {
  COMPANY_SOURCES_COPY,
  MANAGE_SOURCES_COPY,
  VERTICAL_CHANNELS_COPY,
  companySourceTags,
  filterCompanySources,
  filterVerticalChannels,
  isCompanySourceRow,
  type CompanySourceRow,
  type VerticalChannelRow,
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

function channel(partial: Partial<VerticalChannelRow>): VerticalChannelRow {
  return {
    id: "v",
    name: "Research Circle",
    channel_type: "wechat",
    handle: "",
    enabled: true,
    tags: [],
    note: "",
    kind: "vertical",
    ...partial,
  };
}

describe("manage sources classes", () => {
  it("keeps companies and vertical channels as separate classes", () => {
    expect(MANAGE_SOURCES_COPY.companiesTab).toBe("Companies");
    expect(MANAGE_SOURCES_COPY.verticalsTab).toBe("Vertical channels");
    expect(COMPANY_SOURCES_COPY.title).toBe("Companies");
    expect(VERTICAL_CHANNELS_COPY.subtitle.toLowerCase()).toMatch(/does not scrape/);
    expect(isCompanySourceRow({ kind: "vertical" })).toBe(false);
    expect(isCompanySourceRow({ kind: "company" })).toBe(true);
  });
});

describe("company source filters", () => {
  it("filters companies by tag and never treats a vertical as a company row", () => {
    const rows = [
      row({ id: "a", tags: ["research"] }),
      row({ id: "b", company: "Beta", tags: ["civic"] }),
      row({ id: "impactpool", company: "Impactpool", kind: "vertical", tags: ["research"] }),
    ];
    expect(filterCompanySources(rows, "research").map((item) => item.id)).toEqual(["a"]);
    expect(companySourceTags(rows)).toEqual(["research", "civic"]);
  });
});

describe("vertical channel filters", () => {
  it("filters the vertical class by type and tag", () => {
    const rows = [
      channel({ id: "w", channel_type: "wechat", tags: ["research"] }),
      channel({ id: "c", name: "Discord", channel_type: "community", tags: ["civic"] }),
      channel({ id: "o", name: "Other", channel_type: "other", tags: ["research"] }),
    ];
    expect(filterVerticalChannels(rows, { type: "wechat" }).map((item) => item.id)).toEqual(["w"]);
    expect(filterVerticalChannels(rows, { tag: "research" }).map((item) => item.id)).toEqual([
      "w",
      "o",
    ]);
  });
});
