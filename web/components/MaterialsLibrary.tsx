"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { PopoverSelect } from "@/components/ui/popover-select";
import {
  addMaterialVersion,
  archiveMaterial,
  createMaterial,
  getMaterials,
  patchMaterial,
  uploadMaterial,
  type Material,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "other", label: "Other" },
  { value: "resume", label: "Resume" },
  { value: "cover_letter", label: "Cover letter" },
  { value: "portfolio", label: "Portfolio" },
  { value: "transcript", label: "Transcript" },
];

function kindLabel(kind: string): string {
  return KINDS.find((k) => k.value === kind)?.label ?? kind;
}

function versionLabel(material: Material): string {
  const latest = material.versions.find((v) => !v.archived_at) ?? material.versions[0];
  if (!latest) return "No selectable version";
  const name = latest.original_filename || latest.url || latest.display_label || `v${latest.version_number}`;
  return `${latest.display_label ?? `v${latest.version_number}`} · ${name}`;
}

export function MaterialsLibrary() {
  const [rows, setRows] = useState<Material[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  async function refresh() {
    const list = await getMaterials(showArchived);
    setRows(list);
  }

  useEffect(() => {
    void refresh().finally(() => setLoaded(true));
  }, [showArchived]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((m) => {
      if (kind !== "all" && m.kind !== kind) return false;
      if (!q) return true;
      const hay = [
        m.title,
        m.notes,
        m.purpose.join(" "),
        ...m.versions.flatMap((v) => [v.version_label, v.original_filename, v.url, v.purpose.join(" "), v.notes]),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, kind]);

  if (!loaded) {
    return <div className="py-16 text-center text-sm text-muted">Loading materials…</div>;
  }

  const detail = rows.find((m) => m.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Materials</h1>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="ml-auto h-9 rounded-lg border border-ink bg-ink px-3 text-sm text-white"
        >
          Add material
        </button>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search materials…"
          className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm"
        />
        <PopoverSelect
          value={kind}
          onChange={setKind}
          aria-label="Type"
          className="w-40"
          options={[{ value: "all", label: "All types" }, ...KINDS]}
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-line"
          />
          Show archived
        </label>
      </div>
      {adding && (
        <AddMaterialForm
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await refresh();
          }}
        />
      )}
      {visible.length === 0 ? (
        <Card className="grid min-h-[12rem] place-items-center text-center">
          <div className="max-w-xs space-y-2">
            <CardTitle>No materials yet</CardTitle>
            <CardSub>Save a résumé, cover letter, or link once, then reuse it in each Packet.</CardSub>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="h-9 rounded-lg border border-ink bg-ink px-3 text-sm text-white"
            >
              Add material
            </button>
          </div>
        </Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {visible.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenId(m.id)}>
                <div className="font-medium text-ink">{m.title}</div>
                <div className="text-xs text-muted">
                  {kindLabel(m.kind)}
                  {m.purpose.length ? ` · ${m.purpose.join(", ")}` : ""}
                  {m.archived_at ? " · Archived" : ""}
                </div>
                <div className="truncate text-xs text-muted">{versionLabel(m)}</div>
              </button>
              <button
                type="button"
                onClick={() => void archiveMaterial(m.id, Boolean(m.archived_at)).then(() => refresh())}
                className="text-xs text-muted hover:text-ink"
              >
                {m.archived_at ? "Restore" : "Archive"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {detail && (
        <MaterialDetail
          material={detail}
          onClose={() => setOpenId(null)}
          onChange={async () => {
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function AddMaterialForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("other");
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function tags(): string[] {
    return purpose
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  async function save() {
    setBusy(true);
    setError("");
    let created: Material | null = null;
    if (mode === "link") {
      created = await createMaterial({
        title: title || "Untitled material",
        kind,
        url,
        purpose: tags(),
      });
    } else if (file) {
      const form = new FormData();
      form.set("title", title || file.name.replace(/\.[^.]+$/, ""));
      form.set("kind", kind);
      form.set("purpose", JSON.stringify(tags()));
      form.set("file", file);
      created = await uploadMaterial(form);
    } else {
      setError("Save needs a file or a URL");
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!created) {
      setError("Could not save material");
      return;
    }
    await onSaved();
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Add material</h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Name"
        className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm"
      />
      <PopoverSelect value={kind} onChange={setKind} aria-label="Type" className="w-40" options={KINDS} />
      <input
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        placeholder="Purpose tags, comma separated"
        className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={cn("rounded-full border px-3 py-1 text-xs", mode === "upload" ? "border-ink bg-ink text-white" : "border-line")}
        >
          Upload
        </button>
        <button
          type="button"
          onClick={() => setMode("link")}
          className={cn("rounded-full border px-3 py-1 text-xs", mode === "link" ? "border-ink bg-ink text-white" : "border-line")}
        >
          Link
        </button>
      </div>
      {mode === "upload" ? (
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      ) : (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm"
        />
      )}
      {error && <p className="text-xs text-amber-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void save()} className="h-9 rounded-lg bg-ink px-3 text-sm text-white">
          Save material
        </button>
        <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-line px-3 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

function MaterialDetail({
  material,
  onClose,
  onChange,
}: {
  material: Material;
  onClose: () => void;
  onChange: () => Promise<void>;
}) {
  const [title, setTitle] = useState(material.title);
  const [url, setUrl] = useState("");

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{material.title}</h2>
        <button type="button" onClick={onClose} className="text-xs text-muted">
          Close
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void patchMaterial(material.id, { title }).then(() => onChange())}
          className="h-9 rounded-lg border border-line bg-bg px-2 text-sm"
        />
        <span className="self-center text-xs text-muted">{kindLabel(material.kind)}</span>
      </div>
      <ul className="space-y-2 text-sm">
        {material.versions.map((v) => (
          <li key={v.id} className="rounded-lg border border-line px-3 py-2">
            <div className="font-medium">
              {v.display_label ?? `v${v.version_number}`}
              {v.archived_at ? " · Archived" : ""}
            </div>
            <div className="text-xs text-muted">
              {v.original_filename || v.url || "File"}
              {v.purpose.length ? ` · ${v.purpose.join(", ")}` : ""}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Add version URL"
          className="h-9 min-w-[12rem] flex-1 rounded-lg border border-line bg-bg px-2 text-sm"
        />
        <button
          type="button"
          onClick={async () => {
            if (!url.trim()) return;
            await addMaterialVersion(material.id, { url });
            setUrl("");
            await onChange();
          }}
          className="h-9 rounded-lg border border-ink px-3 text-sm"
        >
          Add version
        </button>
      </div>
    </div>
  );
}
