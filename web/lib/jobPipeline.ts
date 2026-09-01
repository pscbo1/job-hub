import type { HubJob, JobEngagement } from "@/lib/api";

export const JOB_ENGAGEMENTS: JobEngagement[] = ["reference", "under_study", "to_do"];

/** Pool chips: Active + To Do only first, then the rest of Job engagement. */
export const POOL_ENGAGEMENT_CHIPS: string[] = ["all", "to_do", "under_study", "reference", "unset"];

export const JOB_ENGAGEMENT_LABELS: Record<JobEngagement, string> = {
  reference: "Reference",
  under_study: "Under Study",
  to_do: "To Do",
};

const ENGAGEMENT_RANK: Record<string, number> = {
  to_do: 0,
  under_study: 1,
  reference: 2,
};

export function engagementChipLabel(key: string): string {
  if (key === "all") return "Active";
  if (key === "to_do") return "To Do only";
  if (key === "unset") return "Discovery";
  if (key === "under_study") return "Under study";
  if (key in JOB_ENGAGEMENT_LABELS) {
    return JOB_ENGAGEMENT_LABELS[key as JobEngagement];
  }
  return key;
}

export function jobVisibleInPool(
  engagement: JobEngagement | null,
  filter: string,
  showArchived: boolean,
  archivedAt?: string | null,
): boolean {
  if (!showArchived && archivedAt) return false;
  if (filter === "unset") return engagement === null;
  if (filter !== "all" && engagement !== filter) return false;
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

function soonestActionDate(job: HubJob): string {
  const dates = [job.deadline, ...openTasks(job).map((t) => t.due_at).filter(Boolean)].filter(
    Boolean,
  ) as string[];
  if (dates.length === 0) return "9999-12-31";
  return dates.map((d) => d.slice(0, 10)).sort()[0];
}

function engagementOf(job: HubJob): JobEngagement | null {
  return job.engagement ?? job.status ?? null;
}

/** To Do first, then soonest DDL/task due, then newest discovered. */
export function compareActiveJobs(a: HubJob, b: HubJob): number {
  const ra = ENGAGEMENT_RANK[engagementOf(a) ?? ""] ?? 7;
  const rb = ENGAGEMENT_RANK[engagementOf(b) ?? ""] ?? 7;
  if (ra !== rb) return ra - rb;
  const da = soonestActionDate(a);
  const db = soonestActionDate(b);
  if (da !== db) return da.localeCompare(db);
  return b.discovered_at.localeCompare(a.discovered_at);
}

export function taskChipText(title: string, dueAt?: string | null): string {
  const short = title.length > 18 ? `${title.slice(0, 16)}…` : title;
  return dueAt ? `${short} ${dueAt.slice(0, 10)}` : short;
}
