import { describe, expect, it } from "vitest";

import {
  buildCollectToast,
  collectQueryFilters,
  formatCollectPlan,
  formatCollectResult,
  formatFailedSourcesLine,
  formatPoolTotal,
  shouldShowPoolTotal,
} from "@/lib/collectCopy";

describe("collect copy", () => {
  it("maps Remote and Posted onto collect API params", () => {
    expect(collectQueryFilters(false, "")).toEqual({});
    expect(collectQueryFilters(true, "")).toEqual({ remote: true });
    expect(collectQueryFilters(false, "7")).toEqual({ date_posted_days: 7 });
    expect(collectQueryFilters(true, "1")).toEqual({ remote: true, date_posted_days: 1 });
    expect(collectQueryFilters(true, "abc")).toEqual({ remote: true });
  });

  it("summarizes the live plan per source", () => {
    expect(formatCollectPlan(3, 100)).toBe("3 sources selected · up to 100 jobs/source");
    expect(formatCollectPlan(1, 50)).toBe("1 source selected · up to 50 jobs/source");
    expect(formatCollectPlan(0, 100)).toBe("0 sources selected · up to 100 jobs/source");
  });

  it("formats a user-facing collect result", () => {
    expect(formatCollectResult(126, 54, 8)).toBe("126 new · 54 refreshed · 8 excluded");
  });

  it("formats the Job Pool total", () => {
    expect(formatPoolTotal(156)).toBe("Job Pool now has 156 jobs");
    expect(formatPoolTotal(1)).toBe("Job Pool now has 1 job");
  });

  it("hides a zero pool total when new jobs were added (fetch likely failed)", () => {
    expect(shouldShowPoolTotal(0, 10)).toBe(false);
    expect(shouldShowPoolTotal(0, 0)).toBe(true);
    expect(shouldShowPoolTotal(156, 100)).toBe(true);
  });

  it("builds a compact success toast", () => {
    expect(
      buildCollectToast({
        status: "completed",
        created: 83,
        updated: 27,
        excluded: 6,
        poolTotal: 412,
        failedLabels: [],
        othersContinued: true,
      }),
    ).toEqual({
      title: "Collect complete",
      lines: ["83 new · 27 refreshed · 6 excluded", "Job Pool: 412 total"],
    });
  });

  it("builds a compact partial-failure toast", () => {
    expect(formatFailedSourcesLine(["Liepin"], true)).toBe(
      "Liepin failed; other sources continued",
    );
    expect(
      buildCollectToast({
        status: "partial",
        created: 10,
        updated: 0,
        excluded: 0,
        poolTotal: 50,
        failedLabels: ["Liepin"],
        othersContinued: true,
      }),
    ).toEqual({
      title: "Collect partially completed",
      lines: ["Liepin failed; other sources continued"],
    });
  });
});
