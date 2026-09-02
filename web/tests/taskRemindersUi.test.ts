import { describe, expect, it } from "vitest";

import {
  canAddAdvanceReminder,
  isValidAdvanceReminder,
  previewReminderPlan,
  reminderDatesFromTask,
  reminderDueStatus,
  uniqueSortedDates,
} from "@/lib/taskRemindersUi";

describe("task reminder helpers", () => {
  it("requires a future due date to add advance reminders", () => {
    expect(canAddAdvanceReminder("", "2026-09-02")).toBe(false);
    expect(canAddAdvanceReminder("2026-09-02", "2026-09-02")).toBe(false);
    expect(canAddAdvanceReminder("2026-09-10", "2026-09-02")).toBe(true);
  });

  it("keeps past saved dates and rejects new past dates", () => {
    expect(isValidAdvanceReminder("2026-08-30", "2026-09-10", "2026-09-02", ["2026-08-30"])).toBe(
      true,
    );
    expect(isValidAdvanceReminder("2026-08-30", "2026-09-10", "2026-09-02", [])).toBe(false);
    expect(isValidAdvanceReminder("2026-09-04", "2026-09-10", "2026-09-02", [])).toBe(true);
    expect(isValidAdvanceReminder("2026-09-10", "2026-09-10", "2026-09-02", [])).toBe(false);
  });

  it("previews a due change and restores an unedited saved cycle", () => {
    expect(
      previewReminderPlan({
        nextDue: "2026-09-20",
        previousDue: "2026-09-10",
        currentDates: ["2026-09-04", "2026-09-10"],
        today: "2026-09-02",
        savedByDue: {},
        editedThisSession: false,
      }),
    ).toEqual(["2026-09-04", "2026-09-20"]);
    expect(
      previewReminderPlan({
        nextDue: "2026-09-10",
        previousDue: "2026-09-20",
        currentDates: ["2026-09-04", "2026-09-20"],
        today: "2026-09-02",
        savedByDue: { "2026-09-10": ["2026-09-04", "2026-09-10"] },
        editedThisSession: false,
      }),
    ).toEqual(["2026-09-04", "2026-09-10"]);
  });

  it("reads reminder dates from a task and sorts them", () => {
    expect(
      reminderDatesFromTask({
        due_at: "2026-09-10",
        reminders: [
          {
            id: "1",
            task_id: "t",
            due_date: "2026-09-10",
            reminder_on: "2026-09-10",
            kind: "due",
            enabled: true,
            created_at: "",
          },
          {
            id: "2",
            task_id: "t",
            due_date: "2026-09-10",
            reminder_on: "2026-09-04",
            kind: "advance",
            enabled: true,
            created_at: "",
          },
        ],
      }),
    ).toEqual(["2026-09-04", "2026-09-10"]);
    expect(uniqueSortedDates(["2026-09-10", "2026-09-04", "2026-09-10"])).toEqual([
      "2026-09-04",
      "2026-09-10",
    ]);
    expect(reminderDueStatus("2026-09-02", "2026-09-02")).toBe("due_today");
    expect(reminderDueStatus("2026-09-01", "2026-09-02")).toBe("overdue");
  });
});
