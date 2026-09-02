import type { JobTask, TaskReminder } from "@/lib/api";
import { todayInAppTz } from "@/lib/timezone";

export function uniqueSortedDates(dates: string[]): string[] {
  return [...new Set(dates.map((d) => d.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
}

export function reminderDatesFromTask(task: Pick<JobTask, "due_at" | "reminders">): string[] {
  const due = task.due_at?.slice(0, 10) ?? "";
  const fromRows = (task.reminders ?? [])
    .filter((row) => row.enabled !== false)
    .map((row) => row.reminder_on.slice(0, 10));
  if (fromRows.length > 0) return uniqueSortedDates(fromRows);
  return due ? [due] : [];
}

export function canAddAdvanceReminder(due: string, today = todayInAppTz()): boolean {
  const day = due.slice(0, 10);
  return Boolean(day) && day > today;
}

export function isValidAdvanceReminder(
  value: string,
  due: string,
  today = todayInAppTz(),
  existing: string[] = [],
): boolean {
  const day = value.slice(0, 10);
  const dueDay = due.slice(0, 10);
  if (!day || !dueDay || day >= dueDay) return false;
  if (day < today && !existing.includes(day)) return false;
  return true;
}

export function previewReminderPlan(args: {
  nextDue: string;
  previousDue: string;
  currentDates: string[];
  today?: string;
  savedByDue: Record<string, string[]>;
  editedThisSession: boolean;
}): string[] {
  const today = args.today ?? todayInAppTz();
  const nextDue = args.nextDue.slice(0, 10);
  if (!nextDue) return [];
  if (!args.editedThisSession && args.savedByDue[nextDue]?.length) {
    return uniqueSortedDates(args.savedByDue[nextDue]);
  }
  const previousDue = args.previousDue.slice(0, 10);
  const kept = args.currentDates
    .map((d) => d.slice(0, 10))
    .filter((d) => d !== previousDue && d !== nextDue && d >= today && d < nextDue);
  return uniqueSortedDates([...kept, nextDue]);
}

export function reminderDueStatus(
  due: string,
  today = todayInAppTz(),
): "upcoming" | "due_today" | "overdue" {
  const day = due.slice(0, 10);
  if (day < today) return "overdue";
  if (day === today) return "due_today";
  return "upcoming";
}

export function reminderDueStatusLabel(status: "upcoming" | "due_today" | "overdue"): string {
  if (status === "due_today") return "Due today";
  if (status === "overdue") return "Overdue";
  return "Upcoming";
}

export function savedPlansFromReminders(reminders: TaskReminder[] | undefined, due: string | null): Record<string, string[]> {
  const dueDay = due?.slice(0, 10) ?? "";
  const dates = (reminders ?? [])
    .filter((row) => row.enabled !== false)
    .map((row) => row.reminder_on.slice(0, 10));
  if (!dueDay) return {};
  const list = dates.length > 0 ? uniqueSortedDates(dates) : [dueDay];
  return { [dueDay]: list };
}
