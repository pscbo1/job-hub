import type { HubJob, JobTask } from "@/lib/api";
import { compareByDueThenTitle, openTasks, taskBoardSection, type TaskDueUrgency } from "@/lib/jobPipeline";

export const TASK_SECTIONS: { key: TaskDueUrgency; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "none", label: "No date" },
  { key: "overdue", label: "Overdue" },
];

export function jobMatchesTaskSearch(
  job: HubJob,
  query: string,
  applicationNotes = "",
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const taskTitles = (job.tasks ?? []).map((t: JobTask) => t.title).join(" ");
  return [job.title, job.company, job.next_step ?? "", taskTitles, applicationNotes]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function groupTasksByDue(jobs: HubJob[], todayIso?: string): Record<TaskDueUrgency, HubJob[]> {
  const groups: Record<TaskDueUrgency, HubJob[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    none: [],
  };
  for (const job of jobs) {
    groups[taskBoardSection(job, todayIso)].push(job);
  }
  for (const key of Object.keys(groups) as TaskDueUrgency[]) {
    groups[key].sort(compareByDueThenTitle);
  }
  return groups;
}

export function jobHasUnfinishedTask(job: HubJob): boolean {
  return openTasks(job).length > 0;
}

/** Mirrors `job_belongs_on_tasks`: next_step / deadline / open task / draft. */
export function jobBelongsOnTasks(job: HubJob, hasDraftApplication = false): boolean {
  if ((job.next_step ?? "").trim()) return true;
  if (job.deadline) return true;
  if (openTasks(job).length > 0) return true;
  return hasDraftApplication;
}
