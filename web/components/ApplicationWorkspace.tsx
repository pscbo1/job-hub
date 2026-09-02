"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ApplicationKnowledgeUse } from "@/components/ApplicationKnowledgeUse";
import { SourceActionLink } from "@/components/SourceActionLink";
import {
  addCommNote,
  changePacketVersion,
  createSubmissionMaterialRevision,
  createMaterial,
  deleteCommNote,
  getMaterials,
  effectiveSubmissionSnapshot,
  listSubmissionMaterialRevisions,
  loadCommNotes,
  loadPacket,
  materialVersionFileUrl,
  replacePacket,
  removePacketBinding,
  submissionSnapshotFileUrl,
  uploadMaterial,
  type Application,
  type ApplicationCommNote,
  type Material,
  type PacketItem,
  type PacketSnapshotItem,
  type SubmissionMaterialHistoryEntry,
} from "@/lib/api";
import {
  ASSIST_BTN_SECONDARY,
  ASSIST_COPY,
  assistPacketReadiness,
  assistSelectedCount,
  packetWorkbenchPath,
} from "@/lib/applicationUi";
import {
  formatKind,
  humanMaterialTitle,
  humanVersionLabel,
  latestVersion,
  partitionMaterials,
  partitionPacketItems,
  snapshotItemLabel,
} from "@/lib/materialsUi";
import { isStaleGeneration } from "@/lib/recordDraft";
import { formatDateTimeInAppTz } from "@/lib/timezone";
import { externalUrl } from "@/lib/utils";

export function NotesPanel({
  app,
  notes,
  onNotesChange,
  commDraft,
  onCommDraftChange,
}: {
  app: Application;
  notes: string;
  onNotesChange: (value: string) => void;
  commDraft: string;
  onCommDraftChange: (value: string) => void;
}) {
  const [rows, setRows] = useState<ApplicationCommNote[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const gen = useRef(0);

  useEffect(() => {
    const ac = new AbortController();
    const started = ++gen.current;
    setFailed(false);
    setRows(null);
    void loadCommNotes(app.id, ac.signal).then((result) => {
      if (ac.signal.aborted || isStaleGeneration(started, gen.current)) return;
      if (!result.ok) {
        setFailed(true);
        setRows([]);
        return;
      }
      setRows(result.notes);
    });
    return () => {
      ac.abort();
      gen.current += 1;
    };
  }, [app.id, retry]);

  async function refreshNotes() {
    const result = await loadCommNotes(app.id);
    if (result.ok) setRows(result.notes);
    else setFailed(true);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Application notes
        </h3>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={8}
          className="w-full rounded-lg border border-line bg-bg p-3 text-sm text-ink"
          placeholder="Notes for this application. Close reasons can live here."
        />
      </div>
      <details className="rounded-lg border border-line bg-bg p-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">Communication notes</summary>
        <p className="mt-1 text-xs text-muted">Optional. This is not a timeline or inbox.</p>
        {failed ? (
          <div className="mt-2 text-sm text-muted">
            Could not load communication notes.
            <button type="button" className="ml-2 text-ink underline" onClick={() => setRetry((n) => n + 1)}>
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="mt-2 flex gap-2">
              <input
                value={commDraft}
                onChange={(e) => onCommDraftChange(e.target.value)}
                placeholder="Add note"
                className="h-9 flex-1 rounded-lg border border-line bg-surface px-2 text-sm"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!commDraft.trim()) return;
                  await addCommNote(app.id, commDraft.trim());
                  onCommDraftChange("");
                  await refreshNotes();
                }}
                className="h-9 rounded-lg border border-line px-3 text-sm"
              >
                Add note
              </button>
            </div>
            {rows === null ? (
              <p className="mt-2 text-xs text-muted">Loading…</p>
            ) : rows.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {rows.map((note) => (
                  <li
                    key={note.id}
                    className="flex items-start justify-between gap-2 rounded-lg bg-surface px-2 py-1"
                  >
                    <span>
                      <span className="text-xs text-muted">
                        {formatDateTimeInAppTz(note.created_at)} ·{" "}
                      </span>
                      {note.body}
                    </span>
                    <button
                      type="button"
                      onClick={() => void deleteCommNote(app.id, note.id).then(refreshNotes)}
                      className="text-xs text-muted hover:text-ink"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">No communication notes yet.</p>
            )}
          </>
        )}
      </details>
    </div>
  );
}

const ROW_BTN =
  "inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink hover:border-ink/30";

export function MaterialsArea({
  app,
  onChanged,
  onSubmitRequest,
  standalone = false,
}: {
  app: Application;
  onChanged: () => void;
  onSubmitRequest?: () => void;
  standalone?: boolean;
}) {
  const [items, setItems] = useState<PacketItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picker, setPicker] = useState(false);
  const [correctingSub, setCorrectingSub] = useState<string | null>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [materialsView, setMaterialsView] = useState<"prepare" | "history">("prepare");
  const [showLibrary, setShowLibrary] = useState(false);
  const [retry, setRetry] = useState(0);
  const gen = useRef(0);
  const canEdit = app.stage !== "closed";
  const submitted = (app.submissions?.length ?? 0) > 0;
  const subs = [...(app.submissions ?? [])].reverse();
  const latest = subs[0] ?? null;
  const lanes = items ? partitionPacketItems(items) : { files: [], knowledge: [] };

  useEffect(() => {
    setMaterialsView(submitted ? "history" : "prepare");
    setShowLibrary(false);
  }, [app.id, submitted]);

  useEffect(() => {
    const ac = new AbortController();
    const started = ++gen.current;
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
    const newest = app.submissions?.[app.submissions.length - 1]?.id ?? null;
    setOpenSub(newest);
    return () => {
      ac.abort();
      gen.current += 1;
    };
  }, [app.id, app.submissions?.length, retry]);

  async function refresh(notify = false) {
    const started = gen.current;
    const result = await loadPacket(app.id);
    if (isStaleGeneration(started, gen.current)) return;
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setItems(result.items);
    if (notify) onChanged();
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{ASSIST_COPY.heading}</h2>
          <p className="mt-1 text-xs text-muted">
            {submitted
              ? `${subs.length} submission${subs.length === 1 ? "" : "s"}`
              : items === null
                ? ASSIST_COPY.loading
                : assistPacketReadiness(items.length)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && items !== null && materialsView === "prepare" && (
            <button type="button" onClick={() => setPicker(true)} className={ASSIST_BTN_SECONDARY}>
              {ASSIST_COPY.choose}
            </button>
          )}
          {standalone ? (
            <a href={`/applications?id=${encodeURIComponent(app.id)}`} className={ASSIST_BTN_SECONDARY}>
              {ASSIST_COPY.backOverview}
            </a>
          ) : (
            <a
              href={packetWorkbenchPath(app.id)}
              target="_blank"
              rel="noopener noreferrer"
              className={ASSIST_BTN_SECONDARY}
            >
              {ASSIST_COPY.openWindow}
            </a>
          )}
          {submitted && (
            <div className="flex rounded-lg border border-line bg-bg p-0.5" role="tablist" aria-label="Packet views">
              <button
                type="button"
                role="tab"
                aria-selected={materialsView === "prepare"}
                onClick={() => setMaterialsView("prepare")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${materialsView === "prepare" ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
              >
                {ASSIST_COPY.packet}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={materialsView === "history"}
                onClick={() => setMaterialsView("history")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${materialsView === "history" ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
              >
                {ASSIST_COPY.history}
              </button>
            </div>
          )}
        </div>
      </header>

      {materialsView === "prepare" ? (
        <section className="space-y-4">
          {failed ? (
            <div className="rounded-lg border border-line bg-bg p-3 text-sm text-muted">
              {ASSIST_COPY.loadFailed}
              <button type="button" className="ml-2 text-ink underline" onClick={() => setRetry((n) => n + 1)}>
                {ASSIST_COPY.retry}
              </button>
            </div>
          ) : items === null ? (
            <p className="text-sm text-muted">{ASSIST_COPY.loading}</p>
          ) : (
            <div className="space-y-5">
              <PacketLane
                heading={ASSIST_COPY.filesSection}
                hint={ASSIST_COPY.filesHint}
                empty={ASSIST_COPY.emptyFiles}
                items={lanes.files}
                lane="files"
                app={app}
                canEdit={canEdit}
                onRefresh={refresh}
              />
              <PacketLane
                heading={ASSIST_COPY.knowledgeSection}
                hint={ASSIST_COPY.knowledgeHint}
                empty={ASSIST_COPY.emptyKnowledge}
                items={lanes.knowledge}
                lane="knowledge"
                app={app}
                canEdit={canEdit}
                onRefresh={refresh}
              />
            </div>
          )}

          <div className="border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setShowLibrary((value) => !value)}
              className="text-sm font-medium text-ink underline"
              aria-expanded={showLibrary}
            >
              {showLibrary ? ASSIST_COPY.hideAnswers : ASSIST_COPY.answers}
            </button>
            {showLibrary && (
              <div className="mt-3">
                <ApplicationKnowledgeUse app={app} items={failed ? null : items} canEdit={canEdit} onBound={() => void refresh(true)} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <SourceActionLink
              variant="primary"
              apply_url={app.apply_url}
              url={app.url}
              job_url={app.job_url}
            />
            {onSubmitRequest && (
              <button type="button" onClick={onSubmitRequest} className={ASSIST_BTN_SECONDARY}>
                {ASSIST_COPY.markSubmitted}
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          {latest && (
            <div className="rounded-lg border border-line bg-bg p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Latest submission</p>
              <p className="mt-1 font-medium text-ink">{formatDateTimeInAppTz(latest.submitted_at)}</p>
              <p className="mt-1 text-xs text-muted">
                {(latest.packet_snapshot?.items?.length ?? 0) === 0 ? "No materials recorded" : `${latest.packet_snapshot?.items?.length} materials recorded`}
              </p>
            </div>
          )}
          <ul className="space-y-2">
            {subs.map((row, index) => {
              const itemsSnap = effectiveSubmissionSnapshot(row).items ?? [];
              const corrected = (row.material_revision ?? 0) > 0;
              const open = openSub === row.id;
              return (
                <li key={row.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                  <button type="button" className="flex w-full items-center justify-between gap-2 text-left font-medium" onClick={() => setOpenSub(open ? null : row.id)}>
                    <span>Submission #{subs.length - index}</span>
                    <span className="text-xs font-normal text-muted">{formatDateTimeInAppTz(row.submitted_at)}{corrected ? " · Corrected" : ""}</span>
                  </button>
                  {open && (
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      {itemsSnap.length === 0 ? <p className="text-xs text-muted">No materials recorded</p> : itemsSnap.map((snap, snapIndex) => (
                        <SnapshotRow key={`${row.id}-${snapIndex}`} appId={app.id} submissionId={row.id} index={snapIndex} item={snap} />
                      ))}
                      <div className="flex flex-wrap gap-3 pt-1">
                        <button type="button" className="text-xs font-medium text-ink underline" onClick={() => setCorrectingSub(row.id)}>Correct materials record</button>
                        {corrected ? <CorrectionHistoryLink appId={app.id} submissionId={row.id} /> : null}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {picker && items && (
        <PacketPicker
          app={app}
          selected={items}
          onClose={() => setPicker(false)}
          onSave={async (ids) => {
            await replacePacket(app.id, ids);
            setPicker(false);
            await refresh();
            onChanged();
          }}
        />
      )}
      {correctingSub ? (
        <CorrectMaterialsDialog
          app={app}
          submissionId={correctingSub}
          onClose={() => setCorrectingSub(null)}
          onSaved={() => { setCorrectingSub(null); onChanged(); setRetry((n) => n + 1); }}
        />
      ) : null}
    </div>
  );
}

function PacketLane({
  heading,
  hint,
  empty,
  items,
  lane,
  app,
  canEdit,
  onRefresh,
}: {
  heading: string;
  hint: string;
  empty: string;
  items: PacketItem[];
  lane: "files" | "knowledge";
  app: Application;
  canEdit: boolean;
  onRefresh: (notify?: boolean) => Promise<void>;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-sm font-semibold text-ink">{heading}</h4>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <CurrentMaterialRow
              key={item.binding.id}
              app={app}
              item={item}
              lane={lane}
              canEdit={canEdit}
              onRefresh={onRefresh}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CurrentMaterialRow({
  app,
  item,
  lane,
  canEdit,
  onRefresh,
}: {
  app: Application;
  item: PacketItem;
  lane: "files" | "knowledge";
  canEdit: boolean;
  onRefresh: (notify?: boolean) => Promise<void>;
}) {
  const [more, setMore] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const version = item.version;
  const title = humanMaterialTitle(item.material, version);
  const versionLabel = humanVersionLabel(version);
  const kindLabel = formatKind(item.material?.kind ?? "other");
  const fileUrl = version?.file_ref ? materialVersionFileUrl(version.id) : "";
  const link = (version?.url ?? "").trim();
  const text = (version?.text ?? "").trim();

  async function copyValue(value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1800);
  }

  const copyLabel =
    copyState === "copied" ? ASSIST_COPY.copied : copyState === "failed" ? ASSIST_COPY.copyFailed : null;

  return (
    <li className="rounded-lg border border-line px-3 py-2 text-sm">
      <div className="font-medium text-ink">{title}</div>
      <div className="text-xs text-muted">
        {[kindLabel, versionLabel && versionLabel !== title ? versionLabel : ""].filter(Boolean).join(" · ")}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {lane === "files" && fileUrl ? (
          <a href={fileUrl} download={version?.original_filename || undefined} className={ROW_BTN}>
            {ASSIST_COPY.download}
          </a>
        ) : null}
        {link ? (
          <button type="button" onClick={() => void copyValue(link)} className={ROW_BTN}>
            {copyLabel ?? ASSIST_COPY.copyLink}
          </button>
        ) : null}
        {lane === "knowledge" && text ? (
          <button type="button" onClick={() => void copyValue(text)} className={ROW_BTN}>
            {copyLabel ?? ASSIST_COPY.copy}
          </button>
        ) : null}
        {lane === "files" && !fileUrl && !link ? (
          <span className="text-xs text-muted">{ASSIST_COPY.noCopy}</span>
        ) : null}
        {lane === "knowledge" && !text && !link ? (
          <span className="text-xs text-muted">{ASSIST_COPY.noCopy}</span>
        ) : null}
        {canEdit && item.material && (
          <label className="flex items-center gap-1 text-xs text-muted">
            {ASSIST_COPY.changeVersion}
            <VersionSelect
              material={item.material}
              currentId={item.binding.material_version_id}
              onPick={(versionId) =>
                void changePacketVersion(app.id, item.binding.id, versionId).then(() => onRefresh(true))
              }
            />
          </label>
        )}
        {canEdit && (
          <details
            className="text-xs text-muted"
            open={more}
            onToggle={(e) => setMore((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer">{ASSIST_COPY.more}</summary>
            <button
              type="button"
              onClick={() => void removePacketBinding(app.id, item.binding.id).then(() => onRefresh(true))}
              className="mt-1 block text-left hover:text-red-600"
            >
              {ASSIST_COPY.remove}
            </button>
          </details>
        )}
      </div>
    </li>
  );
}

function SnapshotRow({
  appId,
  submissionId,
  index,
  item,
}: {
  appId: string;
  submissionId: string;
  index: number;
  item: PacketSnapshotItem;
}) {
  const label = snapshotItemLabel(item);
  const hasFile = Boolean(item.snapshot_file_ref || item.file_ref);
  return (
    <div>
      <span className="text-ink">{label || "No materials recorded"}</span>
      {item.url ? (
        <>
          {" · "}
          <a href={externalUrl(item.url)} target="_blank" rel="noopener noreferrer" className="text-brand">
            Open link
          </a>
        </>
      ) : null}
      {hasFile ? (
        <>
          {" · "}
          <a href={submissionSnapshotFileUrl(appId, submissionId, index)} className="text-brand">
            {ASSIST_COPY.download}
          </a>
        </>
      ) : !item.url ? (
        <span> · No materials recorded</span>
      ) : null}
    </div>
  );
}

function CorrectionHistoryLink({ appId, submissionId }: { appId: string; submissionId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SubmissionMaterialHistoryEntry[] | null>(null);
  async function toggle() {
    if (!open && rows === null) setRows(await listSubmissionMaterialRevisions(appId, submissionId));
    setOpen((value) => !value);
  }
  return (
    <span>
      <button type="button" className="text-xs text-muted underline" onClick={() => void toggle()}>View correction history</button>
      {open && rows ? <span className="ml-2 text-xs text-muted">{rows.map((row) => `v${row.revision}${row.note ? `: ${row.note}` : ""}`).join(" · ")}</span> : null}
    </span>
  );
}

function CorrectMaterialsDialog({
  app,
  submissionId,
  onClose,
  onSaved,
}: {
  app: Application;
  submissionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submission = app.submissions?.find((row) => row.id === submissionId);
  const snapshot = submission ? effectiveSubmissionSnapshot(submission) : null;
  const [keep, setKeep] = useState<boolean[]>(() => snapshot?.items?.map(() => true) ?? []);
  const [library, setLibrary] = useState<Material[]>([]);
  const [addVersion, setAddVersion] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useId().replace(/:/g, "");

  useEffect(() => { void getMaterials().then(setLibrary); }, []);
  if (!submission || !snapshot) return null;
  const currentSubmission = submission;
  const snapshotItems = snapshot.items ?? [];
  const options = library.flatMap((material) => material.versions.filter((version) => !version.archived_at && material.kind !== "message_template").map((version) => ({ material, version })));
  const selectedCount = keep.filter(Boolean).length + (addVersion ? 1 : 0);
  async function save() {
    if (busy) return;
    if (selectedCount === 0 && !window.confirm("This will record the submission as having no materials. Continue?")) return;
    setBusy(true); setError("");
    const result = await createSubmissionMaterialRevision(app.id, submissionId, {
      expected_revision: currentSubmission.material_revision ?? 0,
      items: [
        ...keep.flatMap((value, index) => value ? [{ retain_item_index: index }] : []),
        ...(addVersion ? [{ material_version_id: addVersion }] : []),
      ],
      confirm_empty: selectedCount === 0,
      note,
      idempotency_key: `ui-${requestId}-${currentSubmission.material_revision ?? 0}`,
    });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="correct-materials-title">
      <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-lg border border-line bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4"><div><h2 id="correct-materials-title" className="text-lg font-semibold text-ink">Correct materials record</h2><p className="mt-1 text-sm text-muted">{app.employer} · {app.title} · {formatDateTimeInAppTz(currentSubmission.submitted_at)}</p></div><button type="button" onClick={onClose} className="text-sm text-muted underline">Close</button></div>
        <p className="mt-4 text-sm text-muted">Update the materials recorded for this submission. Current linked materials are not loaded here.</p>
        <ul className="mt-3 space-y-2">{snapshotItems.map((item, index) => <li key={`${item.material_version_id}-${index}`} className="flex items-start gap-2 rounded border border-line p-2 text-sm"><input type="checkbox" checked={keep[index] ?? false} onChange={(e) => setKeep((rows) => rows.map((value, i) => i === index ? e.target.checked : value))} /><span><span className="font-medium text-ink">{item.title || "Material"}</span><span className="ml-2 text-xs text-muted">{item.version_label || `v${item.version_number}`}</span></span></li>)}</ul>
        <label className="mt-4 block text-sm text-ink">Add or replace with another version<select value={addVersion} onChange={(e) => setAddVersion(e.target.value)} className="mt-1 h-9 w-full rounded border border-line bg-bg px-2 text-sm"><option value="">No additional material</option>{options.map(({ material, version }) => <option key={version.id} value={version.id}>{material.title} · {version.display_label || `v${version.version_number}`}</option>)}</select></label>
        <label className="mt-3 block text-sm text-ink">Correction note<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded border border-line bg-bg p-2 text-sm" placeholder="Optional explanation" /></label>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded border border-line px-3 text-sm">Cancel</button><button type="button" disabled={busy} onClick={() => void save()} className="h-9 rounded bg-ink px-3 text-sm text-white disabled:opacity-50">{busy ? "Saving…" : `Save correction (${selectedCount})`}</button></div>
      </div>
    </div>
  );
}

function VersionSelect({
  material,
  currentId,
  onPick,
}: {
  material: Material;
  currentId: string;
  onPick: (id: string) => void;
}) {
  const options = material.versions.filter((v) => !v.archived_at || v.id === currentId);
  if (options.length === 0) return null;
  return (
    <select
      value={currentId}
      onChange={(e) => onPick(e.target.value)}
      className="h-7 rounded border border-line bg-bg text-xs"
      aria-label="Change version"
    >
      {options.map((v) => (
        <option key={v.id} value={v.id}>
          {humanVersionLabel(v) || `Version ${v.version_number}`}
        </option>
      ))}
    </select>
  );
}

function PacketPicker({
  app,
  selected,
  onClose,
  onSave,
}: {
  app: Application;
  selected: PacketItem[];
  onClose: () => void;
  onSave: (versionIds: string[]) => Promise<void>;
}) {
  const [library, setLibrary] = useState<Material[]>([]);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    void getMaterials(false).then(setLibrary);
    const next: Record<string, string> = {};
    for (const item of selected) {
      next[item.binding.material_id] = item.binding.material_version_id;
    }
    setChosen(next);
  }, [selected]);

  const visible = library.filter((m) => {
    if (m.archived_at) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [m.title, m.purpose.join(" "), m.kind, formatKind(m.kind)].join(" ").toLowerCase().includes(q);
  });
  const lanes = partitionMaterials(visible);

  function latest(m: Material): string | null {
    return latestVersion(m)?.id ?? null;
  }

  function toggle(m: Material, checked: boolean) {
    setChosen((prev) => {
      const copy = { ...prev };
      if (checked) {
        const pick = latest(m);
        if (pick) copy[m.id] = pick;
      } else {
        delete copy[m.id];
      }
      return copy;
    });
  }

  function renderRows(rows: Material[]) {
    return rows.map((m) => {
      const versionId = chosen[m.id] ?? "";
      const options = m.versions.filter((v) => !v.archived_at);
      const title = humanMaterialTitle(m, latestVersion(m));
      return (
        <li key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface">
          <input
            type="checkbox"
            checked={Boolean(versionId)}
            onChange={(e) => toggle(m, e.target.checked)}
          />
          <span className="flex-1">
            {title}
            <span className="ml-1 text-xs text-muted">{formatKind(m.kind)}</span>
          </span>
          {options.length > 0 && (
            <select
              value={versionId || options[0].id}
              onChange={(e) => setChosen((prev) => ({ ...prev, [m.id]: e.target.value }))}
              className="h-7 rounded border border-line bg-surface text-xs"
            >
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {humanVersionLabel(v) || `Version ${v.version_number}`}
                </option>
              ))}
            </select>
          )}
        </li>
      );
    });
  }

  return (
    <div className="rounded-xl border border-line bg-bg p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{ASSIST_COPY.pickerTitle}</h3>
        <span className="text-xs text-muted">
          {app.employer} · {app.title}
        </span>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={ASSIST_COPY.search}
        className="mb-3 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm"
      />
      <div className="max-h-72 space-y-4 overflow-auto">
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {ASSIST_COPY.filesSection}
          </h4>
          {lanes.files.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted">{ASSIST_COPY.emptyFiles}</p>
          ) : (
            <ul className="space-y-1">{renderRows(lanes.files)}</ul>
          )}
        </section>
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {ASSIST_COPY.knowledgeSection}
          </h4>
          {lanes.knowledge.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted">{ASSIST_COPY.emptyKnowledge}</p>
          ) : (
            <ul className="space-y-1">{renderRows(lanes.knowledge)}</ul>
          )}
        </section>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={ASSIST_COPY.newName}
          className="h-9 rounded-lg border border-line px-2 text-sm"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          className="h-9 min-w-[12rem] flex-1 rounded-lg border border-line px-2 text-sm"
        />
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button
          type="button"
          onClick={async () => {
            let created: Material | null = null;
            if (file) {
              const form = new FormData();
              form.set("title", name || file.name.replace(/\.[^.]+$/, ""));
              form.set("file", file);
              created = await uploadMaterial(form);
            } else if (url.trim()) {
              created = await createMaterial({ title: name || "Untitled material", url });
            }
            if (created) {
              setLibrary((rows) => [created as Material, ...rows]);
              const v1 = created.versions[0]?.id;
              if (v1) setChosen((prev) => ({ ...prev, [created!.id]: v1 }));
              setName("");
              setUrl("");
              setFile(null);
            }
          }}
          className="h-9 rounded-lg border border-line px-3 text-xs"
        >
          {ASSIST_COPY.addMaterial}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-muted">{assistSelectedCount(Object.keys(chosen).length)}</span>
        <button
          type="button"
          onClick={() => void onSave(Object.values(chosen))}
          className="h-8 rounded-lg bg-ink px-3 text-xs text-white"
        >
          {ASSIST_COPY.attach}
        </button>
        <button type="button" onClick={onClose} className="h-8 text-xs text-muted">
          {ASSIST_COPY.cancel}
        </button>
      </div>
    </div>
  );
}
