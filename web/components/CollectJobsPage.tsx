"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CollectSourceGroups } from "@/components/CollectSourceGroups";
import { CollectToast } from "@/components/CollectToast";
import { LocalSetupGuide } from "@/components/LocalSetupGuide";
import { MarketSwitch } from "@/components/MarketSwitch";
import { SearchPresetsBar } from "@/components/SearchPresetsBar";
import { Button } from "@/components/ui/button";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  collectJobs,
  createSearchPreset,
  deleteSearchPreset,
  getCollectSources,
  getFilterSettings,
  getJobs,
  listSearchPresets,
  saveFilterSettings,
  updateSearchPreset,
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
import { sourceInMarket, type MarketId } from "@/lib/markets";
import {
  defaultCollectSources,
  readCollectQueryPrefs,
  readCollectSourceIds,
  writeCollectQueryPrefs,
  writeCollectSourceIds,
} from "@/lib/marketPrefs";
import {
  emptyCommonFilters,
  fieldIsPartial,
  presetLoadWarnings,
  snapshotEquals,
  sourcesForField,
  type CommonSearchFilters,
  type SearchPreset,
} from "@/lib/searchCapabilities";
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
  const [presets, setPresets] = useState<SearchPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [sourceOverrides, setSourceOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [presetWarnings, setPresetWarnings] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [refiltering, setRefiltering] = useState(false);
  const [outcome, setOutcome] = useState<CollectOutcome | null>(null);
  const [poolTotal, setPoolTotal] = useState<number | null>(null);
  const [toast, setToast] = useState<CollectToastContent | null>(null);
  const [message, setMessage] = useState("");
  const keywordsRef = useRef<HTMLInputElement>(null);

  function currentCommon(): CommonSearchFilters {
    const posted = Number(datePostedDays);
    return {
      keywords: keywords.trim(),
      location: location.trim(),
      remote: remoteOnly ? true : null,
      date_posted_days: Number.isFinite(posted) && posted > 0 ? posted : null,
      max_results: maxResults,
    };
  }

  function scopedOverrides(ids: Iterable<string>): Record<string, Record<string, unknown>> {
    const allowed = new Set(ids);
    const next: Record<string, Record<string, unknown>> = {};
    for (const [id, fields] of Object.entries(sourceOverrides)) {
      if (allowed.has(id) && fields && Object.keys(fields).length > 0) next[id] = fields;
    }
    return next;
  }

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
    setActivePresetId(null);
    setSourceOverrides({});
    setPresetWarnings([]);
    Promise.all([getCollectSources(market), getFilterSettings(), listSearchPresets(market)])
      .then(([sourcesResp, filters, saved]) => {
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
        setPresets(saved ?? []);
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

  function applyPresetToForm(preset: SearchPreset, catalogList: CollectSource[]) {
    const catalogIds = new Set(catalogList.map((s) => s.id));
    const nextSources = new Set(preset.sources.filter((id) => catalogIds.has(id)));
    const filters = { ...emptyCommonFilters(), ...preset.common_filters };
    setKeywords(filters.keywords);
    setLocation(filters.location);
    setRemoteOnly(filters.remote === true);
    setDatePostedDays(filters.date_posted_days ? String(filters.date_posted_days) : "");
    setMaxResults(filters.max_results);
    setSelected(nextSources);
    persistSources(nextSources);
    persistQuery({
      location: filters.location,
      remote: filters.remote === true,
      postedDays: filters.date_posted_days ? String(filters.date_posted_days) : "",
    });
    try {
      localStorage.setItem(MAX_STORAGE_KEY, String(filters.max_results));
    } catch {
      /* ignore */
    }
    setSourceOverrides(preset.source_overrides ?? {});
    setActivePresetId(preset.id);
    setPresetWarnings(presetLoadWarnings(preset, catalogList));
  }

  async function handleSavePreset(name: string) {
    const row = await createSearchPreset({
      name,
      market,
      sources: [...selected],
      common_filters: currentCommon(),
      source_overrides: scopedOverrides(selected),
    });
    if (!row) {
      setMessage("Couldn't save this search. Is the API running?");
      return;
    }
    setPresets((rows) => [...rows, row]);
    setActivePresetId(row.id);
    setPresetWarnings([]);
  }

  async function handleUpdatePreset() {
    if (!activePresetId) return;
    const row = await updateSearchPreset(activePresetId, {
      sources: [...selected],
      common_filters: currentCommon(),
      source_overrides: scopedOverrides(selected),
    });
    if (!row) {
      setMessage("Couldn't update this saved search.");
      return;
    }
    setPresets((rows) => rows.map((p) => (p.id === row.id ? row : p)));
    setSourceOverrides(row.source_overrides ?? {});
    setPresetWarnings([]);
  }

  async function handleRenamePreset(preset: SearchPreset, name: string) {
    const row = await updateSearchPreset(preset.id, { name });
    if (!row) {
      setMessage("Couldn't rename this saved search.");
      return;
    }
    setPresets((rows) => rows.map((p) => (p.id === row.id ? row : p)));
  }

  async function handleDeletePreset(preset: SearchPreset) {
    const ok = await deleteSearchPreset(preset.id);
    if (!ok) {
      setMessage("Couldn't delete this saved search.");
      return;
    }
    setPresets((rows) => rows.filter((p) => p.id !== preset.id));
    if (activePresetId === preset.id) {
      setActivePresetId(null);
      setPresetWarnings([]);
    }
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
      ...collectQueryFilters(remoteOnly, datePostedDays),
      exclude_outsourcing: excludeOutsourcing,
      exclude_part_time: excludePartTime,
      exclude_internship: excludeInternship,
      custom_keywords: customKeywords,
      excluded_companies: excludedCompanies,
      market,
      source_overrides: scopedOverrides(selected),
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
  const remoteSources = sourcesForField("remote", selected, catalog);
  const postedSources = sourcesForField("date_posted_days", selected, catalog);
  const showRemote = remoteSources.length > 0;
  const showPosted = postedSources.length > 0;
  const remotePartial = fieldIsPartial("remote", selected, catalog);
  const postedPartial = fieldIsPartial("date_posted_days", selected, catalog);
  const activePreset = presets.find((p) => p.id === activePresetId) ?? null;
  const dirty =
    activePreset != null &&
    !snapshotEquals(
      {
        sources: [...selected],
        common: currentCommon(),
        overrides: scopedOverrides(selected),
      },
      {
        sources: activePreset.sources,
        common: { ...emptyCommonFilters(), ...activePreset.common_filters },
        overrides: activePreset.source_overrides ?? {},
      },
    );
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
        <SearchPresetsBar
          presets={presets}
          activeId={activePresetId}
          dirty={dirty}
          canSave={selected.size > 0}
          onLoad={(preset) => applyPresetToForm(preset, catalog)}
          onSave={(name) => void handleSavePreset(name)}
          onUpdate={() => void handleUpdatePreset()}
          onRename={(preset, name) => void handleRenamePreset(preset, name)}
          onDelete={(preset) => void handleDeletePreset(preset)}
        />
        {presetWarnings.length > 0 && (
          <p className="text-[11px] text-amber-700">{presetWarnings.join(" · ")}</p>
        )}
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
          {(showRemote || showPosted) && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {showRemote && (
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
                    {remotePartial && (
                      <span className="text-[11px] font-normal text-muted">
                        ({remoteSources.map((s) => s.label ?? s.id).join(", ")} only)
                      </span>
                    )}
                  </label>
                )}
                {showPosted && (
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
                    {postedPartial && (
                      <span className="text-[11px] font-normal text-muted">
                        ({postedSources.map((s) => s.label ?? s.id).join(", ")} only)
                      </span>
                    )}
                  </label>
                )}
              </div>
              <p className="text-[11px] text-muted">
                These filters are sent only to sources that support them.
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
