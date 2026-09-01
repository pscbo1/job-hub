import { describe, expect, it } from "vitest";

import {
  HUB_JOB_STATUSES,
  POOL_STATUS_CHIPS,
  compareActiveJobs,
  jobVisibleInPool,
  openTasks,
  openTasksSorted,
  statusChipLabel,
  taskDueUrgency,
} from "../lib/jobPipeline";
import type { HubJob } from "../lib/api";

function job(partial: Partial<HubJob> & { id: string }): HubJob {
  return {
    title: "A",
    company: "",
    location: "",
    source: "",
    job_url: "",
    published_at: null,
    discovered_at: "2026-08-01T00:00:00Z",
    status: "to_do",
    match_score: null,
    ...partial,
  };
}

describe("job pipeline", () => {
  it("lists the seven Job stages in pipeline order", () => {
    expect(HUB_JOB_STATUSES).toEqual([
      "reference",
      "under_study",
      "to_do",
      "applied",
      "interview",
      "offer",
      "closed",
    ]);
  });

  it("puts Active and To Do only first on the pool chips", () => {
    expect(POOL_STATUS_CHIPS.slice(0, 2)).toEqual(["all", "to_do"]);
    expect(statusChipLabel("under_study")).toBe("Under Study");
    expect(statusChipLabel("to_do")).toBe("To Do only");
    expect(statusChipLabel("all")).toBe("Active");
  });

  it("hides closed jobs from the main board by default", () => {
    expect(jobVisibleInPool("under_study", "all", false)).toBe(true);
    expect(jobVisibleInPool("closed", "all", false)).toBe(false);
    expect(jobVisibleInPool("closed", "all", true)).toBe(true);
    expect(jobVisibleInPool("closed", "closed", false)).toBe(true);
    expect(jobVisibleInPool("to_do", "closed", false)).toBe(false);
  });

  it("sorts To Do ahead of other stages and by soonest DDL or task due", () => {
    const toDoLate = job({
      id: "1",
      deadline: "2026-09-20",
    });
    const toDoSoon = job({
      id: "2",
      discovered_at: "2026-08-02T00:00:00Z",
      tasks: [
        {
          id: "t1",
          job_id: "2",
          title: "OA",
          due_at: "2026-09-02",
          done: false,
          sort_order: 0,
          created_at: "2026-08-02T00:00:00Z",
        },
      ],
    });
    const studying = job({
      id: "3",
      status: "under_study",
      deadline: "2026-09-01",
    });
    const ranked = [studying, toDoLate, toDoSoon].sort(compareActiveJobs);
    expect(ranked.map((j) => j.id)).toEqual(["2", "1", "3"]);
  });

  it("surfaces open tasks soonest-due first and ignores completed ones", () => {
    const row = job({
      id: "4",
      tasks: [
        {
          id: "done",
          job_id: "4",
          title: "Done",
          due_at: "2026-08-01",
          done: true,
          sort_order: 0,
          created_at: "2026-08-01T00:00:00Z",
        },
        {
          id: "later",
          job_id: "4",
          title: "Later",
          due_at: "2026-09-10",
          done: false,
          sort_order: 1,
          created_at: "2026-08-01T00:00:00Z",
        },
        {
          id: "soon",
          job_id: "4",
          title: "Soon",
          due_at: "2026-09-02",
          done: false,
          sort_order: 2,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });
    expect(openTasks(row).map((t) => t.id)).toEqual(["later", "soon"]);
    expect(openTasksSorted(row).map((t) => t.id)).toEqual(["soon", "later"]);
    expect(taskDueUrgency("2026-08-31", "2026-09-01")).toBe("overdue");
    expect(taskDueUrgency("2026-09-01", "2026-09-01")).toBe("today");
    expect(taskDueUrgency("2026-09-03", "2026-09-01")).toBe("upcoming");
    expect(taskDueUrgency(null, "2026-09-01")).toBe("none");
  });
});
