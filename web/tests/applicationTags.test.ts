import { describe, expect, it } from "vitest";

import { APPLICATION_LIST_COLUMN_KEYS, APPLICATION_VIEW_OPTIONS_GROUPS } from "@/lib/applicationUi";
import {
  applicationMatchesTags,
  normalizeApplicationTags,
  suggestApplicationTags,
  uniqueApplicationTags,
} from "@/lib/applicationTags";

describe("application direction tags", () => {
  it("normalizes free text and reuses an existing spelling", () => {
    expect(normalizeApplicationTags([" 用户研究 ", "", "用户研究", "产品"], ["用户研究"])).toEqual([
      "用户研究",
      "产品",
    ]);
  });

  it("collects unique tags and suggests unused ones", () => {
    const apps = [{ tags: ["用户研究"] }, { tags: ["产品", "英文岗位"] }, { tags: [] }];
    expect(uniqueApplicationTags(apps)).toEqual(["用户研究", "产品", "英文岗位"]);
    expect(suggestApplicationTags(["用户研究"], uniqueApplicationTags(apps))).toEqual([
      "产品",
      "英文岗位",
    ]);
  });

  it("filters by any selected tag and matches all when none are selected", () => {
    const research = { tags: ["用户研究"] };
    const product = { tags: ["产品"] };
    expect(applicationMatchesTags(research, [])).toBe(true);
    expect(applicationMatchesTags(research, ["用户研究"])).toBe(true);
    expect(applicationMatchesTags(product, ["用户研究"])).toBe(false);
    expect(applicationMatchesTags(product, ["用户研究", "产品"])).toBe(true);
  });

  it("does not add a tags column to the applications list", () => {
    expect(APPLICATION_LIST_COLUMN_KEYS).not.toContain("tags");
    expect(APPLICATION_VIEW_OPTIONS_GROUPS.tags).toBe("Tags");
  });
});
