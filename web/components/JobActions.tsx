"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ASSIST_BTN_SECONDARY } from "@/lib/applicationUi";
import {
  referenceHubJob,
  saveHubJob,
  startApplicationForJob,
  undismissHubJob,
  unreferenceHubJob,
  unsaveHubJob,
  type HubJob,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export function JobActions({
  job,
  variant = "discover",
  onChange,
}: {
  job: HubJob;
  variant?: "discover" | "tasks";
  onChange?: (next: HubJob) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const saved = Boolean(job.favorite);
  const referenced = Boolean(job.reference);
  const excluded = Boolean(job.dismissed_at) || job.filter_state === "excluded";

  async function run(op: () => Promise<HubJob | null>) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const next = await op();
    if (next) onChange?.(next);
    else setFailed(true);
    setBusy(false);
  }

  async function onStartApplication(toPacket = false) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await startApplicationForJob(job.id);
    if (result) {
      onChange?.(result.job);
      const qs = toPacket
        ? `id=${encodeURIComponent(result.application.id)}&tab=packet`
        : `id=${encodeURIComponent(result.application.id)}`;
      router.push(`/applications?${qs}`);
    } else {
      setFailed(true);
    }
    setBusy(false);
  }

  function onOpenMaterials() {
    if (job.application_id) {
      router.push(`/applications?id=${encodeURIComponent(job.application_id)}&tab=packet`);
      return;
    }
    router.push(`/applications?job=${encodeURIComponent(job.id)}&tab=packet`);
  }

  if (excluded && variant === "discover") {
    return (
      <>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => undismissHubJob(job.id))}
          className="inline-flex h-8 items-center rounded-lg border border-ink bg-ink px-3 text-xs font-medium text-white disabled:opacity-50"
        >
          Restore
        </button>
        {failed && <span className="text-xs text-amber-600">Update failed</span>}
      </>
    );
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
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void run(() => (referenced ? unreferenceHubJob(job.id) : referenceHubJob(job.id)))
        }
        className={cn(
          "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-50",
          referenced
            ? "border-emerald-700 bg-emerald-700 text-white"
            : "border-line text-ink hover:border-ink/30 hover:bg-bg",
        )}
      >
        {referenced ? "Referenced" : "Reference"}
      </button>
      {variant === "discover" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onStartApplication()}
          className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-ink/30 hover:bg-bg disabled:opacity-50"
        >
          Start application
        </button>
      )}
      {variant === "tasks" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (job.application_id) onOpenMaterials();
            else void onStartApplication(true);
          }}
          className={ASSIST_BTN_SECONDARY}
        >
          Open materials
        </button>
      )}
      {failed && <span className="text-xs text-amber-600">Update failed</span>}
    </>
  );
}
