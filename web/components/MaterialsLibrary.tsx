"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  addMaterialVersion,
  addPacketBinding,
  archiveMaterial,
  createMaterial,
  getMaterial,
  getMaterials,
  materialVersionFileUrl,
  patchMaterial,
  uploadMaterial,
  uploadMaterialVersion,
} from "@/lib/api";
import {
  FILE_MATERIAL_KINDS,
  KNOWLEDGE_MATERIAL_KINDS,
  formatKind,
  isKnowledgeKind,
  latestVersion,
  versionFileLabel,
} from "@/lib/materialsUi";
import { isStaleGeneration } from "@/lib/recordDraft";
import { cn } from "@/lib/utils";
import type { Material, MaterialKind, MaterialVersion } from "@/lib/api";

type Lane = "files" | "knowledge";
type SourceKind = "upload" | "link" | "text";

type CreateDraft = {
  title: string;
  kind: MaterialKind;
  purpose: string;
  notes: string;
  version_label: string;
  source: SourceKind;
  url: string;
  content: string;
  file: File | null;
};

type VersionDraft = {
  source: SourceKind;
  url: string;
  content: string;
  file: File | null;
  version_label: string;
  purpose: string;
  notes: string;
};

function emptyCreate(kind: MaterialKind): CreateDraft {
  return {
    title: "",
    kind,
    purpose: "",
    notes: "",
    version_label: "",
    source: isKnowledgeKind(kind) ? "text" : "upload",
    url: "",
    content: "",
    file: null,
  };
}

function emptyVersion(kind: string): VersionDraft {
  return {
    source: isKnowledgeKind(kind) ? "text" : "upload",
    url: "",
    content: "",
    file: null,
    version_label: "",
    purpose: "",
    notes: "",
  };
}

function formatStamp(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function MaterialsLibrary({
  applicationId,
  packetMode = false,
  onPacketAdd,
}: {
  jobId?: string;
  applicationId?: string;
  packetMode?: boolean;
  onPacketAdd?: (material: Material, version: MaterialVersion) => Promise<void> | void;
}) {
  const [lane, setLane] = useState<Lane>("files");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(() => emptyCreate("resume"));
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Material | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const rows = await getMaterials();
    setMaterials(rows.filter((row) => !row.archived_at));
    setSelected((current) => {
      if (!current) return current;
      return rows.find((row) => row.id === current.id) ?? current;
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = materials.filter((row) => {
    const knowledge = isKnowledgeKind(row.kind);
    if (lane === "files" && knowledge) return false;
    if (lane === "knowledge" && !knowledge) return false;
    const blob = `${row.title} ${row.kind} ${row.purpose.join(" ")}`.toLowerCase();
    return blob.includes(query.trim().toLowerCase());
  });

  async function submitCreate() {
    if (createBusy) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const purpose = createDraft.purpose
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      let created: Material | null = null;
      if (createDraft.source === "upload") {
        if (!createDraft.file) {
          setCreateError("Choose a file to upload.");
          return;
        }
        const form = new FormData();
        form.set("title", createDraft.title.trim());
        form.set("kind", createDraft.kind);
        form.set("purpose", JSON.stringify(purpose));
        form.set("notes", createDraft.notes.trim());
        form.set("version_label", createDraft.version_label.trim());
        form.set("file", createDraft.file);
        created = await uploadMaterial(form);
      } else {
        created = await createMaterial({
          title: createDraft.title.trim(),
          kind: createDraft.kind,
          purpose,
          notes: createDraft.notes.trim(),
          version_label: createDraft.version_label.trim(),
          url: createDraft.source === "link" ? createDraft.url.trim() : undefined,
          content: createDraft.source === "text" ? createDraft.content : undefined,
        });
      }
      if (!created) {
        setCreateError("Save failed. Inputs were kept.");
        return;
      }
      await refresh();
      setCreating(false);
      setCreateDraft(emptyCreate(lane === "knowledge" ? "message_template" : "resume"));
      setSelected(created);
      setNotice("Material saved to the library.");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Save failed. Inputs were kept.");
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Materials</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Library files and knowledge stay independent of application stage.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
          onClick={() => {
            setCreating(true);
            setCreateDraft(emptyCreate(lane === "knowledge" ? "message_template" : "resume"));
            setCreateError(null);
          }}
        >
          Add material
        </button>
      </div>

      <div className="flex gap-1 rounded-lg border border-border p-1">
        {(["files", "knowledge"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm capitalize",
              lane === item ? "bg-foreground text-background" : "text-muted-foreground",
            )}
            onClick={() => setLane(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={lane === "knowledge" ? "Search templates and answers" : "Search files"}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />

      {notice ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p> : null}

      {creating ? (
        <CreateForm
          lane={lane}
          draft={createDraft}
          busy={createBusy}
          error={createError}
          onChange={setCreateDraft}
          onCancel={() => {
            setCreating(false);
            setCreateError(null);
          }}
          onSave={() => void submitCreate()}
        />
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Purpose</th>
              <th className="px-3 py-2">Latest version</th>
              <th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const latest = latestVersion(row);
              return (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-left font-medium text-sky-700 hover:underline dark:text-sky-300"
                      onClick={() => setSelected(row)}
                    >
                      {row.title}
                    </button>
                  </td>
                  <td className="px-3 py-2">{formatKind(row.kind)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.purpose.join(", ") || "—"}</td>
                  <td className="px-3 py-2">{latest ? versionFileLabel(latest) : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatStamp(row.updated_at)}</td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No materials in this tab.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected ? (
        <MaterialDetail
          material={selected}
          applicationId={applicationId}
          packetMode={packetMode}
          onClose={() => setSelected(null)}
          onStay={(material) => setSelected(material)}
          onChanged={async (next) => {
            await refresh();
            if (next) setSelected(next);
          }}
          onPacketAdd={onPacketAdd}
        />
      ) : null}
    </div>
  );
}

function CreateForm({
  lane,
  draft,
  busy,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  lane: Lane;
  draft: CreateDraft;
  busy: boolean;
  error: string | null;
  onChange: (next: CreateDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const kinds = lane === "knowledge" ? KNOWLEDGE_MATERIAL_KINDS : FILE_MATERIAL_KINDS;
  return (
    <form
      className="space-y-3 rounded-lg border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <h2 className="text-sm font-semibold">Add material</h2>
      <label className="block text-sm">
        Name
        <input
          required
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Type
        <select
          value={draft.kind}
          onChange={(event) => {
            const kind = event.target.value as MaterialKind;
            onChange({
              ...draft,
              kind,
              source: isKnowledgeKind(kind) ? "text" : draft.source === "text" ? "upload" : draft.source,
            });
          }}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        >
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {formatKind(kind)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Purpose (optional)
        <input
          value={draft.purpose}
          onChange={(event) => onChange({ ...draft, purpose: event.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          placeholder="cover letter, screening"
        />
      </label>
      <label className="block text-sm">
        Notes (optional)
        <textarea
          value={draft.notes}
          onChange={(event) => onChange({ ...draft, notes: event.target.value })}
          className="mt-1 min-h-[72px] w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Version label (optional)
        <input
          value={draft.version_label}
          onChange={(event) => onChange({ ...draft, version_label: event.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      {isKnowledgeKind(draft.kind) ? (
        <label className="block text-sm">
          Content
          <textarea
            required
            value={draft.content}
            onChange={(event) => onChange({ ...draft, content: event.target.value, source: "text" })}
            className="mt-1 min-h-[160px] w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
          />
        </label>
      ) : (
        <SourceFields
          source={draft.source === "text" ? "upload" : draft.source}
          url={draft.url}
          file={draft.file}
          onSource={(source) => onChange({ ...draft, source })}
          onUrl={(url) => onChange({ ...draft, url })}
          onFile={(file) => onChange({ ...draft, file })}
        />
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function SourceFields({
  source,
  url,
  file,
  onSource,
  onUrl,
  onFile,
}: {
  source: "upload" | "link";
  url: string;
  file: File | null;
  onSource: (source: "upload" | "link") => void;
  onUrl: (url: string) => void;
  onFile: (file: File | null) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          className={cn("rounded-md border px-3 py-1.5 text-sm", source === "upload" && "border-foreground")}
          onClick={() => onSource("upload")}
        >
          Upload
        </button>
        <button
          type="button"
          className={cn("rounded-md border px-3 py-1.5 text-sm", source === "link" && "border-foreground")}
          onClick={() => onSource("link")}
        >
          Link
        </button>
      </div>
      {source === "upload" ? (
        <input type="file" onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
      ) : (
        <input
          required
          value={url}
          onChange={(event) => onUrl(event.target.value)}
          placeholder="https://"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}

function MaterialDetail({
  material,
  applicationId,
  packetMode,
  onClose,
  onStay,
  onChanged,
  onPacketAdd,
}: {
  material: Material;
  applicationId?: string;
  packetMode: boolean;
  onClose: () => void;
  onStay: (material: Material) => void;
  onChanged: (next: Material | null) => Promise<void> | void;
  onPacketAdd?: (material: Material, version: MaterialVersion) => Promise<void> | void;
}) {
  const [recordId, setRecordId] = useState(material.id);
  const [held, setHeld] = useState(material);
  const [notes, setNotes] = useState(material.notes);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<Material | null>(null);
  const [adding, setAdding] = useState(false);
  const [versionDraft, setVersionDraft] = useState<VersionDraft>(() => emptyVersion(material.kind));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const gen = useRef(0);
  const target = useRef(material.id);

  useEffect(() => {
    if (material.id === recordId) {
      if (!dirty) {
        setHeld(material);
        setNotes(material.notes);
      }
      return;
    }
    if (dirty) {
      setPending(material);
      return;
    }
    target.current = material.id;
    setRecordId(material.id);
    setHeld(material);
    setNotes(material.notes);
    setAdding(false);
    setVersionDraft(emptyVersion(material.kind));
    setError(null);
    gen.current += 1;
  }, [material, dirty, recordId]);

  async function saveNotes(id: string, value: string) {
    const started = gen.current;
    await patchMaterial(id, { notes: value });
    if (isStaleGeneration(started, gen.current)) return;
  }

  async function keep() {
    if (!pending) return;
    await saveNotes(recordId, notes);
    target.current = pending.id;
    setRecordId(pending.id);
    setHeld(pending);
    setNotes(pending.notes);
    setDirty(false);
    setPending(null);
    setAdding(false);
    setVersionDraft(emptyVersion(pending.kind));
    gen.current += 1;
  }

  function discard() {
    if (!pending) return;
    target.current = pending.id;
    setRecordId(pending.id);
    setHeld(pending);
    setNotes(pending.notes);
    setDirty(false);
    setPending(null);
    setAdding(false);
    setVersionDraft(emptyVersion(pending.kind));
    gen.current += 1;
  }

  async function saveVersion() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let created: MaterialVersion | null = null;
      if (versionDraft.source === "upload") {
        if (!versionDraft.file) {
          setError("Choose a file to upload.");
          return;
        }
        const form = new FormData();
        form.set("version_label", versionDraft.version_label.trim());
        form.set("purpose", JSON.stringify(versionDraft.purpose.split(",").map((item) => item.trim()).filter(Boolean)));
        form.set("notes", versionDraft.notes.trim());
        form.set("file", versionDraft.file);
        created = await uploadMaterialVersion(held.id, form);
      } else {
        created = await addMaterialVersion(held.id, {
          url: versionDraft.source === "link" ? versionDraft.url.trim() : undefined,
          content: versionDraft.source === "text" ? versionDraft.content : undefined,
          version_label: versionDraft.version_label.trim(),
          purpose: versionDraft.purpose
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          notes: versionDraft.notes.trim(),
        });
      }
      if (!created) {
        setError("Upload failed. Inputs were kept.");
        return;
      }
      const next = await getMaterial(held.id);
      setVersionDraft(emptyVersion(held.kind));
      setAdding(false);
      if (next) {
        setHeld(next);
        await onChanged(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Inputs were kept.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLatest() {
    const latest = latestVersion(held);
    const text = latest?.text ?? latest?.url ?? "";
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function addAnswerToPacket() {
    const latest = latestVersion(held);
    if (!latest) return;
    if (onPacketAdd) {
      await onPacketAdd(held, latest);
      return;
    }
    if (applicationId) await addPacketBinding(applicationId, latest.id);
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-lg overflow-y-auto border-l border-border bg-background p-5 shadow-xl">
      {pending ? (
        <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
          Unsaved notes on another material. Keep them, or discard and switch.
          <div className="mt-2 flex gap-2">
            <button type="button" className="rounded-md bg-foreground px-2 py-1 text-background" onClick={() => void keep()}>
              Keep edits
            </button>
            <button type="button" className="rounded-md border border-border px-2 py-1" onClick={discard}>
              Discard
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1"
              onClick={() => {
                onStay(held);
                setPending(null);
              }}
            >
              Keep editing previous
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{formatKind(held.kind)}</p>
          <h2 className="text-lg font-semibold">{held.title}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-md border border-border px-2 py-1 text-sm">
          Close
        </button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{held.purpose.join(", ") || "No purpose set"}</p>
      <label className="mt-3 block text-sm">
        Notes
        <textarea
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
            setDirty(true);
          }}
          onBlur={() => {
            if (!dirty) return;
            const id = target.current;
            void saveNotes(id, notes).then(() => {
              if (target.current === id) setDirty(false);
            });
          }}
          className="mt-1 min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      {isKnowledgeKind(held.kind) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void copyLatest()} className="rounded-md border border-border px-3 py-1.5 text-sm">
            {copied ? "Copied" : "Copy"}
          </button>
          {(packetMode || applicationId) && held.kind === "application_answer" ? (
            <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => void addAnswerToPacket()}>
              Add to Packet
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Versions</h3>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-sm"
          onClick={() => {
            setAdding(true);
            setError(null);
          }}
        >
          {isKnowledgeKind(held.kind) ? "Add version" : "Upload new version"}
        </button>
      </div>
      {adding ? (
        <form
          className="mt-3 space-y-2 rounded-md border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void saveVersion();
          }}
        >
          {isKnowledgeKind(held.kind) ? (
            <textarea
              required
              value={versionDraft.content}
              onChange={(event) => setVersionDraft({ ...versionDraft, content: event.target.value, source: "text" })}
              className="min-h-[140px] w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
          ) : (
            <SourceFields
              source={versionDraft.source === "text" ? "upload" : versionDraft.source}
              url={versionDraft.url}
              file={versionDraft.file}
              onSource={(source) => setVersionDraft({ ...versionDraft, source })}
              onUrl={(url) => setVersionDraft({ ...versionDraft, url })}
              onFile={(file) => setVersionDraft({ ...versionDraft, file })}
            />
          )}
          <input
            value={versionDraft.version_label}
            onChange={(event) => setVersionDraft({ ...versionDraft, version_label: event.target.value })}
            placeholder="Version label (optional)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save version"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-border px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      <ul className="mt-3 space-y-2">
        {[...held.versions]
          .sort((a, b) => b.version_number - a.version_number)
          .map((version) => (
            <li key={version.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">{versionFileLabel(version)}</p>
              <p className="text-xs text-muted-foreground">{formatStamp(version.created_at)}</p>
              {version.text ? (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{version.text}</pre>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {version.file_ref ? (
                  <a href={materialVersionFileUrl(version.id)} className="rounded-md border border-border px-2 py-1 text-xs">
                    Preview / Download
                  </a>
                ) : null}
                {version.url ? (
                  <a href={version.url} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-1 text-xs">
                    Open link
                  </a>
                ) : null}
                {packetMode && onPacketAdd ? (
                  <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-xs"
                    onClick={() => void onPacketAdd(held, version)}
                  >
                    Use version
                  </button>
                ) : null}
              </div>
            </li>
          ))}
      </ul>
      <button
        type="button"
        className="mt-6 text-sm text-destructive"
        onClick={async () => {
          await archiveMaterial(held.id);
          onClose();
          await onChanged(null);
        }}
      >
        Archive material
      </button>
      <p className="mt-3 text-xs text-muted-foreground">
        New library versions do not change existing application bindings.
      </p>
    </aside>
  );
}
