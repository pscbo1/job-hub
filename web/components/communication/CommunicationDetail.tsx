"use client";

import { Archive, Check, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTimeInAppTz } from "@/lib/timezone";

import { COMMUNICATION_COPY, STAGE_LABELS, type Conversation, type JobOption } from "./types";

export function CommunicationDetail({
  selected,
  taskTitle,
  recordSummary,
  associateJobId,
  jobOptions,
  undoToken,
  onTaskTitleChange,
  onRecordSummaryChange,
  onAssociateJobIdChange,
  onLoadJobs,
  onCreateTask,
  onAppendRecord,
  onAssociateJob,
  onNewJob,
  onAction,
  onUndo,
}: {
  selected: Conversation | null;
  taskTitle: string;
  recordSummary: string;
  associateJobId: string;
  jobOptions: JobOption[];
  undoToken: string | null;
  onTaskTitleChange: (value: string) => void;
  onRecordSummaryChange: (value: string) => void;
  onAssociateJobIdChange: (value: string) => void;
  onLoadJobs: () => void;
  onCreateTask: () => void;
  onAppendRecord: () => void;
  onAssociateJob: () => void;
  onNewJob: () => void;
  onAction: (actionName: string) => void;
  onUndo: () => void;
}) {
  if (!selected) {
    return <p className="text-sm text-muted">{COMMUNICATION_COPY.emptySelect}</p>;
  }

  const gmailHref =
    selected.source === "email" && selected.external_thread_id
      ? `https://mail.google.com/mail/u/0/#all/${selected.external_thread_id}`
      : null;
  const originalHref = selected.external_thread_id?.match(/^https?:\/\//i)
    ? selected.external_thread_id
    : null;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            {selected.company || "Conversation"}
            {selected.role ? ` · ${selected.role}` : ""}
          </h2>
          <p className="text-sm text-muted">{selected.contact}</p>
          {gmailHref ? (
            <a className="mt-1 inline-flex text-xs text-brand" href={gmailHref} target="_blank" rel="noreferrer">
              Open in Gmail
            </a>
          ) : originalHref ? (
            <a className="mt-1 inline-flex text-xs text-brand" href={originalHref} target="_blank" rel="noreferrer">
              Open original
            </a>
          ) : null}
        </div>
        <span className="rounded border border-line px-2 py-1 text-xs text-muted">
          {STAGE_LABELS[selected.stage] || selected.stage}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {selected.messages.map((message) => (
          <article key={message.id} className="rounded-md border border-line p-4">
            <p className="whitespace-pre-wrap text-sm text-ink">{message.body || message.summary}</p>
            <p className="mt-2 text-xs text-muted">
              {formatDateTimeInAppTz(message.occurred_at)} · {message.channel || selected.source}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-6 border-t border-line pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">Tasks</h3>
          <a className="text-xs text-brand" href="/tasks">
            Open in Tasks
          </a>
        </div>
        {selected.tasks.length ? (
          selected.tasks.map((task) => (
            <div key={String(task.id)} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" checked={Boolean(task.done)} readOnly />
              {String(task.title)}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">No linked tasks.</p>
        )}
        {selected.job_id ? (
          <div className="mt-3 flex gap-2">
            <Input
              className="h-8"
              placeholder="Create task"
              value={taskTitle}
              onChange={(event) => onTaskTitleChange(event.target.value)}
            />
            <Button type="button" variant="outline" size="sm" onClick={onCreateTask}>
              Add
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">Associate a Job to create a task.</p>
        )}
      </div>

      <div className="mt-6 flex gap-2 border-t border-line pt-4">
        <Input
          className="h-8"
          placeholder="Add a manual record"
          value={recordSummary}
          onChange={(event) => onRecordSummaryChange(event.target.value)}
        />
        <Button type="button" variant="outline" size="sm" onClick={onAppendRecord}>
          Add record
        </Button>
      </div>

      {!selected.job_id ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            className="h-8 min-w-[18rem] rounded-lg border border-line bg-bg px-2 text-sm text-ink"
            value={associateJobId}
            onFocus={onLoadJobs}
            onChange={(event) => onAssociateJobIdChange(event.target.value)}
          >
            <option value="">Associate a Job</option>
            {jobOptions.map((job) => (
              <option key={job.id} value={job.id}>
                {job.company || "Unknown"} · {job.title || "Untitled"}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={onAssociateJob}>
            Link Job
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onNewJob}>
            New Job
          </Button>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button type="button" variant="dark" size="sm" onClick={() => onAction("keep")}>
          <Check className="h-4 w-4" /> Keep
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onAction("archive")}>
          <Archive className="h-4 w-4" /> Archive
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-red-300 text-red-700 hover:border-red-400 hover:bg-red-50"
          onClick={() => onAction("delete")}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
        {undoToken ? (
          <Button type="button" variant="ghost" size="sm" onClick={onUndo}>
            Undo
          </Button>
        ) : null}
      </div>
    </>
  );
}
