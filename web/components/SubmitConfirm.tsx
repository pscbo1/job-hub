"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getPacket,
  submitApplication,
  type Application,
  type PacketItem,
} from "@/lib/api";
import { snapshotItemLabel } from "@/lib/materialsUi";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key] = useState(newKey);
  const when = useMemo(() => new Date(), []);

  async function load() {
    setItems(await getPacket(app.id));
  }

  useEffect(() => {
    void load();
  }, [app.id]);

  async function confirm(confirmEmpty: boolean) {
    if (busy || items === null) return;
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
      await load();
      setError("Materials changed. Review the current list and confirm again.");
      setBusy(false);
      return;
    }
    if (result.code === "empty_materials") {
      await load();
      setBusy(false);
      return;
    }
    setError(result.message);
    setBusy(false);
  }

  if (items === null) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
        Checking materials…
      </div>
    );
  }

  const empty = items.length === 0;
  const timeLabel = when.toLocaleString();

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">Mark submitted</h3>
      <p className="mt-1 text-sm text-ink">
        {app.title}
        {app.employer ? ` · ${app.employer}` : ""}
      </p>
      <p className="text-xs text-muted">{timeLabel}</p>
      <div className="mt-3 space-y-1 text-sm">
        {empty ? (
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
      <div className="mt-3 flex flex-wrap gap-2">
        {empty ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm(true)}
            className="h-9 rounded-lg bg-ink px-3 text-sm text-white disabled:opacity-50"
          >
            Record without materials
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
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
  );
}

export function snapshotMissingLabel(): string {
  return "当次材料未记录";
}

export { snapshotItemLabel };
