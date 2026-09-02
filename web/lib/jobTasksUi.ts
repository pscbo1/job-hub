import type { JobTask } from "@/lib/api";

export function applicationHasLinkedJob(jobId: string | null | undefined): boolean {
  return Boolean(jobId?.trim());
}

export function canCreateJobTask(title: string): boolean {
  return title.trim().length > 0;
}

export function tasksPageHref(jobId: string, taskId?: string): string {
  const params = new URLSearchParams({ job: jobId });
  if (taskId?.trim()) params.set("task", taskId.trim());
  return `/tasks?${params.toString()}`;
}

export function taskJobAnchorId(jobId: string): string {
  return `task-job-${jobId}`;
}

export function taskItemAnchorId(taskId: string): string {
  return `task-item-${taskId}`;
}

export function jobIdFromSearch(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("job")?.trim() ?? "";
}

export function taskIdFromSearch(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("task")?.trim() ?? "";
}

export function taskCreatedSummary(
  task: Pick<JobTask, "title" | "due_at"> & {
    notes?: string | null;
    source_url?: string | null;
  },
): string {
  const parts = [task.title.trim()];
  const due = task.due_at?.trim();
  if (due) parts.push(`due ${due.slice(0, 10)}`);
  if (task.notes?.trim()) parts.push("with notes");
  if (task.source_url?.trim()) parts.push("with source link");
  return parts.join(" · ");
}
