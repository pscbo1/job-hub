"use client";

import { useEffect, useMemo, useState } from "react";

import {
  changePacketVersion,
  createMaterial,
  getMaterials,
  getPacket,
  materialVersionFileUrl,
  replacePacket,
  removePacketBinding,
  submitApplication,
  updateApplication,
  type Application,
  type Material,
  type PacketItem,
} from "@/lib/api";
import { cn, externalUrl } from "@/lib/utils";

export function ApplicationWorkspace({
  app,
  tab,
  onTab,
  onChanged,
}: {
  app: Application;
  tab: "notes" | "packet";
  onTab: (tab: "notes" | "packet") => void;
  onChanged: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold text-ink">{app.title}</h2>
        <button
          type="button"
          onClick={() => onTab("notes")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            tab === "notes" ? "border-ink bg-ink text-white" : "border-line text-muted",
          )}
        >
          Notes
        </button>
        <button
          type="button"
          onClick={() => onTab("packet")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            tab === "packet" ? "border-ink bg-ink text-white" : "border-line text-muted",
          )}
        >
          Packet
        </button>
      </div>
      {tab === "notes" ? (
        <textarea
          defaultValue={app.notes}
          onBlur={(e) => void updateApplication(app.id, { notes: e.target.value }).then(onChanged)}
          rows={6}
          className="w-full rounded-lg border border-line bg-bg p-3 text-sm text-ink"
          placeholder="Optional notes. Close reasons can live here."
        />
      ) : (
        <PacketPanel app={app} onChanged={onChanged} />
      )}
    </div>
  );
}

function PacketPanel({ app, onChanged }: { app: Application; onChanged: () => void }) {
  const [items, setItems] = useState<PacketItem[]>([]);
  const [picker, setPicker] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  async function refresh() {
    setItems(await getPacket(app.id));
  }

  useEffect(() => {
    void refresh();
  }, [app.id]);

  const submitted = (app.submissions?.length ?? 0) > 0;
  const canEdit = app.stage !== "closed";

  async function onSubmit() {
    if (items.length === 0) {
      setConfirmEmpty(true);
      return;
    }
    if (!window.confirm("Mark this application as submitted?")) return;
    const ok = await submitApplication(app.id);
    if (ok) onChanged();
  }

  async function onSubmitEmpty() {
    const ok = await submitApplication(app.id);
    setConfirmEmpty(false);
    if (ok) onChanged();
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-muted">还没选择材料. Add materials for this application.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.binding.id} className="rounded-lg border border-line px-3 py-2 text-sm">
              <div className="font-medium text-ink">{item.material?.title ?? "Material"}</div>
              <div className="text-xs text-muted">
                {item.version?.display_label ?? `v${item.version?.version_number ?? 1}`}
                {item.version?.original_filename ? ` · ${item.version.original_filename}` : ""}
                {item.version?.url ? ` · ${item.version.url}` : ""}
                {item.material?.archived_at || item.version?.archived_at ? " · Archived" : ""}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.version?.url && (
                  <a href={externalUrl(item.version.url)} target="_blank" rel="noopener noreferrer" className="text-xs text-brand">
                    Open link
                  </a>
                )}
                {item.version?.file_ref && (
                  <a href={materialVersionFileUrl(item.version.id)} className="text-xs text-brand">
                    Download
                  </a>
                )}
                {canEdit && item.material && (
                  <VersionSelect
                    material={item.material}
                    currentId={item.binding.material_version_id}
                    onPick={(versionId) =>
                      void changePacketVersion(app.id, item.binding.id, versionId).then(refresh)
                    }
                  />
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void removePacketBinding(app.id, item.binding.id).then(refresh)}
                    className="text-xs text-muted hover:text-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <button type="button" onClick={() => setPicker(true)} className="h-9 rounded-lg border border-line px-3 text-sm">
          Add materials
        </button>
      )}
      {app.url && (
        <a href={externalUrl(app.url)} target="_blank" rel="noopener noreferrer" className="ml-2 text-sm text-brand">
          Open source
        </a>
      )}
      {(app.stage === "draft" || submitted) && canEdit && (
        <button type="button" onClick={() => void onSubmit()} className="ml-2 text-sm font-medium text-ink underline">
          {app.stage === "draft" ? "Mark submitted" : "Record another submission"}
        </button>
      )}
      {confirmEmpty && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <p>本次未记录材料，仍可记录已提交.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => void onSubmitEmpty()} className="h-8 rounded-lg bg-ink px-3 text-xs text-white">
              Record without materials
            </button>
            <button type="button" onClick={() => setConfirmEmpty(false)} className="h-8 text-xs text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
      {submitted && (
        <div className="border-t border-line pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Submissions</h3>
          <ul className="mt-2 space-y-2">
            {[...(app.submissions ?? [])].reverse().map((row, index, all) => (
              <li key={row.id} className="text-sm">
                <div className="font-medium">
                  Submission #{all.length - index} · {row.submitted_at.slice(0, 16).replace("T", " ")}
                </div>
                <div className="text-xs text-muted">
                  {(row.packet_snapshot?.items?.length ?? row.packet_snapshot?.material_version_ids.length ?? 0) === 0
                    ? "No materials recorded"
                    : `${row.packet_snapshot?.items?.length ?? row.packet_snapshot?.material_version_ids.length} materials`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {picker && (
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
  if (options.length < 2) return null;
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

  useEffect(() => {
    void getMaterials(false).then(setLibrary);
    const next: Record<string, string> = {};
    for (const item of selected) {
      next[item.binding.material_id] = item.binding.material_version_id;
    }
    setChosen(next);
  }, [selected]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter((m) => {
      if (m.archived_at) return false;
      if (!q) return true;
      return [m.title, m.purpose.join(" ")].join(" ").toLowerCase().includes(q);
    });
  }, [library, query]);

  function latest(m: Material): string | null {
    const v = m.versions.find((row) => !row.archived_at);
    return v?.id ?? null;
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
              <span className="flex-1">{m.title}</span>
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
        <button
          type="button"
          onClick={async () => {
            if (!url.trim()) return;
            const created = await createMaterial({ title: name || "Untitled material", url });
            if (created) {
              setLibrary((rows) => [created, ...rows]);
              const v1 = created.versions[0]?.id;
              if (v1) setChosen((prev) => ({ ...prev, [created.id]: v1 }));
              setName("");
              setUrl("");
            }
          }}
          className="h-9 rounded-lg border border-line px-3 text-xs"
        >
          Save to library and select
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
