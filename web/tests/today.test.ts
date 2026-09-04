import { describe, expect, it } from "vitest";

import { todaySuggestions, todayWorkspaceState } from "@/lib/today";

describe("today suggestions", () => {
  it("uses getting-started cards only when the workspace is empty", () => {
    const empty = todaySuggestions({ hasJobs: false, hasApplications: false, hasTasks: false });
    expect(todayWorkspaceState({ hasJobs: false, hasApplications: false, hasTasks: false })).toEqual({
      label: "Getting started",
      empty: true,
    });
    expect(empty.map((item) => item.href)).toEqual(["/search", "/settings", "/tasks"]);
  });

  it("does not keep empty-workspace cards when records exist", () => {
    const filled = todaySuggestions({ hasJobs: true, hasApplications: true, hasTasks: true });
    expect(todayWorkspaceState({ hasJobs: true, hasApplications: true, hasTasks: true })).toEqual({
      label: "Next steps",
      empty: false,
    });
    expect(filled.map((item) => item.href)).toEqual(["/tasks", "/applications", "/jobs"]);
    expect(filled.some((item) => item.label.includes("Collect"))).toBe(false);
  });

  it("does not special-case demo company names", () => {
    const jobsOnly = todaySuggestions({ hasJobs: true, hasApplications: false, hasTasks: false });
    expect(jobsOnly).toHaveLength(1);
    expect(jobsOnly[0]?.href).toBe("/jobs");
  });
});
