import type { HubJob } from "@/lib/api";

export const DISCOVER_CHIPS = ["all", "saved", "reference"] as const;
export type DiscoverChip = (typeof DISCOVER_CHIPS)[number];

export function discoverChipLabel(key: DiscoverChip): string {
  if (key === "saved") return "Saved";
  if (key === "reference") return "Reference";
  return "All";
}

export function jobMatchesDiscoverChip(job: HubJob, filter: DiscoverChip): boolean {
  if (filter === "saved") return Boolean(job.favorite);
  if (filter === "reference") return Boolean(job.reference);
  return true;
}

export function dateInputValue(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function isDateOverdue(iso?: string | null, todayIso?: string): boolean {
  if (!iso) return false;
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10) < today;
}

export function openTasks(job: HubJob) {
  return (job.tasks ?? []).filter((t) => !t.done);
}

export function isDateDueToday(iso?: string | null, todayIso?: string): boolean {
  if (!iso) return false;
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10) === today;
}

export type TaskDueUrgency = "overdue" | "today" | "upcoming" | "none";

export function taskDueUrgency(dueAt?: string | null, todayIso?: string): TaskDueUrgency {
  if (!dueAt) return "none";
  if (isDateOverdue(dueAt, todayIso)) return "overdue";
  if (isDateDueToday(dueAt, todayIso)) return "today";
  return "upcoming";
}

/** Open checklist items, soonest due first (undated last). */
export function openTasksSorted(job: HubJob) {
  return [...openTasks(job)].sort((a, b) => {
    const da = a.due_at?.slice(0, 10) ?? "9999-12-31";
    const db = b.due_at?.slice(0, 10) ?? "9999-12-31";
    return da.localeCompare(db);
  });
}

export function soonestDueDate(job: HubJob): string | null {
  const dates = [job.deadline, ...openTasks(job).map((t) => t.due_at).filter(Boolean)].filter(
    Boolean,
  ) as string[];
  if (dates.length === 0) return null;
  return dates.map((d) => d.slice(0, 10)).sort()[0];
}

export function compareByDueThenTitle(a: HubJob, b: HubJob): number {
  const da = soonestDueDate(a) ?? "9999-12-31";
  const db = soonestDueDate(b) ?? "9999-12-31";
  if (da !== db) return da.localeCompare(db);
  return a.title.localeCompare(b.title);
}

export function taskChipText(title: string, dueAt?: string | null): string {
  const short = title.length > 18 ? `${title.slice(0, 16)}…` : title;
  return dueAt ? `${short} ${dueAt.slice(0, 10)}` : short;
}

export function taskBoardSection(job: HubJob, todayIso?: string): TaskDueUrgency {
  const due = soonestDueDate(job);
  return taskDueUrgency(due, todayIso);
}
