import type { HubCloseReason, HubJob, HubJobStatus } from "@/lib/api";

export const HUB_JOB_STATUSES: HubJobStatus[] = [
  "reference",
  "under_study",
  "to_do",
  "applied",
  "interview",
  "offer",
  "closed",
];

/** Pool chips: Active + To Do only first, then the rest of the pipeline. */
export const POOL_STATUS_CHIPS: string[] = [
  "all",
  "to_do",
  ...HUB_JOB_STATUSES.filter((s) => s !== "to_do"),
];

export const HUB_JOB_STATUS_LABELS: Record<HubJobStatus, string> = {
  reference: "Reference",
  under_study: "Under Study",
  to_do: "To Do",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  closed: "Closed",
};

export const CLOSE_REASONS: HubCloseReason[] = [
  "withdrew",
  "not_selected",
  "no_response",
  "auto_archived",
  "other",
];

export const CLOSE_REASON_LABELS: Record<HubCloseReason, string> = {
  withdrew: "Withdrew",
  not_selected: "Not selected",
  no_response: "No response",
  auto_archived: "Auto-archived",
  other: "Other",
};

const STAGE_RANK: Record<string, number> = {
  to_do: 0,
  under_study: 1,
  applied: 2,
  interview: 3,
  offer: 4,
  reference: 5,
  closed: 6,
};

export function statusChipLabel(key: string): string {
  if (key === "all") return "Active";
  if (key === "to_do") return "To Do only";
  if (key === "unset") return "No stage";
  if (key in HUB_JOB_STATUS_LABELS) {
    return HUB_JOB_STATUS_LABELS[key as HubJobStatus];
  }
  return key;
}

/** Closed (including auto-archived) stay off the main list unless opted in. */
export function jobVisibleInPool(
  status: HubJobStatus | null,
  filter: string,
  showClosed: boolean,
): boolean {
  if (filter === "closed") return status === "closed";
  if (filter === "unset") return status === null;
  if (filter !== "all" && status !== filter) return false;
  if (!showClosed && status === "closed") return false;
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

export function taskDueUrgency(
  dueAt?: string | null,
  todayIso?: string,
): TaskDueUrgency {
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
  const dates = [
    job.deadline,
    ...openTasks(job).map((t) => t.due_at).filter(Boolean),
  ].filter(Boolean) as string[];
  if (dates.length === 0) return "9999-12-31";
  return dates.map((d) => d.slice(0, 10)).sort()[0];
}

/** To Do first, then soonest DDL/task due, then newest discovered. */
export function compareActiveJobs(a: HubJob, b: HubJob): number {
  const ra = STAGE_RANK[a.status ?? ""] ?? 7;
  const rb = STAGE_RANK[b.status ?? ""] ?? 7;
  if (ra !== rb) return ra - rb;
  const da = soonestActionDate(a);
  const db = soonestActionDate(b);
  if (da !== db) return da.localeCompare(db);
  return b.discovered_at.localeCompare(a.discovered_at);
}
