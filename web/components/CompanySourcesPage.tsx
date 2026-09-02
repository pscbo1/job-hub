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
import { COMPANY_SOURCES_COPY, filterCompanySources } from "@/lib/companySources";
import { cn } from "@/lib/utils";

export function CompanySourcesPage() {
  const [rows, setRows] = useState<CompanySource[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tag, setTag] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    company: "",
    collect_cn: false,
    collect_en: true,
    enabled: true,
    include_in_run: false,
    tags: "",
    note: "",
    careers_url: "",
  });
  const [message, setMessage] = useState("");

  async function refresh() {
    const data = await getCompanySources();
    setRows(data.sources);
    setTags(data.tags);
    setLoaded(true);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const visible = useMemo(() => filterCompanySources(rows, tag), [rows, tag]);

  async function saveRow(id: string, body: Partial<CompanySource>) {
    const updated = await patchCompanySource(id, body);
    if (!updated) {
      setMessage("Couldn't save this company.");
      return;
    }
    setRows((current) => current.map((row) => (row.id === id ? updated : row)));
    setTags((current) => {
      const next = new Set(current);
      for (const item of updated.tags) next.add(item);
      return [...next];
    });
  }

  async function addCompany() {
    if (!draft.company.trim() || (!draft.collect_cn && !draft.collect_en)) return;
    const created = await createCompanySource({
      company: draft.company,
      collect_cn: draft.collect_cn,
      collect_en: draft.collect_en,
      enabled: draft.enabled,
      include_in_run: draft.include_in_run,
      tags: draft.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      note: draft.note,
      careers_url: draft.careers_url,
    });
    if (!created) {
      setMessage("Couldn't add this company. Check the name and careers URL.");
      return;
    }
    setDraft({
      company: "",
      collect_cn: false,
      collect_en: true,
      enabled: true,
      include_in_run: false,
      tags: "",
      note: "",
      careers_url: "",
    });
    setAdding(false);
    await refresh();
  }

  if (!loaded) {
    return <div className="mx-auto max-w-5xl px-5 py-16 text-sm text-muted">Loading companies…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand">Collect</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{COMPANY_SOURCES_COPY.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">{COMPANY_SOURCES_COPY.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/search" className="inline-flex h-10 items-center rounded-lg border border-line px-3 text-sm text-ink">
            Back to Collect
          </Link>
          <Button type="button" onClick={() => setAdding((value) => !value)}>
            {COMPANY_SOURCES_COPY.add}
          </Button>
        </div>
      </header>

      {adding && (
        <form
          className="space-y-3 rounded-2xl border border-line bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void addCompany();
          }}
        >
          <Input
            value={draft.company}
            onChange={(event) => setDraft((current) => ({ ...current, company: event.target.value }))}
            placeholder={COMPANY_SOURCES_COPY.company}
            required
          />
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.collect_cn}
                onChange={(event) => setDraft((current) => ({ ...current, collect_cn: event.target.checked }))}
              />
              {COMPANY_SOURCES_COPY.cn}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.collect_en}
                onChange={(event) => setDraft((current) => ({ ...current, collect_en: event.target.checked }))}
              />
              {COMPANY_SOURCES_COPY.en}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
              />
              {COMPANY_SOURCES_COPY.enabled}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.include_in_run}
                onChange={(event) => setDraft((current) => ({ ...current, include_in_run: event.target.checked }))}
              />
              {COMPANY_SOURCES_COPY.thisRun}
            </label>
          </div>
          <Input
            value={draft.tags}
            onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
            placeholder="Tags — comma-separated, like application direction tags"
          />
          <Input
            value={draft.note}
            onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
            placeholder={COMPANY_SOURCES_COPY.notePlaceholder}
          />
          <Input
            value={draft.careers_url}
            onChange={(event) => setDraft((current) => ({ ...current, careers_url: event.target.value }))}
            placeholder={COMPANY_SOURCES_COPY.careersUrl}
          />
          <p className="text-[11px] text-muted">{COMPANY_SOURCES_COPY.careersHint}</p>
          <Button type="submit" disabled={!draft.company.trim() || (!draft.collect_cn && !draft.collect_en)}>
            Save company
          </Button>
        </form>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">{COMPANY_SOURCES_COPY.tagFilter}</span>
          <button
            type="button"
            onClick={() => setTag("")}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs",
              tag === "" ? "border-brand bg-brand/10 text-brand" : "border-line text-muted",
            )}
          >
            All
          </button>
          {tags.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTag(item === tag ? "" : item)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                tag === item ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-ink",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {message && <p className="text-sm text-amber-700">{message}</p>}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{COMPANY_SOURCES_COPY.company}</th>
              <th className="px-3 py-2 font-medium">{COMPANY_SOURCES_COPY.cn}</th>
              <th className="px-3 py-2 font-medium">{COMPANY_SOURCES_COPY.en}</th>
              <th className="px-3 py-2 font-medium">{COMPANY_SOURCES_COPY.enabled}</th>
              <th className="px-3 py-2 font-medium">{COMPANY_SOURCES_COPY.thisRun}</th>
              <th className="px-3 py-2 font-medium">{COMPANY_SOURCES_COPY.tags}</th>
              <th className="px-3 py-2 font-medium">{COMPANY_SOURCES_COPY.note}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-b border-line/70 last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium text-ink">{row.company}</div>
                  {!row.runnable && (
                    <div className="text-[11px] text-muted">{COMPANY_SOURCES_COPY.notRunnable}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.collect_cn}
                    aria-label={`${row.company} CN`}
                    onChange={(event) => {
                      const collect_cn = event.target.checked;
                      const collect_en = collect_cn || row.collect_en ? row.collect_en : true;
                      void saveRow(row.id, { collect_cn, collect_en });
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.collect_en}
                    aria-label={`${row.company} EN`}
                    onChange={(event) => {
                      const collect_en = event.target.checked;
                      const collect_cn = collect_en || row.collect_cn ? row.collect_cn : true;
                      void saveRow(row.id, { collect_cn, collect_en });
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    aria-label={`${row.company} enabled`}
                    onChange={(event) => void saveRow(row.id, { enabled: event.target.checked })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.include_in_run}
                    disabled={!row.enabled || row.runnable === false}
                    aria-label={`${row.company} this run`}
                    onChange={(event) => void saveRow(row.id, { include_in_run: event.target.checked })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={row.tags.join(", ")}
                    aria-label={`${row.company} tags`}
                    className="h-8 w-36 rounded-md border border-line bg-bg px-2 text-xs"
                    onBlur={(event) => {
                      const next = event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
                      void saveRow(row.id, { tags: next });
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={row.note}
                    aria-label={`${row.company} note`}
                    placeholder={COMPANY_SOURCES_COPY.notePlaceholder}
                    className="h-8 w-48 rounded-md border border-line bg-bg px-2 text-xs"
                    onBlur={(event) => void saveRow(row.id, { note: event.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted">{COMPANY_SOURCES_COPY.empty}</p>
        )}
      </div>
    </div>
  );
}