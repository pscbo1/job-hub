"use client";

import { useEffect, useRef, useState } from "react";

import {
  addCommNote,
  changePacketVersion,
  createMaterial,
  deleteCommNote,
  getMaterials,
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
} from "@/lib/api";
import { latestVersion, snapshotItemLabel } from "@/lib/materialsUi";
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

export function MaterialsArea({
  app,
  onChanged,
}: {
  app: Application;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<PacketItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picker, setPicker] = useState(false);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const gen = useRef(0);
  const canEdit = app.stage !== "closed";
  const submitted = (app.submissions?.length ?? 0) > 0;
  const subs = [...(app.submissions ?? [])].reverse();
  const latest = subs[0] ?? null;

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
      {app.stage === "draft" ? (
        <p className="text-sm text-ink">
          Link the materials you plan to send. Mark submitted snapshots these bindings.
        </p>
      ) : latest ? (
        <div className="rounded-lg border border-line bg-bg p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Latest submission
          </p>
          <p className="mt-1 text-ink">
            {formatDateTimeInAppTz(latest.submitted_at)}
            {" · "}
            {(latest.packet_snapshot?.items?.length ?? 0) === 0
              ? "当次材料未记录"
              : `${latest.packet_snapshot?.items?.length} used in that submission`}
          </p>
        </div>
      ) : null}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Linked materials</h3>
        <p className="mt-1 text-xs text-muted">
          Current bindings. Editing these does not change past submission snapshots.
        </p>
        {failed ? (
          <div className="mt-2 rounded-lg border border-line bg-bg p-3 text-sm text-muted">
            Could not load linked materials.
            <button type="button" className="ml-2 text-ink underline" onClick={() => setRetry((n) => n + 1)}>
              Retry
            </button>
          </div>
        ) : items === null ? (
          <p className="mt-2 text-sm text-muted">Loading materials…</p>
        ) : items.length === 0 ? (
          <div className="mt-2 rounded-lg border border-dashed border-line p-3 text-sm text-muted">
            No materials bound to this application.
            {canEdit && (
              <button type="button" onClick={() => setPicker(true)} className="ml-2 text-ink underline">
                Add materials
              </button>
            )}
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {items.map((item) => (
              <CurrentMaterialRow
                key={item.binding.id}
                app={app}
                item={item}
                canEdit={canEdit}
                onRefresh={refresh}
              />
            ))}
          </ul>
        )}
        {canEdit && items && items.length > 0 && (
          <button
            type="button"
            onClick={() => setPicker(true)}
            className="mt-2 h-9 rounded-lg border border-line px-3 text-sm"
          >
            Add materials
          </button>
        )}
      </div>

      <div className="rounded-lg border border-line bg-bg p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Templates & answers
        </h3>
        <p className="mt-1 text-sm text-muted">
          Copy from Templates & Answers. Add to Packet stays on the material itself.
        </p>
        <a href="/materials" className="mt-2 inline-block text-sm font-medium text-ink underline">
          Open Templates & Answers
        </a>
      </div>

      {submitted && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Submissions</h3>
          <p className="mt-1 text-xs text-muted">Read-only snapshots from each Mark submitted.</p>
          <ul className="mt-2 space-y-2">
            {subs.map((row, index) => {
              const itemsSnap = row.packet_snapshot?.items ?? [];
              const open = openSub === row.id;
              return (
                <li key={row.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                  <button
                    type="button"
                    className="w-full text-left font-medium"
                    onClick={() => setOpenSub(open ? null : row.id)}
                  >
                    Submission #{subs.length - index} · {formatDateTimeInAppTz(row.submitted_at)}
                  </button>
                  {open && (
                    <div className="mt-2 space-y-1 text-xs text-muted">
                      <p className="font-medium text-ink">Materials used in this submission</p>
                      {itemsSnap.length === 0 ? (
                        <p>当次材料未记录</p>
                      ) : (
                        itemsSnap.map((snap, snapIndex) => (
                          <SnapshotRow
                            key={`${row.id}-${snapIndex}`}
                            appId={app.id}
                            submissionId={row.id}
                            index={snapIndex}
                            item={snap}
                          />
                        ))
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
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
    </div>
  );
}

function CurrentMaterialRow({
  app,
  item,
  canEdit,
  onRefresh,
}: {
  app: Application;
  item: PacketItem;
  canEdit: boolean;
  onRefresh: (notify?: boolean) => Promise<void>;
}) {
  const [more, setMore] = useState(false);
  const version = item.version;
  return (
    <li className="rounded-lg border border-line px-3 py-2 text-sm">
      <div className="font-medium text-ink">{item.material?.title ?? "Material"}</div>
      <div className="text-xs text-muted">
        {item.material?.kind ?? "other"}
        {" · "}
        {version?.display_label ?? `v${version?.version_number ?? 1}`}
        {version?.original_filename ? ` · ${version.original_filename}` : ""}
        {version?.url ? ` · ${version.url}` : ""}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {version?.url && (
          <a href={externalUrl(version.url)} target="_blank" rel="noopener noreferrer" className="text-xs text-brand">
            Preview
          </a>
        )}
        {version?.file_ref && (
          <a href={materialVersionFileUrl(version.id)} className="text-xs text-brand">
            Download
          </a>
        )}
        {canEdit && item.material && (
          <label className="flex items-center gap-1 text-xs text-muted">
            Change version
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
            <summary className="cursor-pointer">More</summary>
            <button
              type="button"
              onClick={() => void removePacketBinding(app.id, item.binding.id).then(() => onRefresh(true))}
              className="mt-1 block text-left hover:text-red-600"
            >
              Remove
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
      <span className="text-ink">{label || "当次材料未记录"}</span>
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
            Download
          </a>
        </>
      ) : !item.url ? (
        <span> · 当次材料未记录</span>
      ) : null}
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
          {v.display_label ?? `v${v.version_number}`}
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
    if (m.kind === "message_template") return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [m.title, m.purpose.join(" "), m.kind].join(" ").toLowerCase().includes(q);
  });

  function latest(m: Material): string | null {
    return latestVersion(m)?.id ?? null;
  }

  return (
    <div className="rounded-xl border border-line bg-bg p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Select materials</h3>
        <span className="text-xs text-muted">
          {app.employer} · {app.title}
        </span>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search materials…"
        className="mb-2 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm"
      />
      <ul className="max-h-64 space-y-1 overflow-auto">
        {visible.map((m) => {
          const versionId = chosen[m.id] ?? "";
          const options = m.versions.filter((v) => !v.archived_at);
          return (
            <li key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface">
              <input
                type="checkbox"
                checked={Boolean(versionId)}
                onChange={(e) => {
                  setChosen((prev) => {
                    const copy = { ...prev };
                    if (e.target.checked) {
                      const pick = latest(m);
                      if (pick) copy[m.id] = pick;
                    } else {
                      delete copy[m.id];
                    }
                    return copy;
                  });
                }}
              />
              <span className="flex-1">
                {m.title}
                <span className="ml-1 text-xs text-muted">{m.kind}</span>
              </span>
              {options.length > 0 && (
                <select
                  value={versionId || options[0].id}
                  onChange={(e) => setChosen((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  className="h-7 rounded border border-line bg-surface text-xs"
                >
                  {options.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.display_label ?? `v${v.version_number}`}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New material name"
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
          Add material
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-muted">Selected {Object.keys(chosen).length}</span>
        <button
          type="button"
          onClick={() => void onSave(Object.values(chosen))}
          className="h-8 rounded-lg bg-ink px-3 text-xs text-white"
        >
          Save selection
        </button>
        <button type="button" onClick={onClose} className="h-8 text-xs text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}
