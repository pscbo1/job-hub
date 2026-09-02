"use client";

import { useEffect, useMemo, useState } from "react";

import {
  addPacketBinding,
  changePacketVersion,
  getMaterials,
  getMaterialUseItems,
  listMaterialUsePresets,
  type Application,
  type Material,
  type PacketItem,
  type MaterialUseItem,
  type MaterialUsePreset,
} from "@/lib/api";
import {
  copyFeedback,
  formatKind,
  knowledgeBindDecision,
  knowledgePreviewText,
  latestVersion,
  searchKnowledgeItems,
} from "@/lib/materialsUi";
import { externalUrl } from "@/lib/utils";

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
  const [purpose, setPurpose] = useState("");
  const [presetId, setPresetId] = useState("");
  const [useItems, setUseItems] = useState<MaterialUseItem[] | null>(null);
  const [presets, setPresets] = useState<MaterialUsePreset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "Copied" | "Copy failed" | "No text to copy">("idle");
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

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getMaterialUseItems({ query, purpose, application_id: app.id, preset_id: presetId || undefined }),
      listMaterialUsePresets(),
    ]).then(([result, available]) => {
      if (cancelled) return;
      setUseItems(result.items);
      setPresets(available);
    });
    return () => { cancelled = true; };
  }, [app.id, query, purpose, presetId]);

  const knowledge = useMemo(() => searchKnowledgeItems(library ?? [], query), [library, query]);
  const visibleItems = useItems ?? knowledge.map((row) => {
    const version = latestVersion(row);
    return {
      material_id: row.id, material_version_id: version?.id ?? "", material_title: row.title,
      kind: row.kind, version_label: version?.display_label ?? "", version_date: null,
      block_key: null, block_title: null, heading_path: [], purpose: row.purpose,
      original_filename: version?.original_filename ?? "", has_file: Boolean(version?.file_ref),
      url: version?.url || null, copy_text: version?.text ?? null,
      preview_text: knowledgePreviewText(row), is_pinned: Boolean(row.is_pinned), archived: false,
      unavailable_reason: null,
    } satisfies MaterialUseItem;
  });
  const selected = library?.find((row) => row.id === selectedId) ?? null;
  const selectedItem = visibleItems.find((row) => row.material_version_id === selectedVersionId) ??
    visibleItems.find((row) => row.material_id === selectedId) ?? null;
  const preview = selectedItem?.copy_text || selectedItem?.preview_text || (selected ? knowledgePreviewText(selected) : "");
  const decision = selected
    ? knowledgeBindDecision({ kind: selected.kind, items, materialId: selected.id })
    : "copy_only";

  async function copy(text?: string) {
    const value = (text ?? preview).trim();
    if (!value) {
      setCopyState("No text to copy");
      window.setTimeout(() => setCopyState("idle"), 1500);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(copyFeedback(true));
    } catch {
      setCopyState(copyFeedback(false));
      return;
    }
    window.setTimeout(() => setCopyState("idle"), 1500);
  }

  async function bind() {
    if (!selected || busy || !canEdit) return;
    const versionId = selectedItem?.material_version_id || latestVersion(selected)?.id;
    if (!versionId || (decision !== "bind_new" && decision !== "replace_version")) return;
    setBusy(true);
    setBindMsg("");
    let ok = false;
    if (decision === "replace_version") {
      const existing = items?.find((row) => row.binding.material_id === selected.id);
      if (existing) ok = await changePacketVersion(app.id, existing.binding.id, versionId);
    } else {
      ok = await addPacketBinding(app.id, versionId);
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
      <div className="mt-2 flex flex-wrap gap-2">
        <select value={presetId} onChange={(e) => setPresetId(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" aria-label="Use preset">
          <option value="">All materials</option>
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" aria-label="Filter by purpose">
          <option value="">All purposes</option>
          {Array.from(new Set(visibleItems.flatMap((row) => row.purpose))).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      {library === null || useItems === null ? (
        <p className="mt-2 text-sm text-muted">Loading templates and answers…</p>
      ) : visibleItems.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No templates or answers match.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {visibleItems.map((row) => (
            <li key={`${row.material_version_id}:${row.block_key ?? "root"}`}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(row.material_id);
                  setSelectedVersionId(row.material_version_id);
                  setCopyState("idle");
                  setBindMsg("");
                }}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  selectedVersionId === row.material_version_id ? "border-ink bg-surface text-ink" : "border-line text-ink"
                }`}
              >
                <span className="font-medium">{row.material_title}</span>
                {row.block_title ? <span className="ml-2 text-xs text-muted">{row.block_title}</span> : null}
                <span className="ml-2 text-xs text-muted">{row.version_label || formatKind(row.kind)}</span>
                <span className="mt-1 block truncate text-xs text-muted">{row.preview_text}</span>
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-2 px-3">
                {row.url ? (
                  <a
                    href={externalUrl(row.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 items-center rounded-md border border-line px-2 text-xs font-medium text-ink"
                  >
                    Open
                  </a>
                ) : null}
                <button
                  type="button"
                  className="h-7 rounded-md border border-line px-2 text-xs font-medium text-ink"
                  onClick={() => {
                    setSelectedId(row.material_id);
                    setSelectedVersionId(row.material_version_id);
                    void copy(row.copy_text || row.preview_text);
                  }}
                >
                  Copy
                </button>
                {row.is_pinned ? <span className="text-[11px] text-muted">Pinned</span> : null}
              </div>
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
            {selectedItem?.url ? (
              <a
                href={externalUrl(selectedItem.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-ink"
              >
                Open
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void copy()}
              className="h-8 rounded-lg border border-line px-3 text-xs font-medium text-ink"
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
