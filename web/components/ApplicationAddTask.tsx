"use client";

import { useEffect, useState } from "react";

import {
  createJobTask,
  listJobTasks,
  patchJobTask,
  type Application,
  type JobTask,
} from "@/lib/api";
import { dateInputValue, isDateOverdue } from "@/lib/jobPipeline";
import {
  applicationHasLinkedJob,
  canCreateJobTask,
  taskCreatedSummary,
  tasksPageHref,
} from "@/lib/jobTasksUi";
import { formatCalendarDate } from "@/lib/timezone";
import { cn, externalUrl } from "@/lib/utils";

export function ApplicationAddTask({ app }: { app: Application }) {
  const jobId = app.job_id?.trim() ?? "";
  const linked = applicationHasLinkedJob(jobId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<JobTask | null>(null);
  const [tasks, setTasks] = useState<JobTask[] | null>(null);

  useEffect(() => {
    setCreated(null);
    setError("");
    setOpen(false);
    if (!linked) {
      setTasks(null);
      return;
    }
    let cancelled = false;
    void listJobTasks(jobId).then((rows) => {
      if (!cancelled) setTasks(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [app.id, jobId, linked]);

  async function save() {
    if (!canCreateJobTask(title) || busy || !linked) return;
    setBusy(true);
    setError("");
    const task = await createJobTask(jobId, {
      title: title.trim(),
      due_at: due || null,
      notes: notes.trim() || null,
      source_url: sourceUrl.trim() || null,
      application_id: app.id,
    });
    setBusy(false);
    if (!task) {
      setError("Could not save task.");
      return;
    }
    setCreated(task);
    setTasks((rows) => [...(rows ?? []), task]);
    setOpen(false);
    setTitle("");
    setDue("");
    setNotes("");
    setSourceUrl("");
  }

  async function toggle(task: JobTask) {
    if (busy || !linked) return;
    setBusy(true);
    const saved = await patchJobTask(jobId, task.id, { done: !task.done });
    setBusy(false);
    if (!saved) return;
    setTasks((rows) => (rows ?? []).map((row) => (row.id === task.id ? saved : row)));
  }

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Tasks</h3>
      {!linked ? (
        <p className="mt-2 text-sm text-muted">
          Tasks belong to a Job. This application is not linked to a job, so a task cannot be added
          here.
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {tasks && tasks.length > 0 && (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li key={task.id} className="rounded-lg border border-line bg-bg px-3 py-2">
                  <label className="flex items-start gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={task.done}
                      disabled={busy}
                      onChange={() => void toggle(task)}
                      aria-label={`Complete ${task.title}`}
                      className="mt-0.5 h-4 w-4 rounded border-line"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn(task.done && "text-muted line-through")}>{task.title}</span>
                      {task.due_at && (
                        <span
                          className={cn(
                            "ml-2 text-xs",
                            isDateOverdue(task.due_at) && !task.done ? "text-amber-800" : "text-muted",
                          )}
                        >
                          due {formatCalendarDate(dateInputValue(task.due_at))}
                        </span>
                      )}
                      {task.notes?.trim() && (
                        <span className="mt-1 block text-xs text-muted">{task.notes}</span>
                      )}
                      {task.source_url?.trim() && (
                        <a
                          href={externalUrl(task.source_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block text-xs text-ink underline"
                        >
                          Source link
                        </a>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="h-9 rounded-lg border border-line px-3 text-sm font-medium text-ink"
            >
              Add task
            </button>
          ) : (
            <form
              className="space-y-2 rounded-lg border border-line bg-bg p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label className="block text-xs text-muted">
                Title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="OA / interview prep"
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                />
              </label>
              <label className="block text-xs text-muted">
                Due date (optional)
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                />
              </label>
              <label className="block text-xs text-muted">
                Notes (optional)
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="block text-xs text-muted">
                Source link (optional)
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://"
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                />
              </label>
              {error && <p className="text-xs text-amber-800">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || !canCreateJobTask(title)}
                  className="h-9 rounded-lg bg-ink px-3 text-sm text-white disabled:opacity-50"
                >
                  Save task
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  className="h-9 text-sm text-muted"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {created && (
            <div className="rounded-lg border border-line bg-bg p-3 text-sm text-ink">
              <p>Saved {taskCreatedSummary(created)}.</p>
              <p className="mt-1 text-xs text-muted">
                Completing a task does not Mark submitted or change stage.
              </p>
              <a href={tasksPageHref(jobId)} className="mt-2 inline-block text-sm font-medium underline">
                Open in Tasks
              </a>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
