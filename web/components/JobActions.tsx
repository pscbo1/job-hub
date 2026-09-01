"use client";

import { useEffect, useState } from "react";

import {
  patchHubJob,
  type HubCloseReason,
  type HubJob,
  type HubJobStatus,
} from "@/lib/api";
import {
  CLOSE_REASON_LABELS,
  CLOSE_REASONS,
  HUB_JOB_STATUS_LABELS,
  HUB_JOB_STATUSES,
  dateInputValue,
} from "@/lib/jobPipeline";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  reference: "bg-emerald-100 text-emerald-700",
  under_study: "bg-sky-100 text-sky-700",
  to_do: "bg-amber-100 text-amber-700",
  applied: "bg-violet-100 text-violet-700",
  interview: "bg-indigo-100 text-indigo-700",
  offer: "bg-teal-100 text-teal-800",
  closed: "bg-stone-200 text-stone-500",
};

export function JobActions({
  job,
  onPatched,
}: {
  job: HubJob;
  onPatched?: (next: HubJob) => void;
}) {
  const [current, setCurrent] = useState<HubJob>(job);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [commentDraft, setCommentDraft] = useState(job.comment ?? "");
  const [nextStepDraft, setNextStepDraft] = useState(job.next_step ?? "");

  useEffect(() => {
    setCurrent(job);
    setCommentDraft(job.comment ?? "");
    setNextStepDraft(job.next_step ?? "");
  }, [job]);

  async function patch(partial: Parameters<typeof patchHubJob>[1]) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const saved = await patchHubJob(job.id, partial);
    if (saved) {
      setCurrent(saved);
      onPatched?.(saved);
    } else {
      setFailed(true);
    }
    setBusy(false);
  }

  const stage = current.status;
  const label = stage ? HUB_JOB_STATUS_LABELS[stage] : "No stage";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          aria-pressed={current.favorite === true}
          aria-label={current.favorite ? "Remove favorite" : "Mark favorite"}
          onClick={() => void patch({ favorite: !current.favorite })}
          className={cn(
            "inline-flex h-8 items-center rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-50",
            current.favorite
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink",
          )}
        >
          {current.favorite ? "★ Favorited" : "☆ Favorite"}
        </button>
        <label className="inline-flex h-8 items-center gap-2 text-xs text-muted">
          Stage
          <select
            value={stage ?? ""}
            disabled={busy}
            aria-label="Job stage"
            onChange={(e) => {
              const v = e.target.value;
              void patch({ status: v === "" ? null : (v as HubJobStatus) });
            }}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink disabled:opacity-50"
          >
            <option value="">No stage</option>
            {HUB_JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {HUB_JOB_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {stage === "closed" && (
          <label className="inline-flex h-8 items-center gap-2 text-xs text-muted">
            Reason
            <select
              value={current.close_reason ?? ""}
              disabled={busy}
              aria-label="Close reason"
              onChange={(e) => {
                const v = e.target.value;
                void patch({ close_reason: v === "" ? null : (v as HubCloseReason) });
              }}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink disabled:opacity-50"
            >
              <option value="">Choose…</option>
              {CLOSE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {CLOSE_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        )}
        <span
          className={cn(
            "ml-auto inline-flex h-8 items-center rounded-full px-3 text-xs font-medium",
            STATUS_STYLES[stage ?? ""] ?? "bg-stone-100 text-stone-500",
          )}
        >
          {label}
        </span>
      </div>
      <label className="flex min-w-0 items-center gap-2 text-xs text-muted">
        <span className="shrink-0">Next step</span>
        <input
          type="text"
          value={nextStepDraft}
          disabled={busy}
          aria-label="Next step"
          placeholder="e.g. finish OA this week"
          onChange={(e) => setNextStepDraft(e.target.value)}
          onBlur={() => {
            if (nextStepDraft !== (current.next_step ?? "")) {
              void patch({ next_step: nextStepDraft });
            }
          }}
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-xs text-ink placeholder:text-muted/70 disabled:opacity-50"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-8 items-center gap-2 text-xs text-muted">
          DDL
          <input
            type="date"
            value={dateInputValue(current.deadline)}
            disabled={busy}
            aria-label="Deadline"
            onChange={(e) => void patch({ deadline: e.target.value || null })}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink disabled:opacity-50"
          />
        </label>
      </div>
      <label className="flex min-w-0 items-start gap-2 text-xs text-muted">
        <span className="shrink-0 pt-1.5">Comment</span>
        <textarea
          value={commentDraft}
          disabled={busy}
          aria-label="Comment"
          placeholder={stage === "reference" ? "Why keep this as reference…" : "Notes"}
          rows={2}
          onChange={(e) => setCommentDraft(e.target.value)}
          onBlur={() => {
            if (commentDraft !== (current.comment ?? "")) {
              void patch({ comment: commentDraft });
            }
          }}
          className="min-h-8 min-w-0 flex-1 resize-y rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-muted/70 disabled:opacity-50"
        />
      </label>
      <label className="inline-flex h-8 items-center gap-2 text-[11px] text-muted/80">
        Reminder (optional)
        <input
          type="date"
          value={dateInputValue(current.follow_up_at)}
          disabled={busy}
          aria-label="Optional reminder date"
          onChange={(e) => void patch({ follow_up_at: e.target.value || null })}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink disabled:opacity-50"
        />
      </label>
      {failed && <span className="text-xs text-amber-600">Update failed</span>}
    </div>
  );
}
