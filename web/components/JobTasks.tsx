"use client";

import { useEffect, useRef, useState } from "react";

import { TaskReminderEditor } from "@/components/TaskReminderEditor";
import {
  createJobTask,
  deleteJobTask,
  patchJobTask,
  type HubJob,
  type JobTask,
} from "@/lib/api";
import { dateInputValue, isDateOverdue } from "@/lib/jobPipeline";
import { todayInAppTz } from "@/lib/timezone";
import {
  previewReminderPlan,
  reminderDatesFromTask,
  savedPlansFromReminders,
} from "@/lib/taskRemindersUi";
import { cn } from "@/lib/utils";

export function JobTasks({
  job,
  onChange,
  highlightTaskId,
}: {
  job: HubJob;
  onChange?: (tasks: JobTask[]) => void;
  highlightTaskId?: string;
}) {
  const [tasks, setTasks] = useState<JobTask[]>(job.tasks ?? []);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [newReminders, setNewReminders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const plans = useRef<Record<string, Record<string, string[]>>>({});
  const edited = useRef<Record<string, boolean>>({});

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
    const created = await createJobTask(job.id, {
      title: text,
      due_at: due || null,
      reminders: due ? newReminders : [],
    });
    setBusy(false);
    if (!created) return;
    setTitle("");
    setDue("");
    setNewReminders([]);
    emit([...tasks, created]);
  }

  async function toggle(task: JobTask) {
    if (busy) return;
    setBusy(true);
    const saved = await patchJobTask(job.id, task.id, { done: !task.done });
    setBusy(false);
    if (!saved) return;
    emit(tasks.map((t) => (t.id === task.id ? saved : t)));
  }

  async function rename(taskId: string, nextTitle: string) {
    const text = nextTitle.trim();
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
    emit(tasks.map((t) => (t.id === taskId ? saved : t)));
  }

  async function saveDueAndReminders(task: JobTask, nextDue: string, nextDates: string[]) {
    if (busy) return;
    setBusy(true);
    const saved = await patchJobTask(job.id, task.id, {
      due_at: nextDue || null,
      reminders: nextDue ? nextDates : [],
    });
    setBusy(false);
    if (!saved) return;
    const dueKey = saved.due_at?.slice(0, 10) ?? "";
    if (dueKey) {
      plans.current[task.id] = {
        ...(plans.current[task.id] ?? savedPlansFromReminders(saved.reminders, saved.due_at)),
        [dueKey]: reminderDatesFromTask(saved),
      };
    }
    emit(tasks.map((t) => (t.id === task.id ? saved : t)));
  }

  async function setDueAt(task: JobTask, value: string) {
    const today = todayInAppTz();
    const previousDue = dateInputValue(task.due_at);
    const current = reminderDatesFromTask(task);
    const savedByDue = {
      ...savedPlansFromReminders(task.reminders, task.due_at),
      ...(plans.current[task.id] ?? {}),
    };
    const next = previewReminderPlan({
      nextDue: value,
      previousDue,
      currentDates: current,
      today,
      savedByDue,
      editedThisSession: Boolean(edited.current[task.id]),
    });
    await saveDueAndReminders(task, value, next);
  }

  async function setReminders(task: JobTask, dates: string[]) {
    edited.current[task.id] = true;
    await saveDueAndReminders(task, dateInputValue(task.due_at), dates);
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
          <li
            key={task.id}
            id={`task-item-${task.id}`}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-md",
              highlightTaskId === task.id && "ring-2 ring-ink/20",
            )}
          >
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
                "h-8 rounded-md border border-line bg-surface px-1.5 text-[11px] text-ink",
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
            <div className="w-full pl-6">
              <TaskReminderEditor
                due={dateInputValue(task.due_at)}
                dates={reminderDatesFromTask(task)}
                disabled={busy || task.done}
                onChange={(dates) => void setReminders(task, dates)}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="space-y-1.5">
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
            onChange={(e) => {
              const value = e.target.value;
              setDue(value);
              setNewReminders(value ? [value] : []);
            }}
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
        <TaskReminderEditor due={due} dates={newReminders} disabled={busy} onChange={setNewReminders} />
      </div>
    </div>
  );
}
