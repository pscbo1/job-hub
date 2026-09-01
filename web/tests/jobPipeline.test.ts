import { describe, expect, it } from "vitest";

import { DISCOVER_CHIPS, discoverChipLabel, jobMatchesDiscoverChip, taskDueUrgency } from "../lib/jobPipeline";
import { groupTasksByDue, jobBelongsOnTasks, jobMatchesTaskSearch } from "../lib/taskBoard";
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
    engagement: null,
    status: null,
    match_score: null,
    ...partial,
  };
}

describe("discover chips", () => {
  it("is All / Saved / Reference only", () => {
    expect([...DISCOVER_CHIPS]).toEqual(["all", "saved", "reference"]);
    expect(discoverChipLabel("all")).toBe("All");
    expect(discoverChipLabel("saved")).toBe("Saved");
    expect(discoverChipLabel("reference")).toBe("Reference");
  });

  it("lets Save and Reference coexist", () => {
    const both = job({ id: "1", favorite: true, reference: true });
    expect(jobMatchesDiscoverChip(both, "all")).toBe(true);
    expect(jobMatchesDiscoverChip(both, "saved")).toBe(true);
    expect(jobMatchesDiscoverChip(both, "reference")).toBe(true);
    expect(jobMatchesDiscoverChip(job({ id: "2" }), "saved")).toBe(false);
  });
});

describe("task board", () => {
  it("groups overdue / today / upcoming / no date", () => {
    const grouped = groupTasksByDue(
      [
        job({ id: "over", deadline: "2026-08-31" }),
        job({ id: "today", deadline: "2026-09-01" }),
        job({ id: "soon", deadline: "2026-09-10" }),
        job({ id: "none", next_step: "email" }),
      ],
      "2026-09-01",
    );
    expect(grouped.overdue.map((j) => j.id)).toEqual(["over"]);
    expect(grouped.today.map((j) => j.id)).toEqual(["today"]);
    expect(grouped.upcoming.map((j) => j.id)).toEqual(["soon"]);
    expect(grouped.none.map((j) => j.id)).toEqual(["none"]);
  });

  it("searches title, company, next_step and task titles, not discovered_at", () => {
    const row = job({
      id: "1",
      title: "Platform",
      company: "Stripe",
      next_step: "follow up",
      discovered_at: "2026-01-15T00:00:00Z",
      tasks: [
        {
          id: "t",
          job_id: "1",
          title: "Take-home OA",
          due_at: null,
          done: false,
          sort_order: 0,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });
    expect(jobMatchesTaskSearch(row, "platform")).toBe(true);
    expect(jobMatchesTaskSearch(row, "take-home")).toBe(true);
    expect(jobMatchesTaskSearch(row, "2026-01-15")).toBe(false);
    expect(taskDueUrgency("2026-08-31", "2026-09-01")).toBe("overdue");
  });

  it("keeps Save-only and plain Discover jobs off the board", () => {
    expect(jobBelongsOnTasks(job({ id: "plain" }))).toBe(false);
    expect(jobBelongsOnTasks(job({ id: "saved", favorite: true, reference: true }))).toBe(false);
    expect(jobBelongsOnTasks(job({ id: "next", next_step: "email" }))).toBe(true);
    expect(jobBelongsOnTasks(job({ id: "draft" }), true)).toBe(true);
  });
});
