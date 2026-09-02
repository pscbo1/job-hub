"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCompanySource,
  createVerticalChannel,
  getCompanySources,
  getVerticalChannels,
  patchCompanySource,
  patchVerticalChannel,
  type CompanySource,
  type VerticalChannel,
} from "@/lib/api";
import {
  COMPANY_SOURCES_COPY,
  MANAGE_SOURCES_COPY,
  VERTICAL_CHANNEL_TYPES,
  VERTICAL_CHANNELS_COPY,
  filterCompanySources,
  filterVerticalChannels,
  verticalTypeLabel,
  type SourceClassTab,
} from "@/lib/companySources";
import { cn } from "@/lib/utils";

export function CompanySourcesPage() {
  const [tab, setTab] = useState<SourceClassTab>("companies");
  const [rows, setRows] = useState<CompanySource[]>([]);
  const [channels, setChannels] = useState<VerticalChannel[]>([]);
  const [companyTags, setCompanyTags] = useState<string[]>([]);
  const [verticalTags, setVerticalTags] = useState<string[]>([]);
  const [tag, setTag] = useState("");
  const [channelType, setChannelType] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
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
  const [channelDraft, setChannelDraft] = useState({
    name: "",
    channel_type: "wechat",
    handle: "",
    enabled: true,
    tags: "",
    note: "",
  });

  async function refresh() {
    const [companies, verticals] = await Promise.all([getCompanySources(), getVerticalChannels()]);
    setRows(companies.sources);
    setCompanyTags(companies.tags);
    setChannels(verticals.channels);
    setVerticalTags(verticals.tags);
    setLoaded(true);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const visibleCompanies = useMemo(() => filterCompanySources(rows, tag), [rows, tag]);
  const visibleChannels = useMemo(
    () => filterVerticalChannels(channels, { type: channelType, tag }),
    [channels, channelType, tag],
  );

  async function saveCompany(id: string, body: Partial<CompanySource>) {
    const updated = await patchCompanySource(id, body);
    if (!updated) {
      setMessage("Couldn't save this company.");
      return;
    }
    setRows((current) => current.map((row) => (row.id === id ? updated : row)));
  }

  async function saveChannel(id: string, body: Partial<VerticalChannel>) {
    const updated = await patchVerticalChannel(id, body);
    if (!updated) {
      setMessage("Couldn't save this channel.");
      return;
    }
    setChannels((current) => current.map((row) => (row.id === id ? updated : row)));
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

  async function addChannel() {
    if (!channelDraft.name.trim()) return;
    const created = await createVerticalChannel({
      name: channelDraft.name,
      channel_type: channelDraft.channel_type,
      handle: channelDraft.handle,
      enabled: channelDraft.enabled,
      tags: channelDraft.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      note: channelDraft.note,
    });
    if (!created) {
      setMessage("Couldn't add this channel.");
      return;
    }
    setChannelDraft({
      name: "",
      channel_type: "wechat",
      handle: "",
      enabled: true,
      tags: "",
      note: "",
    });
    setAdding(false);
    await refresh();
  }

  function selectTab(next: SourceClassTab) {
    setTab(next);
    setAdding(false);
    setTag("");
    setChannelType("");
    setMessage("");
  }

  if (!loaded) {
    return <div className="mx-auto max-w-5xl px-5 py-16 text-sm text-muted">Loading sources…</div>;
  }

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
            {tab === "companies" ? COMPANY_SOURCES_COPY.add : VERTICAL_CHANNELS_COPY.add}
          </Button>
        </div>
      </header>

      <div className="flex gap-1 border-b border-line" role="tablist" aria-label="Source classes">
        {(["companies", "verticals"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => selectTab(item)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium",
              tab === item ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {item === "companies" ? MANAGE_SOURCES_COPY.companiesTab : MANAGE_SOURCES_COPY.verticalsTab}
          </button>
        ))}
      </div>

      {tab === "companies" ? (
        <CompaniesClass
          adding={adding}
          draft={draft}
          setDraft={setDraft}
          onAdd={() => void addCompany()}
          tags={companyTags}
          tag={tag}
          setTag={setTag}
          message={message}
          visible={visibleCompanies}
          onSave={saveCompany}
        />
      ) : (
        <VerticalsClass
          adding={adding}
          draft={channelDraft}
          setDraft={setChannelDraft}
          onAdd={() => void addChannel()}
          tags={verticalTags}
          tag={tag}
          setTag={setTag}
          channelType={channelType}
          setChannelType={setChannelType}
          message={message}
          visible={visibleChannels}
          onSave={saveChannel}
        />
      )}
    </div>
  );
}

function CompaniesClass({
  adding,
  draft,
  setDraft,
  onAdd,
  tags,
  tag,
  setTag,
  message,
  visible,
  onSave,
}: {
  adding: boolean;
  draft: {
    company: string;
    collect_cn: boolean;
    collect_en: boolean;
    enabled: boolean;
    include_in_run: boolean;
    tags: string;
    note: string;
    careers_url: string;
  };
  setDraft: React.Dispatch<React.SetStateAction<typeof draft>>;
  onAdd: () => void;
  tags: string[];
  tag: string;
  setTag: (value: string) => void;
  message: string;
  visible: CompanySource[];
  onSave: (id: string, body: Partial<CompanySource>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{COMPANY_SOURCES_COPY.subtitle}</p>
      {adding && (
        <form
          className="space-y-3 rounded-2xl border border-line bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd();
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
      <TagFilter tags={tags} tag={tag} setTag={setTag} label={COMPANY_SOURCES_COPY.tagFilter} />
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
                      onSave(row.id, { collect_cn, collect_en });
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
                      onSave(row.id, { collect_cn, collect_en });
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    aria-label={`${row.company} enabled`}
                    onChange={(event) => onSave(row.id, { enabled: event.target.checked })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.include_in_run}
                    disabled={!row.enabled || row.runnable === false}
                    aria-label={`${row.company} this run`}
                    onChange={(event) => onSave(row.id, { include_in_run: event.target.checked })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={row.tags.join(", ")}
                    aria-label={`${row.company} tags`}
                    className="h-8 w-36 rounded-md border border-line bg-bg px-2 text-xs"
                    onBlur={(event) => {
                      const next = event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
                      onSave(row.id, { tags: next });
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={row.note}
                    aria-label={`${row.company} note`}
                    placeholder={COMPANY_SOURCES_COPY.notePlaceholder}
                    className="h-8 w-48 rounded-md border border-line bg-bg px-2 text-xs"
                    onBlur={(event) => onSave(row.id, { note: event.target.value })}
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

function VerticalsClass({
  adding,
  draft,
  setDraft,
  onAdd,
  tags,
  tag,
  setTag,
  channelType,
  setChannelType,
  message,
  visible,
  onSave,
}: {
  adding: boolean;
  draft: {
    name: string;
    channel_type: string;
    handle: string;
    enabled: boolean;
    tags: string;
    note: string;
  };
  setDraft: React.Dispatch<React.SetStateAction<typeof draft>>;
  onAdd: () => void;
  tags: string[];
  tag: string;
  setTag: (value: string) => void;
  channelType: string;
  setChannelType: (value: string) => void;
  message: string;
  visible: VerticalChannel[];
  onSave: (id: string, body: Partial<VerticalChannel>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{VERTICAL_CHANNELS_COPY.subtitle}</p>
      {adding && (
        <form
          className="space-y-3 rounded-2xl border border-line bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd();
          }}
        >
          <Input
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder={VERTICAL_CHANNELS_COPY.name}
            required
          />
          <label className="block text-sm text-ink">
            {VERTICAL_CHANNELS_COPY.type}
            <select
              value={draft.channel_type}
              onChange={(event) => setDraft((current) => ({ ...current, channel_type: event.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm"
            >
              {VERTICAL_CHANNEL_TYPES.map((item) => (
                <option key={item} value={item}>
                  {verticalTypeLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <Input
            value={draft.handle}
            onChange={(event) => setDraft((current) => ({ ...current, handle: event.target.value }))}
            placeholder={VERTICAL_CHANNELS_COPY.handle}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
            />
            {VERTICAL_CHANNELS_COPY.enabled}
          </label>
          <Input
            value={draft.tags}
            onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
            placeholder="Tags — comma-separated"
          />
          <Input
            value={draft.note}
            onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
            placeholder={VERTICAL_CHANNELS_COPY.notePlaceholder}
          />
          <Button type="submit" disabled={!draft.name.trim()}>
            Save channel
          </Button>
        </form>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">{VERTICAL_CHANNELS_COPY.typeFilter}</span>
        <button
          type="button"
          onClick={() => setChannelType("")}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs",
            channelType === "" ? "border-brand bg-brand/10 text-brand" : "border-line text-muted",
          )}
        >
          All
        </button>
        {VERTICAL_CHANNEL_TYPES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setChannelType(item === channelType ? "" : item)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs",
              channelType === item ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-ink",
            )}
          >
            {verticalTypeLabel(item)}
          </button>
        ))}
      </div>
      <TagFilter tags={tags} tag={tag} setTag={setTag} label={VERTICAL_CHANNELS_COPY.tagFilter} />
      {message && <p className="text-sm text-amber-700">{message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{VERTICAL_CHANNELS_COPY.name}</th>
              <th className="px-3 py-2 font-medium">{VERTICAL_CHANNELS_COPY.type}</th>
              <th className="px-3 py-2 font-medium">{VERTICAL_CHANNELS_COPY.handle}</th>
              <th className="px-3 py-2 font-medium">{VERTICAL_CHANNELS_COPY.enabled}</th>
              <th className="px-3 py-2 font-medium">{VERTICAL_CHANNELS_COPY.tags}</th>
              <th className="px-3 py-2 font-medium">{VERTICAL_CHANNELS_COPY.note}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-b border-line/70 last:border-0">
                <td className="px-3 py-2 font-medium text-ink">{row.name}</td>
                <td className="px-3 py-2">
                  <select
                    value={row.channel_type}
                    aria-label={`${row.name} type`}
                    className="h-8 rounded-md border border-line bg-bg px-2 text-xs"
                    onChange={(event) => onSave(row.id, { channel_type: event.target.value })}
                  >
                    {VERTICAL_CHANNEL_TYPES.map((item) => (
                      <option key={item} value={item}>
                        {verticalTypeLabel(item)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={row.handle}
                    aria-label={`${row.name} handle`}
                    className="h-8 w-40 rounded-md border border-line bg-bg px-2 text-xs"
                    onBlur={(event) => onSave(row.id, { handle: event.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    aria-label={`${row.name} enabled`}
                    onChange={(event) => onSave(row.id, { enabled: event.target.checked })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={row.tags.join(", ")}
                    aria-label={`${row.name} tags`}
                    className="h-8 w-36 rounded-md border border-line bg-bg px-2 text-xs"
                    onBlur={(event) => {
                      const next = event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
                      onSave(row.id, { tags: next });
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={row.note}
                    aria-label={`${row.name} note`}
                    className="h-8 w-48 rounded-md border border-line bg-bg px-2 text-xs"
                    onBlur={(event) => onSave(row.id, { note: event.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted">{VERTICAL_CHANNELS_COPY.empty}</p>
        )}
      </div>
    </div>
  );
}

function TagFilter({
  tags,
  tag,
  setTag,
  label,
}: {
  tags: string[];
  tag: string;
  setTag: (value: string) => void;
  label: string;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted">{label}</span>
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
  );
}
