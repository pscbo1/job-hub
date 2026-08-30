"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CollectSourceGroups } from "@/components/CollectSourceGroups";
import { CollectToast } from "@/components/CollectToast";
import { LocalSetupGuide } from "@/components/LocalSetupGuide";
import { MarketSwitch } from "@/components/MarketSwitch";
import { Button } from "@/components/ui/button";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  collectJobs,
  getCollectSources,
  getFilterSettings,
  getJobs,
  saveFilterSettings,
  type CollectOutcome,
  type CollectSource,
} from "@/lib/api";
import {
  buildCollectToast,
  COLLECT_TOAST_MS,
  collectQueryFilters,
  failedSourceLabels,
  formatCollectPlan,
  formatCollectResult,
  formatPoolTotal,
  shouldShowPoolTotal,
  type CollectToastContent,
} from "@/lib/collectCopy";
import {
  initialSourceSelection,
  isSelectableCollectSource,
  persistableSourceIds,
} from "@/lib/collectSourceGroups";
import { jobsPoolHref } from "@/lib/discoveredRange";
import { marketHasFilter, sourceInMarket, type MarketId } from "@/lib/markets";
import {
  defaultCollectSources,
  readCollectQueryPrefs,
  readCollectSourceIds,
  writeCollectQueryPrefs,
  writeCollectSourceIds,
} from "@/lib/marketPrefs";
import { cn } from "@/lib/utils";

const MAX_STORAGE_KEY = "job-hub.collect.maxResults";
const MAX_PRESETS = [50, 100, 200];

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

export function CollectJobsPage({ market }: { market: MarketId }) {
  const [apiDown, setApiDown] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [catalog, setCatalog] = useState<CollectSource[]>([]);
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [datePostedDays, setDatePostedDays] = useState("");
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
  const [poolTotal, setPoolTotal] = useState<number | null>(null);
  const [toast, setToast] = useState<CollectToastContent | null>(null);
  const [message, setMessage] = useState("");
  const keywordsRef = useRef<HTMLInputElement>(null);
  const showRemotePosted = marketHasFilter(market, "remote") || marketHasFilter(market, "posted");

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
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), COLLECT_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    setLoaded(false);
    Promise.all([getCollectSources(market), getFilterSettings()])
      .then(([sourcesResp, filters]) => {
        if (sourcesResp === null) {
          setApiDown(true);
          return;
        }
        const list = (sourcesResp.sources ?? []).filter(
          (s) => isSelectableCollectSource(s) && sourceInMarket(s.market, market),
        );
        setCatalog(list);
        const ids = list.map((s) => s.id);
        const remembered = readCollectSourceIds(market);
        setSelected(new Set(initialSourceSelection(remembered, ids, defaultCollectSources(market))));
        setMaxResults(loadMaxResults());
        const queryPrefs = readCollectQueryPrefs(market);
        setLocation(queryPrefs.location);
        setRemoteOnly(queryPrefs.remote);
        setDatePostedDays(queryPrefs.postedDays);
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
  }, [market]);

  function persistSources(next: Set<string>) {
    writeCollectSourceIds(market, persistableSourceIds(next, catalog.map((s) => s.id)));
  }

  function setSourceSelection(next: Set<string>) {
    persistSources(next);
    setSelected(next);
  }

  function persistQuery(next: { location?: string; remote?: boolean; postedDays?: string }) {
    writeCollectQueryPrefs(market, {
      location: next.location ?? location,
      remote: next.remote ?? remoteOnly,
      postedDays: next.postedDays ?? datePostedDays,
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
    setPoolTotal(null);
    setToast(null);
    const r = await collectJobs({
      keywords: kw,
      location: location.trim(),
      sources: [...selected],
      max_results: maxResults,
      ...collectQueryFilters(showRemotePosted && remoteOnly, showRemotePosted ? datePostedDays : ""),
      exclude_outsourcing: excludeOutsourcing,
      exclude_part_time: excludePartTime,
      exclude_internship: excludeInternship,
      custom_keywords: customKeywords,
      excluded_companies: excludedCompanies,
      market,
    });
    setRunning(false);
    const labelsById = Object.fromEntries(catalog.map((s) => [s.id, s.label]));
    if (r === null) {
      setMessage("Couldn't reach the local API. Run `job-sentinel serve`.");
      setToast(buildCollectToast({
        status: "unreachable",
        created: 0,
        updated: 0,
        excluded: 0,
        poolTotal: null,
        failedLabels: [],
        othersContinued: false,
      }));
      return;
    }
    setOutcome(r);
    const pool = await getJobs(500, undefined, "included", { market });
    const nextTotal = shouldShowPoolTotal(pool.length, r.jobs_created) ? pool.length : null;
    if (nextTotal != null) {
      setPoolTotal(nextTotal);
    }
    setToast(
      buildCollectToast({
        status: r.status,
        created: r.jobs_created,
        updated: r.jobs_updated,
        excluded: r.excluded ?? 0,
        poolTotal: nextTotal,
        failedLabels: failedSourceLabels(r.source_results, labelsById),
        othersContinued: r.source_results.some((s) => Boolean(s.succeeded)),
      }),
    );
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
  const poolHref = jobsPoolHref({
    market,
    range: outcome?.since ? "custom" : "7d",
    customSince: outcome?.since ?? "",
  });

  return (
    <div className="mx-auto max-w-xl px-5 py-12">
      <header className="mb-6 space-y-3">
        <MarketSwitch current={market} page="search" />
        <h1 className="text-3xl font-bold tracking-tight text-ink">Collect Jobs</h1>
        <p className="mt-1 text-sm text-muted">
          Search selected {market.toUpperCase()} sources and add matching jobs to your Job Pool.
          Browse and filter them on Job Pool — this page does not search jobs you already collected.
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
            placeholder={
              market === "en" ? "Country / location (optional)" : "Location (optional city)"
            }
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              persistQuery({ location: e.target.value });
            }}
          />
          {showRemotePosted && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {marketHasFilter(market, "remote") && (
                  <label className="flex items-center gap-2 text-ink">
                    <input
                      type="checkbox"
                      checked={remoteOnly}
                      onChange={(e) => {
                        setRemoteOnly(e.target.checked);
                        persistQuery({ remote: e.target.checked });
                      }}
                    />
                    Remote
                  </label>
                )}
                {marketHasFilter(market, "posted") && (
                  <label className="flex items-center gap-2 text-ink">
                    Posted
                    <select
                      value={datePostedDays}
                      onChange={(e) => {
                        setDatePostedDays(e.target.value);
                        persistQuery({ postedDays: e.target.value });
                      }}
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink"
                    >
                      <option value="">Any time</option>
                      <option value="1">Past 24 hours</option>
                      <option value="7">Past week</option>
                      <option value="30">Past month</option>
                    </select>
                  </label>
                )}
              </div>
              <p className="text-[11px] text-muted">
                Remote and posted date are sent to sources that support them (LinkedIn guest search).
              </p>
            </>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Sources</p>
            <p className="mb-2 text-[11px] text-muted">
              Only {market.toUpperCase()} collectors are listed. Collection runs only the sources you
              check.
            </p>
            <CollectSourceGroups
              catalog={catalog}
              selected={selected}
              onChange={setSourceSelection}
            />
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
              Cap per source. Collection stops at this number or when that source has no more jobs.
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
              Matching jobs stay stored and appear under Excluded. Changing rules re-filters without
              collecting again.
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

          <p className="text-xs text-muted">{formatCollectPlan(selected.size, maxResults)}</p>
          {!keywords.trim() && (
            <p className="text-xs text-muted">Enter keywords to collect.</p>
          )}
          <Button
            type="submit"
            disabled={!canRun}
            className="w-full"
            title={
              canRun
                ? undefined
                : selected.size === 0
                  ? "Select at least one source"
                  : "Enter keywords to collect"
            }
          >
            {running ? "Collecting…" : "Collect Jobs"}
          </Button>
        </form>
      </Card>

      {message && <p className="mt-4 text-sm text-amber-700">{message}</p>}

      {running && !outcome && (
        <Card className="mt-4">
          <CardSub>Searching selected sources. This can take a few minutes.</CardSub>
        </Card>
      )}

      {outcome && (
        <CollectResultCard outcome={outcome} poolHref={poolHref} poolTotal={poolTotal} />
      )}
      {toast && <CollectToast title={toast.title} lines={toast.lines} />}
    </div>
  );
}

function CollectResultCard({
  outcome,
  poolHref,
  poolTotal,
}: {
  outcome: CollectOutcome;
  poolHref: string;
  poolTotal: number | null;
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
      <p className="text-sm text-ink">
        {formatCollectResult(outcome.jobs_created, outcome.jobs_updated, outcome.excluded ?? 0)}
      </p>
      {poolTotal != null && <p className="text-sm text-muted">{formatPoolTotal(poolTotal)}</p>}
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
