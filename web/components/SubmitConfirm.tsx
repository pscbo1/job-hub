"use client";

import { useEffect, useRef, useState } from "react";

import { loadPacket, submitApplication, type Application, type PacketItem } from "@/lib/api";
import { snapshotItemLabel } from "@/lib/materialsUi";
import { isStaleGeneration } from "@/lib/recordDraft";
import { formatDateTimeInAppTz } from "@/lib/timezone";

function newKey(): string {
  return `submit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function SubmitConfirm({
  app,
  onClose,
  onDone,
}: {
  app: Application;
  onClose: () => void;
  onDone: () => void;
}) {
  const [items, setItems] = useState<PacketItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [key, setKey] = useState(newKey);
  const gen = useRef(0);
  const when = useMemoIso(app.id);

  useEffect(() => {
    const ac = new AbortController();
    const started = ++gen.current;
    setKey(newKey());
    setBusy(false);
    setError("");
    setFailed(false);
    setItems(null);
    void loadPacket(app.id, ac.signal).then((result) => {
      if (ac.signal.aborted || isStaleGeneration(started, gen.current)) return;
      if (!result.ok) {
        setFailed(true);
        setItems([]);
        return;
      }
      setItems(result.items);
    });
    return () => {
      ac.abort();
      gen.current += 1;
    };
  }, [app.id, retry]);

  async function confirm(confirmEmpty: boolean) {
    if (busy || items === null || failed) return;
    setBusy(true);
    setError("");
    const expected = items.map((item) => item.binding.material_version_id);
    const result = await submitApplication(app.id, {
      confirm_empty: confirmEmpty,
      expected_version_ids: expected,
      idempotency_key: key,
    });
    if (result.ok) {
      onDone();
      return;
    }
    if (result.code === "materials_changed") {
      setRetry((n) => n + 1);
      setError("Materials changed. Review the current list and confirm again.");
      setBusy(false);
      return;
    }
    if (result.code === "empty_materials") {
      setRetry((n) => n + 1);
      setBusy(false);
      return;
    }
    setError(result.message);
    setBusy(false);
  }

  const empty = items !== null && items.length === 0 && !failed;
  const timeLabel = formatDateTimeInAppTz(when);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Cancel mark submitted"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-confirm-title"
        className="relative z-10 w-full max-w-lg rounded-xl border border-line bg-surface p-5 shadow-xl"
      >
        <h3 id="submit-confirm-title" className="text-sm font-semibold text-ink">
          Mark submitted
        </h3>
        <p className="mt-1 text-sm text-ink">
          {app.title}
          {app.employer ? ` · ${app.employer}` : ""}
        </p>
        <p className="text-xs text-muted">{timeLabel}</p>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">
          Linked materials to snapshot
        </p>
        <div className="mt-2 space-y-1 text-sm">
          {items === null ? (
            <p className="text-muted">Checking materials…</p>
          ) : failed ? (
            <div className="rounded-lg border border-line bg-bg p-3 text-sm text-muted">
              Could not load current bindings.
              <button
                type="button"
                className="ml-2 text-ink underline"
                onClick={() => setRetry((n) => n + 1)}
              >
                Retry
              </button>
            </div>
          ) : empty ? (
            <p className="text-amber-800">本次未记录材料</p>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.binding.id} className="text-ink">
                  {item.material?.title ?? "Material"} ·{" "}
                  {item.version?.display_label ?? `v${item.version?.version_number ?? 1}`}
                  {item.version?.original_filename ? ` · ${item.version.original_filename}` : ""}
                  {item.version?.url ? ` · ${item.version.url}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-amber-700">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {empty ? (
            <button
              type="button"
              disabled={busy || items === null}
              onClick={() => void confirm(true)}
              className="h-9 rounded-lg bg-ink px-3 text-sm text-white disabled:opacity-50"
            >
              Record without materials
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || items === null || failed}
              onClick={() => void confirm(false)}
              className="h-9 rounded-lg bg-ink px-3 text-sm text-white disabled:opacity-50"
            >
              Confirm submitted
            </button>
          )}
          <button type="button" disabled={busy} onClick={onClose} className="h-9 px-3 text-sm text-muted">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function useMemoIso(appId: string): string {
  const [value, setValue] = useState(() => new Date().toISOString());
  useEffect(() => {
    setValue(new Date().toISOString());
  }, [appId]);
  return value;
}

export function snapshotMissingLabel(): string {
  return "当次材料未记录";
}

export { snapshotItemLabel };
