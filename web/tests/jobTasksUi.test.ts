import { describe, expect, it } from "vitest";

import {
  applicationHasLinkedJob,
  canCreateJobTask,
  jobIdFromSearch,
  taskCreatedSummary,
  taskJobAnchorId,
  tasksPageHref,
} from "@/lib/jobTasksUi";

describe("application task helpers", () => {
  it("requires a linked job and a title", () => {
    expect(applicationHasLinkedJob(undefined)).toBe(false);
    expect(applicationHasLinkedJob("")).toBe(false);
    expect(applicationHasLinkedJob("  ")).toBe(false);
    expect(applicationHasLinkedJob("job-1")).toBe(true);
    expect(canCreateJobTask("")).toBe(false);
    expect(canCreateJobTask("  ")).toBe(false);
    expect(canCreateJobTask("Prep OA")).toBe(true);
  });

  it("builds Open in Tasks href and job anchors", () => {
    expect(tasksPageHref("demo-hub-2")).toBe("/tasks?job=demo-hub-2");
    expect(tasksPageHref("demo-hub-2", "task-9")).toBe("/tasks?job=demo-hub-2&task=task-9");
    expect(taskJobAnchorId("demo-hub-2")).toBe("task-job-demo-hub-2");
    expect(jobIdFromSearch("?job=demo-hub-2")).toBe("demo-hub-2");
    expect(jobIdFromSearch("tab=packet")).toBe("");
  });

  it("summarizes a saved task without implying submit", () => {
    expect(taskCreatedSummary({ title: "Prep OA", due_at: "2026-09-05" })).toBe(
      "Prep OA · due 2026-09-05",
    );
    expect(
      taskCreatedSummary({
        title: "Case",
        due_at: null,
        notes: "Bring slides",
        source_url: "https://example.com/oa",
      }),
    ).toBe("Case · with notes · with source link");
  });
});
