"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  archiveHubJob,
  dismissHubJob,
  referenceHubJob,
  saveHubJob,
  startApplicationForJob,
  startReviewHubJob,
  unarchiveHubJob,
  unsaveHubJob,
  type HubJob,
  type JobEngagement,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const ENGAGEMENT_STYLES: Record<string, string> = {
  unset: "bg-stone-100 text-stone-500",
  reference: "bg-emerald-100 text-emerald-700",
  under_study: "bg-sky-100 text-sky-700",
  to_do: "bg-amber-100 text-amber-700",
};

function engagementLabel(value: JobEngagement | null | undefined): string {
  if (value === "under_study") return "Under study";
  if (value === "to_do") return "To do";
  if (value === "reference") return "Reference";
  return "Discovery";
}

export function JobActions({
  job,
  variant = "discover",
  onChange,
}: {
  job: HubJob;
  variant?: "discover" | "my";
  onChange?: (next: HubJob) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const saved = Boolean(job.favorite);
  const engagement = job.engagement ?? job.status ?? null;

  async function run(op: () => Promise<HubJob | null>) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const next = await op();
    if (next) onChange?.(next);
    else setFailed(true);
    setBusy(false);
  }

  async function onStartApplication() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await startApplicationForJob(job.id);
    if (result) {
      onChange?.(result.job);
      router.push("/applications");
    } else {
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(() => (saved ? unsaveHubJob(job.id) : saveHubJob(job.id)))}
        className={cn(
          "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-50",
          saved
            ? "border-ink bg-ink text-white"
            : "border-line text-ink hover:border-ink/30 hover:bg-bg",
        )}
      >
        {saved ? "Saved" : "Save"}
      </button>
      {variant === "discover" && !job.dismissed_at && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => dismissHubJob(job.id))}
          className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-muted transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-50"
        >
          Dismiss
        </button>
      )}
      {engagement !== "under_study" && engagement !== "to_do" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => startReviewHubJob(job.id))}
          className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-ink/30 hover:bg-bg disabled:opacity-50"
        >
          Start review
        </button>
      )}
      {engagement !== "reference" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => referenceHubJob(job.id))}
          className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-ink/30 hover:bg-bg disabled:opacity-50"
        >
          Reference
        </button>
      )}
      {(variant === "my" || saved || engagement === "under_study") && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onStartApplication()}
          className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-ink/30 hover:bg-bg disabled:opacity-50"
        >
          Start application
        </button>
      )}
      {variant === "my" && !job.archived_at && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => archiveHubJob(job.id))}
          className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-muted transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-50"
        >
          Archive
        </button>
      )}
      {variant === "my" && job.archived_at && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => unarchiveHubJob(job.id))}
          className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-ink disabled:opacity-50"
        >
          Restore archive
        </button>
      )}
      <span
        className={cn(
          "ml-auto inline-flex h-8 items-center rounded-full px-3 text-xs font-medium",
          ENGAGEMENT_STYLES[engagement ?? "unset"] ?? ENGAGEMENT_STYLES.unset,
        )}
      >
        {engagementLabel(engagement)}
      </span>
      {failed && <span className="text-xs text-amber-600">Update failed</span>}
    </>
  );
}
