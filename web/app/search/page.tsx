"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { LocalSetupGuide } from "@/components/LocalSetupGuide";
import { Button } from "@/components/ui/button";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  collectJobs,
  getCollectSources,
  type CollectOutcome,
  type CollectSource,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SearchPage() {
  const [apiDown, setApiDown] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [catalog, setCatalog] = useState<CollectSource[]>([]);
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["zhaopin", "liepin"]));
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<CollectOutcome | null>(null);
  const [message, setMessage] = useState("");
  const keywordsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        keywordsRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    getCollectSources()
      .then((r) => {
        if (r === null) {
          setApiDown(true);
          return;
        }
        const list = r.sources ?? [];
        setCatalog(list);
        const ids = list.map((s) => s.id);
        setSelected((prev) => {
          const next = new Set([...prev].filter((id) => ids.includes(id)));
          if (next.size === 0 && ids[0]) next.add(ids[0]);
          return next;
        });
      })
      .catch(() => setApiDown(true))
      .finally(() => setLoaded(true));
  }, []);

  function toggleSource(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runCollect() {
    const kw = keywords.trim();
    if (!kw || selected.size === 0) return;
    setRunning(true);
    setMessage("");
    setOutcome(null);
    const r = await collectJobs({
      keywords: kw,
      location: location.trim(),
      sources: [...selected],
    });
    setRunning(false);
    if (r === null) {
      setMessage("Couldn't reach the local API. Run `job-sentinel serve`.");
      return;
    }
    setOutcome(r);
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20 text-center text-muted">Loading sources…</div>
    );
  }
  if (apiDown) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <LocalSetupGuide context="Job collection" />
      </div>
    );
  }

  const canRun = Boolean(keywords.trim()) && selected.size > 0 && !running;
  const poolHref = outcome?.since
    ? `/jobs?range=custom&since=${encodeURIComponent(outcome.since)}`
    : "/jobs?range=7d";

  return (
    <div className="mx-auto max-w-xl px-5 py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Search</h1>
        <p className="mt-1 text-sm text-muted">
          Collect new jobs from external sources into Job Pool. Browse and filter collected jobs
          on Job Pool — this page does not search the local pool.
        </p>
      </header>

      <Card className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runCollect();
          }}
          className="space-y-3"
        >
          <div className="relative">
            <Input
              ref={keywordsRef}
              placeholder="Keywords — press / to focus"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              required
            />
            {!keywords && (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-surface px-1.5 font-mono text-[10px] text-muted">
                /
              </kbd>
            )}
          </div>
          <Input
            placeholder="Location (optional city)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {catalog.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSource(s.id)}
                  title={s.notes || undefined}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    selected.has(s.id)
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-line text-muted hover:text-ink",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {catalog.some((s) => s.id === "boss") && (
              <p className="mt-2 text-[11px] text-muted">
                Boss uses the existing local Chrome login. Leave it off unless that profile is
                already signed in.
              </p>
            )}
          </div>

          {selected.size === 0 && (
            <p className="text-xs text-amber-600">Select at least one source.</p>
          )}

          <Button type="submit" disabled={!canRun} className="w-full">
            {running ? "Collecting…" : "Collect Jobs"}
          </Button>
        </form>
      </Card>

      {message && <p className="mt-4 text-sm text-amber-600">{message}</p>}

      {running && !outcome && (
        <Card className="mt-4">
          <CardSub>Running mcp-jobs, then writing jobs_raw → jobs. This can take a few minutes.</CardSub>
        </Card>
      )}

      {outcome && <CollectResultCard outcome={outcome} poolHref={poolHref} />}
    </div>
  );
}

function CollectResultCard({
  outcome,
  poolHref,
}: {
  outcome: CollectOutcome;
  poolHref: string;
}) {
  const tone =
    outcome.status === "completed"
      ? "text-emerald-700"
      : outcome.status === "partial"
        ? "text-amber-700"
        : "text-red-700";
  const label =
    outcome.status === "completed"
      ? "Collection completed"
      : outcome.status === "partial"
        ? "Collection completed with source failures"
        : "Collection failed";

  return (
    <Card className="mt-4 space-y-3">
      <CardTitle className={tone}>{label}</CardTitle>
      {outcome.message && outcome.message !== label && (
        <CardSub>{outcome.message}</CardSub>
      )}
      <ul className="space-y-1 text-sm text-ink">
        <li>New jobs added: {outcome.jobs_created}</li>
        <li>Updated existing jobs: {outcome.jobs_updated}</li>
        <li>Raw records stored: {outcome.raw_inserted}</li>
      </ul>
      {outcome.source_results.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {outcome.source_results.map((s) => (
            <span key={String(s.name)}>
              {String(s.name)} {s.succeeded ? `${s.jobCount ?? 0}` : "failed"}
            </span>
          ))}
        </div>
      )}
      {outcome.errors.length > 0 && (
        <p className="text-xs text-amber-700">{outcome.errors.slice(0, 4).join(" · ")}</p>
      )}
      <Link href={poolHref} className="inline-block text-sm font-medium text-brand hover:underline">
        Open Job Pool
      </Link>
    </Card>
  );
}
