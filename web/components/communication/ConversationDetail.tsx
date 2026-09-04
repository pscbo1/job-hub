import { Archive, Check, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { COMMUNICATION_COPY } from "./copy";
import { STAGE_LABELS, type Conversation, type JobOption } from "./types";

export function ConversationDetail({
  selected,
  taskTitle,
  recordSummary,
  associateJobId,
  jobOptions,
  undoToken,
  onTaskTitle,
  onRecordSummary,
  onAssociateJobId,
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
  onTaskTitle: (value: string) => void;
  onRecordSummary: (value: string) => void;
  onAssociateJobId: (value: string) => void;
  onLoadJobs: () => void;
  onCreateTask: () => void;
  onAppendRecord: () => void;
  onAssociateJob: () => void;
  onNewJob: () => void;
  onAction: (actionName: string) => void;
  onUndo: () => void;
}) {
  if (!selected) {
    return <p className="p-5 text-sm text-muted">{COMMUNICATION_COPY.selectHint}</p>;
  }

  return (
    <div className="flex min-h-[32rem] flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              {selected.company || "Conversation"}
              {selected.role ? ` · ${selected.role}` : ""}
            </h2>
            <p className="text-sm text-muted">{selected.contact}</p>
            {selected.source === "email" && selected.external_thread_id ? (
              <a
                className="mt-1 inline-flex text-xs text-brand"
                href={`https://mail.google.com/mail/u/0/#all/${selected.external_thread_id}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Gmail
              </a>
            ) : selected.external_thread_id?.match(/^https?:\/\//i) ? (
              <a
                className="mt-1 inline-flex text-xs text-brand"
                href={selected.external_thread_id}
                target="_blank"
                rel="noreferrer"
              >
                Open original
              </a>
            ) : null}
          </div>
          <span className="rounded border border-line px-2 py-1 text-xs text-muted">
            {STAGE_LABELS[selected.stage] || selected.stage}
          </span>
        </div>
        <div className="space-y-3">
          {selected.messages.map((message) => (
            <article key={message.id} className="rounded-md border border-line p-4">
              <p className="whitespace-pre-wrap text-sm text-ink">{message.body || message.summary}</p>
              <p className="mt-2 text-xs text-muted">
                {new Date(message.occurred_at).toLocaleString()} · {message.channel || selected.source}
              </p>
            </article>
          ))}
        </div>
        <div className="border-t border-line pt-4">
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
                className="h-8 min-w-0 flex-1"
                placeholder="Create task"
                value={taskTitle}
                onChange={(event) => onTaskTitle(event.target.value)}
              />
              <Button type="button" variant="outline" size="sm" onClick={onCreateTask}>
                Add
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">Associate a Job to create a task.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            className="h-8 min-w-0 flex-1"
            placeholder="Add a manual record"
            value={recordSummary}
            onChange={(event) => onRecordSummary(event.target.value)}
          />
          <Button type="button" variant="outline" size="sm" onClick={onAppendRecord}>
            Add record
          </Button>
        </div>
        {!selected.job_id ? (
          <div className="flex flex-wrap gap-2">
            <Select
              className="h-8 min-w-[18rem]"
              value={associateJobId}
              onFocus={() => onLoadJobs()}
              onChange={(event) => onAssociateJobId(event.target.value)}
            >
              <option value="">Associate a Job</option>
              {jobOptions.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.company || "Unknown"} · {job.title || "Untitled"}
                </option>
              ))}
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={onAssociateJob}>
              Link Job
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onNewJob}>
              New Job
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface px-5 py-3">
        <Button type="button" variant="dark" onClick={() => onAction("keep")}>
          <Check className="h-4 w-4" />
          {COMMUNICATION_COPY.keep}
        </Button>
        <Button type="button" variant="outline" onClick={() => onAction("archive")}>
          <Archive className="h-4 w-4" />
          {COMMUNICATION_COPY.archive}
        </Button>
        <Button type="button" variant="outline" onClick={() => onAction("delete")}>
          <Trash2 className="h-4 w-4" />
          {COMMUNICATION_COPY.delete}
        </Button>
        {undoToken ? (
          <Button type="button" variant="ghost" onClick={onUndo}>
            {COMMUNICATION_COPY.undo}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
