"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCompanySource,
  getCompanySources,
  patchCompanySource,
  type CompanySource,
} from "@/lib/api";
import {
  MANAGE_SOURCES_COPY,
  SOURCE_KINDS,
  filterManagedSources,
  isCompanyKind,
  sourceKindLabel,
  sourceKindOf,
  type SourceKind,
} from "@/lib/companySources";
import { cn } from "@/lib/utils";

const emptyDraft = {
  company: "",
  kind: "company" as SourceKind,
  collect_cn: false,
  collect_en: true,
  enabled: true,
  include_in_run: false,
  tags: "",
  note: "",
  handle: "",
  careers_url: "",
};

export function CompanySourcesPage() {
  const [rows, setRows] = useState<CompanySource[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tag, setTag] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(emptyDraft);

  async function refresh() {
    const listed = await getCompanySources();
    setRows(listed.sources);
    setAllTags(listed.tags);
    setLoaded(true);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const visible = useMemo(
    () => filterManagedSources(rows, { type: typeFilter, tag }),
    [rows, typeFilter, tag],
  );

  async function save(id: string, body: Partial<CompanySource>) {
    const updated = await patchCompanySource(id, body);
    if (!updated) {
      setMessage("Couldn't save this source.");
      return;
    }
    setRows((current) => current.map((row) => (row.id === id ? updated : row)));
  }

  async function addSource() {
    if (!draft.company.trim()) return;
    if (draft.kind === "company" && !draft.collect_cn && !draft.collect_en) return;
    const created = await createCompanySource({
      company: draft.company,
      kind: draft.kind,
      handle: draft.handle,
      collect_cn: draft.kind === "company" ? draft.collect_cn : false,
      collect_en: draft.kind === "company" ? draft.collect_en : false,
      enabled: draft.enabled,
      include_in_run: draft.include_in_run,
      tags: draft.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      note: draft.note,
      careers_url: draft.kind === "company" ? draft.careers_url : "",
    });
    if (!created) {
      setMessage("Couldn't add this source. Check the name and type.");
      return;
    }
    setDraft(emptyDraft);
    setAdding(false);
    await refresh();
  }

  if (!loaded) {
    return <div className="mx-auto max-w-5xl px-5 py-16 text-sm text-muted">Loading sources…</div>;
  }

  const companyDraft = draft.kind === "company";

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand">Collect</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{MANAGE_SOURCES_COPY.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">{MANAGE_SOURCES_COPY.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/search" className="inline-flex h-10 items-center rounded-lg border border-line px-3 text-sm text-ink">
            Back to Collect
          </Link>
          <Button type="button" onClick={() => setAdding((value) => !value)}>
            {MANAGE_SOURCES_COPY.add}
          </Button>
        </div>
      </header>

      {adding && (
        <form
          className="space-y-3 rounded-2xl border border-line bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void addSource();
          }}
        >
          <Input
            value={draft.company}
            onChange={(event) => setDraft((current) => ({ ...current, company: event.target.value }))}
            placeholder={MANAGE_SOURCES_COPY.name}
            required
          />
          <label className="block text-sm text-ink">
            {MANAGE_SOURCES_COPY.type}
            <select
              value={draft.kind}
              onChange={(event) =>
                setDraft((current) => ({ ...current, kind: event.target.value as SourceKind }))
              }
              className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm"
            >
              {SOURCE_KINDS.map((item) => (
                <option key={item} value={item}>
                  {sourceKindLabel(item)}
                </option>
              ))}
            </select>
          </label>
          {companyDraft ? (
            <>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.collect_cn}
                    onChange={(event) => setDraft((current) => ({ ...current, collect_cn: event.target.checked }))}
                  />
                  {MANAGE_SOURCES_COPY.cn}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.collect_en}
                    onChange={(event) => setDraft((current) => ({ ...current, collect_en: event.target.checked }))}
                  />
                  {MANAGE_SOURCES_COPY.en}
                </label>
              </div>
              <Input
                value={draft.careers_url}
                onChange={(event) => setDraft((current) => ({ ...current, careers_url: event.target.value }))}
                placeholder={MANAGE_SOURCES_COPY.careersUrl}
              />
              <p className="text-[11px] text-muted">{MANAGE_SOURCES_COPY.careersHint}</p>
            </>
          ) : (
            <Input
              value={draft.handle}
              onChange={(event) => setDraft((current) => ({ ...current, handle: event.target.value }))}
              placeholder={MANAGE_SOURCES_COPY.handle}
            />
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
              />
              {MANAGE_SOURCES_COPY.enabled}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.include_in_run}
                onChange={(event) => setDraft((current) => ({ ...current, include_in_run: event.target.checked }))}
              />
              {MANAGE_SOURCES_COPY.thisRun}
            </label>
          </div>
          <Input
            value={draft.tags}
            onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
            placeholder="Tags — comma-separated"
          />
          <Input
            value={draft.note}
            onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
            placeholder={MANAGE_SOURCES_COPY.notePlaceholder}
          />
          <Button type="submit" disabled={!draft.company.trim() || (companyDraft && !draft.collect_cn && !draft.collect_en)}>
            Save source
          </Button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">{MANAGE_SOURCES_COPY.typeFilter}</span>
        <FilterChip label="All" active={typeFilter === ""} onClick={() => setTypeFilter("")} />
        {SOURCE_KINDS.map((item) => (
          <FilterChip
            key={item}
            label={sourceKindLabel(item)}
            active={typeFilter === item}
            onClick={() => setTypeFilter(item === typeFilter ? "" : item)}
          />
        ))}
      </div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">{MANAGE_SOURCES_COPY.tagFilter}</span>
          <FilterChip label="All" active={tag === ""} onClick={() => setTag("")} />
          {allTags.map((item) => (
            <FilterChip
              key={item}
              label={item}
              active={tag === item}
              onClick={() => setTag(item === tag ? "" : item)}
            />
          ))}
        </div>
      )}
      {message && <p className="text-sm text-amber-700">{message}</p>}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{MANAGE_SOURCES_COPY.name}</th>
              <th className="px-3 py-2 font-medium">{MANAGE_SOURCES_COPY.type}</th>
              <th className="px-3 py-2 font-medium">{MANAGE_SOURCES_COPY.cn}</th>
              <th className="px-3 py-2 font-medium">{MANAGE_SOURCES_COPY.en}</th>
              <th className="px-3 py-2 font-medium">{MANAGE_SOURCES_COPY.enabled}</th>
              <th className="px-3 py-2 font-medium">{MANAGE_SOURCES_COPY.thisRun}</th>
              <th className="px-3 py-2 font-medium">{MANAGE_SOURCES_COPY.handle}</th>
              <th className="px-3 py-2 font-medium">{MANAGE_SOURCES_COPY.tags}</th>
              <th className="px-3 py-2 font-medium">{MANAGE_SOURCES_COPY.note}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const company = isCompanyKind(row);
              const kind = sourceKindOf(row);
              return (
                <tr key={row.id} className="border-b border-line/70 last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{row.company || row.name}</div>
                    {!company && (
                      <div className="text-[11px] text-muted">{MANAGE_SOURCES_COPY.notRunnable}</div>
                    )}
                    {company && row.runnable === false && (
                      <div className="text-[11px] text-muted">{MANAGE_SOURCES_COPY.notRunnable}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={kind}
                      aria-label={`${row.company || row.name} type`}
                      className="h-8 rounded-md border border-line bg-bg px-2 text-xs"
                      onChange={(event) => save(row.id, { kind: event.target.value as SourceKind })}
                    >
                      {SOURCE_KINDS.map((item) => (
                        <option key={item} value={item}>
                          {sourceKindLabel(item)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {company ? (
                      <input
                        type="checkbox"
                        checked={row.collect_cn}
                        aria-label={`${row.company} CN`}
                        onChange={(event) => {
                          const collect_cn = event.target.checked;
                          const collect_en = collect_cn || row.collect_en ? row.collect_en : true;
                          void save(row.id, { collect_cn, collect_en });
                        }}
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {company ? (
                      <input
                        type="checkbox"
                        checked={row.collect_en}
                        aria-label={`${row.company} EN`}
                        onChange={(event) => {
                          const collect_en = event.target.checked;
                          const collect_cn = collect_en || row.collect_cn ? row.collect_cn : true;
                          void save(row.id, { collect_cn, collect_en });
                        }}
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      aria-label={`${row.company || row.name} enabled`}
                      onChange={(event) => void save(row.id, { enabled: event.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={row.include_in_run}
                      disabled={!row.enabled || (company && row.runnable === false)}
                      aria-label={`${row.company || row.name} this run`}
                      onChange={(event) => void save(row.id, { include_in_run: event.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={company ? row.careers_url ?? "" : row.handle ?? ""}
                      aria-label={`${row.company || row.name} handle`}
                      className="h-8 w-40 rounded-md border border-line bg-bg px-2 text-xs"
                      onBlur={(event) => {
                        if (company) void save(row.id, { careers_url: event.target.value });
                        else void save(row.id, { handle: event.target.value });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={row.tags.join(", ")}
                      aria-label={`${row.company || row.name} tags`}
                      className="h-8 w-36 rounded-md border border-line bg-bg px-2 text-xs"
                      onBlur={(event) => {
                        const next = event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
                        void save(row.id, { tags: next });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={row.note}
                      aria-label={`${row.company || row.name} note`}
                      className="h-8 w-48 rounded-md border border-line bg-bg px-2 text-xs"
                      onBlur={(event) => void save(row.id, { note: event.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted">{MANAGE_SOURCES_COPY.empty}</p>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs",
        active ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}
