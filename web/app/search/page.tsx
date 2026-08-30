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
  getFilterSettings,
  saveFilterSettings,
  type CollectOutcome,
  type CollectSource,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const SOURCE_STORAGE_KEY = "job-hub.collect.sources";
const MAX_STORAGE_KEY = "job-hub.collect.maxResults";
const MAX_PRESETS = [50, 100, 200];
const DEFAULT_SOURCES = ["zhaopin", "liepin"];

function loadJsonList(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

function loadMaxResults(): number {
  try {
    const raw = localStorage.getItem(MAX_STORAGE_KEY);
    const n = raw ? Number(raw) : 100;
    if (Number.isFinite(n) && n >= 1 && n <= 200) return Math.round(n);
  } catch {
    /* ignore */
  }
  return 100;
}

export default function SearchPage() {
  const [apiDown, setApiDown] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [catalog, setCatalog] = useState<CollectSource[]>([]);
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [maxResults, setMaxResults] = useState(100);
  const [excludeOutsourcing, setExcludeOutsourcing] = useState(true);
  const [excludePartTime, setExcludePartTime] = useState(true);
  const [excludeInternship, setExcludeInternship] = useState(true);
  const [customKeywords, setCustomKeywords] = useState("");
  const [excludedCompanies, setExcludedCompanies] = useState("");
  const [running, setRunning] = useState(false);
  const [refiltering, setRefiltering] = useState(false);
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
    Promise.all([getCollectSources(), getFilterSettings()])
      .then(([sourcesResp, filters]) => {
        if (sourcesResp === null) {
          setApiDown(true);
          return;
        }
        const list = (sourcesResp.sources ?? []).filter((s) => s.enabled);
        setCatalog(list);
        const ids = list.map((s) => s.id);
        const remembered = loadJsonList(SOURCE_STORAGE_KEY);
        const initial = (remembered ?? DEFAULT_SOURCES).filter((id) => ids.includes(id));
        setSelected(new Set(initial));
        setMaxResults(loadMaxResults());
        if (filters) {
          setExcludeOutsourcing(filters.exclude_outsourcing);
          setExcludePartTime(filters.exclude_part_time);
          setExcludeInternship(filters.exclude_internship);
          setCustomKeywords(filters.custom_keywords.join("\n"));
          setExcludedCompanies(filters.excluded_companies.join("\n"));
        }
      })
      .catch(() => setApiDown(true))
      .finally(() => setLoaded(true));
  }, []);

  function persistSources(next: Set<string>) {
    try {
      localStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore quota */
    }
  }

  function toggleSource(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistSources(next);
      return next;
    });
  }

  function changeMaxResults(value: string) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const capped = Math.min(200, Math.max(1, Math.round(n)));
    setMaxResults(capped);
    try {
      localStorage.setItem(MAX_STORAGE_KEY, String(capped));
    } catch {
      /* ignore */
    }
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
      max_results: maxResults,
      exclude_outsourcing: excludeOutsourcing,
      exclude_part_time: excludePartTime,
      exclude_internship: excludeInternship,
      custom_keywords: customKeywords,
      excluded_companies: excludedCompanies,
    });
    setRunning(false);
    if (r === null) {
      setMessage("Couldn't reach the local API. Run `job-sentinel serve`.");
      return;
    }
    setOutcome(r);
  }

  async function refilterStored() {
    setRefiltering(true);
    setMessage("");
    const r = await saveFilterSettings({
      exclude_outsourcing: excludeOutsourcing,
      exclude_part_time: excludePartTime,
      exclude_internship: excludeInternship,
      custom_keywords: customKeywords.split(/[\n,;，；]+/).map((s) => s.trim()).filter(Boolean),
      excluded_companies: excludedCompanies.split(/[\n,;，；]+/).map((s) => s.trim()).filter(Boolean),
      apply: true,
    });
    setRefiltering(false);
    if (r === null) {
      setMessage("Couldn't save filters. Is the API running?");
      return;
    }
    const n = r.reapplied;
    setMessage(
      n
        ? `Re-filtered ${n.scanned} stored jobs (${n.included} in pool, ${n.excluded} excluded). No scrape.`
        : "Filter settings saved.",
    );
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
        <h1 className="text-3xl font-bold tracking-tight text-ink">Collect Jobs</h1>
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
            <p className="mb-2 text-[11px] text-muted">
              Only currently wired collectors are listed. Collection runs only the sources you
              check.
            </p>
            <div className="flex flex-col gap-1.5">
              {catalog.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-line px-2.5 py-2 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.has(s.id)}
                    onChange={() => toggleSource(s.id)}
                  />
                  <span>
                    <span className="font-medium">{s.label}</span>
                    {s.notes ? <span className="block text-[11px] text-muted">{s.notes}</span> : null}
                  </span>
                </label>
              ))}
            </div>
            {selected.size === 0 && (
              <p className="mt-2 text-xs text-amber-600">Select at least one source to collect.</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Max results</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {MAX_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => changeMaxResults(String(n))}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    maxResults === n
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-line text-muted hover:text-ink",
                  )}
                >
                  {n}
                </button>
              ))}
              <Input
                type="number"
                min={1}
                max={200}
                value={maxResults}
                onChange={(e) => changeMaxResults(e.target.value)}
                className="h-8 w-24"
                aria-label="Max results"
              />
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Passed to mcp-jobs. Collectors paginate until this cap or the source runs out.
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Exclude from Job Pool</p>
            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={excludeOutsourcing}
                  onChange={(e) => setExcludeOutsourcing(e.target.checked)}
                />
                Outsourcing / 外包
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={excludePartTime}
                  onChange={(e) => setExcludePartTime(e.target.checked)}
                />
                Part-time / 兼职
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={excludeInternship}
                  onChange={(e) => setExcludeInternship(e.target.checked)}
                />
                Internship / 实习
              </label>
            </div>
            <label className="mt-3 block text-sm font-medium text-ink">
              Custom exclude keywords
              <textarea
                value={customKeywords}
                onChange={(e) => setCustomKeywords(e.target.value)}
                placeholder="One per line, or comma-separated"
                rows={3}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm placeholder:text-muted/70 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-ink">
              Hidden companies
              <textarea
                value={excludedCompanies}
                onChange={(e) => setExcludedCompanies(e.target.value)}
                placeholder="Company names, comma or newline"
                rows={3}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm placeholder:text-muted/70 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              />
            </label>
            <p className="mt-1 text-[11px] text-muted">
              Excluded jobs stay in jobs_raw and jobs. Changing rules re-filters without scraping.
            </p>
            <button
              type="button"
              onClick={() => void refilterStored()}
              disabled={refiltering || running}
              className="mt-2 text-xs font-medium text-brand hover:underline disabled:text-muted"
            >
              {refiltering ? "Re-filtering…" : "Save & re-filter stored jobs"}
            </button>
          </div>

          <Button type="submit" disabled={!canRun} className="w-full">
            {running ? "Collecting…" : "Collect Jobs"}
          </Button>
        </form>
      </Card>

      {message && <p className="mt-4 text-sm text-amber-700">{message}</p>}

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
      {outcome.message && outcome.message !== label && <CardSub>{outcome.message}</CardSub>}
      <ul className="space-y-1 text-sm text-ink">
        <li>New jobs added: {outcome.jobs_created}</li>
        <li>Updated existing jobs: {outcome.jobs_updated}</li>
        <li>Raw records stored: {outcome.raw_inserted}</li>
        <li>Excluded from Job Pool: {outcome.excluded ?? 0}</li>
        {outcome.max_results != null && <li>Max results requested: {outcome.max_results}</li>}
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
