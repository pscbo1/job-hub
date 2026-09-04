import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { JobOption, ManualDraft, NewJobDraft } from "./types";

export function ManualRecordPanel({
  manual,
  manualChannel,
  manualOtherChannel,
  newJobOpen,
  newJob,
  jobOptions,
  onManual,
  onChannel,
  onOtherChannel,
  onToggleNewJob,
  onNewJob,
  onLoadJobs,
  onCreateJob,
  onSave,
  onCancel,
}: {
  manual: ManualDraft;
  manualChannel: string;
  manualOtherChannel: string;
  newJobOpen: boolean;
  newJob: NewJobDraft;
  jobOptions: JobOption[];
  onManual: (next: ManualDraft) => void;
  onChannel: (value: string) => void;
  onOtherChannel: (value: string) => void;
  onToggleNewJob: () => void;
  onNewJob: (next: NewJobDraft) => void;
  onLoadJobs: () => void;
  onCreateJob: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-ink">Manual communication record</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-muted">
          Channel
          <Select
            className="mt-1"
            value={manualChannel}
            onChange={(event) => {
              onChannel(event.target.value);
              onManual({ ...manual, channel: event.target.value });
            }}
          >
            <option value="wechat">WeChat</option>
            <option value="phone">Phone</option>
            <option value="liepin">Liepin</option>
            <option value="zhilian">Zhaopin</option>
            <option value="boss">BOSS</option>
            <option value="other">Other</option>
          </Select>
        </label>
        {manualChannel === "other" ? (
          <label className="text-sm text-muted">
            Channel name
            <Input
              className="mt-1"
              placeholder="Enter channel name"
              value={manualOtherChannel}
              onChange={(event) => onOtherChannel(event.target.value)}
            />
          </label>
        ) : null}
        <Input
          placeholder="Company (optional)"
          value={manual.company}
          onChange={(event) => onManual({ ...manual, company: event.target.value })}
        />
        <Input
          placeholder="Role (optional)"
          value={manual.role}
          onChange={(event) => onManual({ ...manual, role: event.target.value })}
        />
        <label className="text-sm text-muted">
          Related Job
          <Select
            className="mt-1"
            value={manual.job_id}
            onFocus={() => onLoadJobs()}
            onChange={(event) => onManual({ ...manual, job_id: event.target.value })}
          >
            <option value="">No linked Job</option>
            {jobOptions.map((job) => (
              <option key={job.id} value={job.id}>
                {job.company || "Unknown"} · {job.title || "Untitled"}
              </option>
            ))}
          </Select>
        </label>
        <Button type="button" variant="outline" className="self-end" onClick={onToggleNewJob}>
          New Job
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={manual.needs_action}
            onChange={(event) => onManual({ ...manual, needs_action: event.target.checked })}
          />
          Needs action
        </label>
        <Textarea
          className="sm:col-span-2"
          placeholder="What happened? Add a concise message or note (required)"
          rows={4}
          value={manual.summary}
          onChange={(event) => onManual({ ...manual, summary: event.target.value })}
        />
      </div>
      {newJobOpen ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <Input
            placeholder="New job company"
            value={newJob.company}
            onChange={(event) => onNewJob({ ...newJob, company: event.target.value })}
          />
          <Input
            placeholder="New job role"
            value={newJob.role}
            onChange={(event) => onNewJob({ ...newJob, role: event.target.value })}
          />
          <Input
            placeholder="Location (optional)"
            value={newJob.location}
            onChange={(event) => onNewJob({ ...newJob, location: event.target.value })}
          />
          <Button type="button" onClick={onCreateJob}>
            Create Job
          </Button>
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={onSave}>
          Save record
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
