"use client";

import { useEffect, useMemo, useState } from "react";

import {
  addPacketBinding,
  changePacketVersion,
  getMaterials,
  type Application,
  type Material,
  type PacketItem,
} from "@/lib/api";
import {
  copyFeedback,
  formatKind,
  knowledgeBindDecision,
  knowledgePreviewText,
  latestVersion,
  searchKnowledgeItems,
} from "@/lib/materialsUi";

export function ApplicationKnowledgeUse({
  app,
  items,
  canEdit,
  onBound,
}: {
  app: Application;
  items: PacketItem[] | null;
  canEdit: boolean;
  onBound: () => void;
}) {
  const [library, setLibrary] = useState<Material[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "Copied" | "Copy failed">("idle");
  const [bindMsg, setBindMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getMaterials().then((rows) => {
      if (!cancelled) setLibrary(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [app.id]);

  const knowledge = useMemo(
    () => searchKnowledgeItems(library ?? [], query),
    [library, query],
  );
  const selected = knowledge.find((row) => row.id === selectedId) ?? null;
  const preview = selected ? knowledgePreviewText(selected) : "";
  const decision = selected
    ? knowledgeBindDecision({ kind: selected.kind, items, materialId: selected.id })
    : "copy_only";

  async function copy() {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview);
      setCopyState(copyFeedback(true));
    } catch {
      setCopyState(copyFeedback(false));
      return;
    }
    window.setTimeout(() => setCopyState("idle"), 1500);
  }

  async function bind() {
    if (!selected || busy || !canEdit) return;
    const latest = latestVersion(selected);
    if (!latest || (decision !== "bind_new" && decision !== "replace_version")) return;
    setBusy(true);
    setBindMsg("");
    let ok = false;
    if (decision === "replace_version") {
      const existing = items?.find((row) => row.binding.material_id === selected.id);
      if (existing) ok = await changePacketVersion(app.id, existing.binding.id, latest.id);
    } else {
      ok = await addPacketBinding(app.id, latest.id);
    }
    setBusy(false);
    if (ok) {
      setBindMsg(
        decision === "replace_version" ? "Linked this answer version." : "Linked this answer.",
      );
      onBound();
    } else {
      setBindMsg("Could not link this answer.");
    }
  }

  return (
    <div className="rounded-lg border border-line bg-bg p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Templates & answers
      </h3>
      <p className="mt-1 text-sm text-muted">
        Search templates and answers for this application. Copy does not send or log as sent.
      </p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search templates and answers"
        aria-label="Search templates and answers"
        className="mt-2 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
      />
      {library === null ? (
        <p className="mt-2 text-sm text-muted">Loading templates and answers…</p>
      ) : knowledge.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No templates or answers match.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {knowledge.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(row.id);
                  setCopyState("idle");
                  setBindMsg("");
                }}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  selectedId === row.id ? "border-ink bg-surface text-ink" : "border-line text-ink"
                }`}
              >
                <span className="font-medium">{row.title}</span>
                <span className="ml-2 text-xs text-muted">{formatKind(row.kind)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-muted">Preview</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-2 text-xs text-ink">
            {preview || "No text on this version."}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!preview}
              onClick={() => void copy()}
              className="h-8 rounded-lg border border-line px-3 text-xs font-medium text-ink disabled:opacity-50"
            >
              {copyState === "idle" ? "Copy" : copyState}
            </button>
            {decision === "bind_new" && canEdit && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void bind()}
                className="h-8 rounded-lg border border-line px-3 text-xs font-medium text-ink disabled:opacity-50"
              >
                Link this answer
              </button>
            )}
            {decision === "replace_version" && canEdit && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void bind()}
                className="h-8 rounded-lg border border-line px-3 text-xs font-medium text-ink disabled:opacity-50"
              >
                Use this version
              </button>
            )}
          </div>
          {selected.kind === "message_template" && (
            <p className="text-xs text-muted">
              Copy only — message templates are not linked as submission materials.
            </p>
          )}
          {decision === "unavailable" && (
            <p className="text-xs text-muted">Link materials first to attach an answer version.</p>
          )}
          {bindMsg && <p className="text-xs text-ink">{bindMsg}</p>}
        </div>
      )}
      <a href="/materials" className="mt-3 inline-block text-sm font-medium text-ink underline">
        Open library
      </a>
    </div>
  );
}
