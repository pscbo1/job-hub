"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";

import { TaskReminderEditor } from "@/components/TaskReminderEditor";
import {
  createJobTask,
  deleteJobTask,
  patchJobTask,
  deleteTaskAttachment,
  taskAttachmentFileUrl,
  uploadTaskAttachment,
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
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

  async function saveNotes(task: JobTask, value: string) {
    if (busy || value === (task.notes ?? "")) return;
    setBusy(true);
    const saved = await patchJobTask(job.id, task.id, { notes: value });
    setBusy(false);
    if (saved) emit(tasks.map((t) => (t.id === task.id ? saved : t)));
  }

  async function addAttachment(task: JobTask, file: File) {
    if (busy) return;
    setBusy(true);
    const attachment = await uploadTaskAttachment(job.id, task.id, file);
    setBusy(false);
    if (!attachment) return;
    emit(
      tasks.map((t) =>
        t.id === task.id ? { ...t, attachments: [...(t.attachments ?? []), attachment] } : t,
      ),
    );
  }

  async function removeAttachment(task: JobTask, attachmentId: string) {
    if (busy || !(await deleteTaskAttachment(job.id, task.id, attachmentId))) return;
    emit(
      tasks.map((t) =>
        t.id === task.id
          ? { ...t, attachments: (t.attachments ?? []).filter((a) => a.id !== attachmentId) }
          : t,
      ),
    );
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
                title={task.done ? "Mark task incomplete" : "Mark task complete"}
                aria-label={task.done ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
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
            <button
              type="button"
              disabled={busy}
              aria-label={`Notes and attachments for ${task.title}`}
              onClick={() => setExpanded((current) => ({ ...current, [task.id]: !current[task.id] }))}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-ink/5 hover:text-ink",
                expanded[task.id] && "bg-ink/5 text-ink",
              )}
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <div className="w-full pl-6">
              <TaskReminderEditor
                due={dateInputValue(task.due_at)}
                dates={reminderDatesFromTask(task)}
                disabled={busy || task.done}
                onChange={(dates) => void setReminders(task, dates)}
              />
            </div>
            {expanded[task.id] && (
              <div className="w-full space-y-2 rounded-lg border border-line bg-canvas/40 p-3 pl-6">
                <label className="block text-xs font-medium text-muted">
                  Notes
                  <textarea
                    value={noteDrafts[task.id] ?? task.notes ?? ""}
                    disabled={busy}
                    onChange={(event) => setNoteDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                    onBlur={(event) => void saveNotes(task, event.target.value)}
                    placeholder="Add interview or take-home notes…"
                    className="mt-1 min-h-20 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink"
                  />
                </label>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted">Attachments</p>
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-ink hover:border-ink/30">
                    <Paperclip className="h-3.5 w-3.5" />
                    Add file
                    <input
                      type="file"
                      className="sr-only"
                      disabled={busy}
                      accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void addAttachment(task, file);
                      }}
                    />
                  </label>
                </div>
                {(task.attachments ?? []).length > 0 ? (
                  <ul className="space-y-1">
                    {(task.attachments ?? []).map((attachment) => (
                      <li key={attachment.id} className="flex items-center gap-2 text-xs">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
                        <a className="min-w-0 flex-1 truncate text-ink underline" href={taskAttachmentFileUrl(job.id, task.id, attachment.id)} target="_blank" rel="noreferrer">
                          {attachment.original_filename}
                        </a>
                        <button type="button" aria-label={`Remove ${attachment.original_filename}`} disabled={busy} onClick={() => void removeAttachment(task, attachment.id)} className="text-muted hover:text-rose-700">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">No files attached.</p>
                )}
              </div>
            )}
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
