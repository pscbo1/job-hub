"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createNotebookPage,
  deleteNotebookPage,
  getNotebookPages,
  patchNotebookPage,
  type NotebookPage,
} from "@/lib/api";
import { NOTEBOOK_COPY, uniqueNotebookTopics } from "@/lib/notebook";
import { formatDateTimeInAppTz } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export function NotebookWorkspace() {
  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [sort, setSort] = useState<"updated" | "title">("updated");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const active = pages.find((page) => page.id === activeId) ?? null;

  async function refresh(selectId?: string) {
    const data = await getNotebookPages({ q: query, topic, sort });
    setPages(data.pages);
    setTopics(data.topics);
    const nextId = selectId ?? data.pages.find((page) => page.id === activeId)?.id ?? data.pages[0]?.id ?? null;
    setActiveId(nextId);
    setLoaded(true);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when search/sort/topic change
  }, [query, topic, sort]);

  const allTopics = useMemo(() => uniqueNotebookTopics(pages).length ? topics : uniqueNotebookTopics(pages), [pages, topics]);

  async function newPage() {
    const created = await createNotebookPage({ title: NOTEBOOK_COPY.untitled, markdown_body: "" });
    if (!created) return;
    await refresh(created.id);
  }

  async function save(partial: { title?: string; markdown_body?: string }) {
    if (!active) return;
    setSaving(true);
    const updated = await patchNotebookPage(active.id, partial);
    setSaving(false);
    if (!updated) return;
    setPages((current) => current.map((page) => (page.id === updated.id ? updated : page)));
    if (updated.topics.length) {
      setTopics((current) => [...new Set([...current, ...updated.topics])]);
    }
  }

  async function remove() {
    if (!active) return;
    const ok = await deleteNotebookPage(active.id);
    if (!ok) return;
    const remaining = pages.filter((page) => page.id !== active.id);
    setPages(remaining);
    setActiveId(remaining[0]?.id ?? null);
  }

  if (!loaded) {
    return <div className="mx-auto max-w-6xl px-5 py-16 text-sm text-muted">Loading notebook…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand">More</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{NOTEBOOK_COPY.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">{NOTEBOOK_COPY.subtitle}</p>
        </div>
        <Button type="button" onClick={() => void newPage()}>
          {NOTEBOOK_COPY.newPage}
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-line bg-surface p-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={NOTEBOOK_COPY.search}
            className="h-9"
          />
          <div className="mt-2 flex gap-1">
            {(["updated", "title"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSort(item)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px]",
                  sort === item ? "border-brand bg-brand/10 text-brand" : "border-line text-muted",
                )}
              >
                {item === "updated" ? NOTEBOOK_COPY.sortUpdated : NOTEBOOK_COPY.sortTitle}
              </button>
            ))}
          </div>
          {allTopics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {allTopics.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTopic(item === topic ? "" : item)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px]",
                    topic === item ? "border-brand bg-brand/10 text-brand" : "border-line text-muted",
                  )}
                >
                  #{item}
                </button>
              ))}
            </div>
          )}
          <ul className="mt-3 space-y-1">
            {pages.map((page) => (
              <li key={page.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(page.id)}
                  className={cn(
                    "w-full rounded-lg px-2 py-2 text-left",
                    page.id === activeId ? "bg-ink/[0.06]" : "hover:bg-ink/[0.04]",
                  )}
                >
                  <span className="block truncate text-sm font-medium text-ink">{page.title || NOTEBOOK_COPY.untitled}</span>
                  <span className="block text-[11px] text-muted">{formatDateTimeInAppTz(page.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
          {pages.length === 0 && (
            <p className="mt-6 text-center text-xs text-muted">
              {query || topic ? NOTEBOOK_COPY.emptySearch : NOTEBOOK_COPY.empty}
            </p>
          )}
        </aside>

        <section className="min-h-[28rem] rounded-2xl border border-line bg-surface p-4">
          {active ? (
            <div className="flex h-full flex-col gap-3">
              <div className="flex items-center gap-2">
                <Input
                  key={active.id}
                  defaultValue={active.title}
                  onBlur={(event) => void save({ title: event.target.value })}
                  className="text-lg font-semibold"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => void remove()}>
                  {NOTEBOOK_COPY.delete}
                </Button>
              </div>
              {active.topics.length > 0 && (
                <p className="text-xs text-muted">{active.topics.map((item) => `#${item}`).join("  ")}</p>
              )}
              <Textarea
                key={`${active.id}-body`}
                defaultValue={active.markdown_body}
                onBlur={(event) => void save({ markdown_body: event.target.value })}
                placeholder={NOTEBOOK_COPY.editorPlaceholder}
                className="min-h-[24rem] flex-1 font-mono text-sm"
              />
              <p className="text-[11px] text-muted">{saving ? "Saving…" : "Saved when you leave the field."}</p>
            </div>
          ) : (
            <p className="py-20 text-center text-sm text-muted">{NOTEBOOK_COPY.empty}</p>
          )}
        </section>
      </div>
    </div>
  );
}