"use client";

import { useEffect, useState } from "react";

import {
  createJobTask,
  deleteJobTask,
  patchJobTask,
  type HubJob,
  type JobTask,
} from "@/lib/api";
import { dateInputValue, isDateOverdue } from "@/lib/jobPipeline";
import { cn } from "@/lib/utils";

export function JobTasks({
  job,
  onChange,
}: {
  job: HubJob;
  onChange?: (tasks: JobTask[]) => void;
}) {
  const [tasks, setTasks] = useState<JobTask[]>(job.tasks ?? []);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTasks(job.tasks ?? []);
  }, [job.id, job.tasks]);

  function emit(next: JobTask[]) {
    setTasks(next);
    onChange?.(next);
  }

  async function add() {
    const text = title.trim();
    if (!text || busy) return;
    setBusy(true);
    const created = await createJobTask(job.id, { title: text, due_at: due || null });
    setBusy(false);
    if (!created) return;
    setTitle("");
    setDue("");
    emit([...tasks, created]);
  }

  async function toggle(task: JobTask) {
    if (busy) return;
    setBusy(true);
    const saved = await patchJobTask(job.id, task.id, { done: !task.done });
    setBusy(false);
    if (!saved) return;
    emit(tasks.map((t) => (t.id === task.id ? { ...t, done: !task.done } : t)));
  }

  async function rename(taskId: string, title: string) {
    const text = title.trim();
    const original = (job.tasks ?? []).find((t) => t.id === taskId)?.title ?? "";
    if (!text) {
      emit(tasks.map((t) => (t.id === taskId ? { ...t, title: original || t.title } : t)));
      return;
    }
    if (text === original || busy) return;
    setBusy(true);
    const saved = await patchJobTask(job.id, taskId, { title: text });
    setBusy(false);
    if (!saved) return;
    emit(tasks.map((t) => (t.id === taskId ? { ...t, title: text } : t)));
  }

  async function setDueAt(task: JobTask, value: string) {
    if (busy) return;
    setBusy(true);
    const saved = await patchJobTask(job.id, task.id, { due_at: value || null });
    setBusy(false);
    if (!saved) return;
    emit(tasks.map((t) => (t.id === task.id ? { ...t, due_at: value || null } : t)));
  }

  async function remove(task: JobTask) {
    if (busy) return;
    setBusy(true);
    const ok = await deleteJobTask(job.id, task.id);
    setBusy(false);
    if (!ok) return;
    emit(tasks.filter((t) => t.id !== task.id));
  }

  return (
    <div className="w-full space-y-2">
      <p className="text-[11px] font-medium text-muted">Tasks</p>
      <ul className="space-y-1.5">
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                checked={task.done}
                disabled={busy}
                onChange={() => void toggle(task)}
                aria-label={`Complete ${task.title}`}
                className="h-4 w-4 rounded border-line"
              />
              <input
                type="text"
                value={task.title}
                disabled={busy || task.done}
                aria-label={`Edit ${task.title}`}
                onChange={(e) =>
                  setTasks((current) =>
                    current.map((t) => (t.id === task.id ? { ...t, title: e.target.value } : t)),
                  )
                }
                onBlur={(e) => void rename(task.id, e.target.value)}
                className={cn(
                  "min-w-0 flex-1 bg-transparent text-xs text-ink outline-none",
                  task.done && "text-muted line-through",
                )}
              />
            </label>
            <input
              type="date"
              value={dateInputValue(task.due_at)}
              disabled={busy || task.done}
              aria-label={`Due date for ${task.title}`}
              onChange={(e) => void setDueAt(task, e.target.value)}
              className={cn(
                "h-7 rounded-md border border-line bg-surface px-1.5 text-[11px] text-ink",
                isDateOverdue(task.due_at) && !task.done && "border-rose-300 text-rose-800",
              )}
            />
            <button
              type="button"
              disabled={busy}
              aria-label={`Remove ${task.title}`}
              onClick={() => void remove(task)}
              className="text-[11px] text-muted hover:text-ink disabled:opacity-50"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={title}
          disabled={busy}
          placeholder="Add OA / interview prep…"
          aria-label="New task title"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-xs text-ink placeholder:text-muted/70"
        />
        <input
          type="date"
          value={due}
          disabled={busy}
          aria-label="New task due date"
          onChange={(e) => setDue(e.target.value)}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink"
        />
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={() => void add()}
          className="h-8 rounded-lg border border-line px-3 text-xs font-medium text-ink hover:border-ink/30 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
