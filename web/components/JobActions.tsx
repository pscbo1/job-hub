"use client";

import { useState } from "react";

import { type HubJobStatus, patchHubJobStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUSES: HubJobStatus[] = ["saved", "to_do", "applied", "closed", "reference"];

const STATUS_STYLES: Record<string, string> = {
  saved: "bg-sky-100 text-sky-700",
  to_do: "bg-amber-100 text-amber-700",
  applied: "bg-violet-100 text-violet-700",
  closed: "bg-stone-200 text-stone-500",
  reference: "bg-emerald-100 text-emerald-700",
};

export function JobActions({
  jobId,
  status,
  onChange,
}: {
  jobId: string;
  status: HubJobStatus | null;
  onChange?: (next: HubJobStatus | null) => void;
}) {
  const [current, setCurrent] = useState<HubJobStatus | null>(status);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function update(next: HubJobStatus | null) {
    if (busy || next === current) return;
    setBusy(true);
    setFailed(false);
    const saved = await patchHubJobStatus(jobId, next);
    if (saved) {
      setCurrent(next);
      onChange?.(next);
    } else {
      setFailed(true);
    }
    setBusy(false);
  }

  const label = current ?? "unset";

  return (
    <>
      <label className="inline-flex h-8 items-center gap-2 text-xs text-muted">
        Status
        <select
          value={current ?? ""}
          disabled={busy}
          aria-label="Job status"
          onChange={(e) => {
            const v = e.target.value;
            void update(v === "" ? null : (v as HubJobStatus));
          }}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink disabled:opacity-50"
        >
          <option value="">unset</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <span
        className={cn(
          "ml-auto inline-flex h-8 items-center rounded-full px-3 text-xs font-medium",
          STATUS_STYLES[label] ?? "bg-stone-100 text-stone-500",
        )}
      >
        {label}
      </span>
      {failed && <span className="text-xs text-amber-600">Update failed</span>}
    </>
  );
}
