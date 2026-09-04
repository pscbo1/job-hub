"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { JobOption, ManualRecord, NewJobDraft } from "./types";

export function ManualRecordForm({
  manual,
  manualChannel,
  manualOtherChannel,
  jobOptions,
  newJobOpen,
  newJob,
  onManualChange,
  onChannelChange,
  onOtherChannelChange,
  onLoadJobs,
  onToggleNewJob,
  onNewJobChange,
  onCreateJob,
  onSave,
  onCancel,
}: {
  manual: ManualRecord;
  manualChannel: string;
  manualOtherChannel: string;
  jobOptions: JobOption[];
  newJobOpen: boolean;
  newJob: NewJobDraft;
  onManualChange: (next: ManualRecord) => void;
  onChannelChange: (value: string) => void;
  onOtherChannelChange: (value: string) => void;
  onLoadJobs: () => void;
  onToggleNewJob: () => void;
  onNewJobChange: (next: NewJobDraft) => void;
  onCreateJob: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Card className="space-y-3 rounded-lg p-4 shadow-none">
      <p className="text-sm font-medium text-ink">Manual communication record</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-muted">
          Channel
          <Select
            className="mt-1"
            value={manualChannel}
            onChange={(event) => onChannelChange(event.target.value)}
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
              onChange={(event) => onOtherChannelChange(event.target.value)}
            />
          </label>
        ) : null}
        <Input
          placeholder="Company (optional)"
          value={manual.company}
          onChange={(event) => onManualChange({ ...manual, company: event.target.value })}
        />
        <Input
          placeholder="Role (optional)"
          value={manual.role}
          onChange={(event) => onManualChange({ ...manual, role: event.target.value })}
        />
        <label className="text-sm text-muted">
          Related Job
          <Select
            className="mt-1"
            value={manual.job_id}
            onFocus={onLoadJobs}
            onChange={(event) => onManualChange({ ...manual, job_id: event.target.value })}
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
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={manual.needs_action}
            onChange={(event) => onManualChange({ ...manual, needs_action: event.target.checked })}
          />
          Needs action
        </label>
        <Textarea
          className="sm:col-span-2"
          placeholder="What happened? Add a concise message or note (required)"
          rows={4}
          value={manual.summary}
          onChange={(event) => onManualChange({ ...manual, summary: event.target.value })}
        />
      </div>
      {newJobOpen ? (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <Input
            placeholder="New job company"
            value={newJob.company}
            onChange={(event) => onNewJobChange({ ...newJob, company: event.target.value })}
          />
          <Input
            placeholder="New job role"
            value={newJob.role}
            onChange={(event) => onNewJobChange({ ...newJob, role: event.target.value })}
          />
          <Input
            placeholder="Location (optional)"
            value={newJob.location}
            onChange={(event) => onNewJobChange({ ...newJob, location: event.target.value })}
          />
          <Button type="button" variant="outline" onClick={onCreateJob}>
            Create Job
          </Button>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={onSave}>
          Save record
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
