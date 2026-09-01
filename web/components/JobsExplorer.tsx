"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { JobActions } from "@/components/JobActions";
import { JobTasks } from "@/components/JobTasks";
import {
  JobPoolActionMenu,
  JobPoolUndoToast,
  useDismissOutside,
  useJobPoolActions,
} from "@/components/JobPoolActions";
import { PopoverSelect } from "@/components/ui/popover-select";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import type { ArchiveSettings, HubJob, HubJobStatus } from "@/lib/api";
import {
  getArchiveSettings,
  runJobArchive,
  saveArchiveSettings,
} from "@/lib/api";
import {
  POOL_STATUS_CHIPS,
  compareActiveJobs,
  isDateOverdue,
  jobVisibleInPool,
  openTasksSorted,
  statusChipLabel,
  taskDueUrgency,
  type TaskDueUrgency,
} from "@/lib/jobPipeline";
import {
  DISCOVERED_RANGE_OPTIONS,
  jobsPoolHref,
  type DiscoveredRange,
  type PoolView,
} from "@/lib/discoveredRange";
import {
  countryFilterOptions,
  marketHasFilter,
  type MarketId,
} from "@/lib/markets";
import { readPoolPrefs, writePoolPrefs } from "@/lib/marketPrefs";
import { readShowSponsorshipInfo, writeShowSponsorshipInfo } from "@/lib/poolPrefs";
import {
  extraSponsorshipFacts,
  sponsorshipFromJob,
  sponsorshipStatusChip,
} from "@/lib/sponsorshipDisplay";
import { cn, externalUrl } from "@/lib/utils";

const ACCENT: Record<string, string> = {
  unset: "bg-stone-300",
  reference: "bg-emerald-500",
  under_study: "bg-sky-500",
  to_do: "bg-amber-500",
  applied: "bg-violet-500",
  interview: "bg-indigo-500",
  offer: "bg-teal-500",
  closed: "bg-stone-400",
};

const TASK_CHIP: Record<TaskDueUrgency, string> = {
  overdue: "bg-rose-100 text-rose-800",
  today: "bg-amber-100 text-amber-900",
  upcoming: "bg-sky-50 text-sky-800",
  none: "bg-stone-100 text-stone-700",
};

function dayStamp(iso: string): string {
  return iso.slice(0, 10);
}

function taskChipText(title: string, dueAt: string | null | undefined): string {
  const urgency = taskDueUrgency(dueAt);
  const when =
    urgency === "overdue" ? "Overdue" : urgency === "today" ? "Today" : dueAt ? dayStamp(dueAt) : "Task";
  return `${when} ${title}`;
}

function FactRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex flex-col text-sm sm:flex-row sm:gap-2">
      <span className="shrink-0 text-muted sm:w-40">{label}</span>
      <span className="min-w-0 break-words text-ink">{String(value)}</span>
    </div>
  );
}

export function JobsExplorer({
  jobs,
  range = "7d",
  customSince = "",
  pool = "included",
  otherCount = 0,
  market = "cn",
  country = "",
  remote = false,
  postedDays = "",
  sources = [],
  catalogSources = [],
}: {
  jobs: HubJob[];
  range?: DiscoveredRange;
  customSince?: string;
  pool?: PoolView;
  otherCount?: number;
  market?: MarketId;
  country?: string;
  remote?: boolean;
  postedDays?: string;
  sources?: string[];
  catalogSources?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<"active" | "newest" | "published">("active");
  const [showSponsorship, setShowSponsorship] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, HubJob>>({});
  const poolActions = useJobPoolActions();
  const closeMenu = () => poolActions.setMenu(null);
  const menuRef = useDismissOutside(!!poolActions.menu, closeMenu);
  const showCountry = marketHasFilter(market, "country");
  const showRemote = marketHasFilter(market, "remote");
  const showPosted = marketHasFilter(market, "posted");
  const showSource = marketHasFilter(market, "source");
  const showSponsorToggle = marketHasFilter(market, "sponsorship_display");

  useEffect(() => {
    const prefs = readPoolPrefs(market);
    if (prefs.showSponsorship) {
      setShowSponsorship(true);
      return;
    }
    if (market === "en") setShowSponsorship(readShowSponsorshipInfo());
  }, [market]);

  const countryOptions = useMemo(() => countryFilterOptions(jobs), [jobs]);
  const sourceOptions = useMemo(() => {
    const labels = new Map(catalogSources.map((s) => [s.id, s.label]));
    const ids = new Set<string>(jobs.map((j) => j.source).filter(Boolean));
    for (const s of catalogSources) ids.add(s.id);
    return [...ids].sort().map((id) => ({ id, label: labels.get(id) || id }));
  }, [jobs, catalogSources]);

  function href(patch: {
    range?: DiscoveredRange;
    customSince?: string;
    pool?: PoolView;
    country?: string;
    remote?: boolean;
    postedDays?: string;
    sources?: string[];
  }): string {
    return jobsPoolHref({
      market,
      range: patch.range ?? range,
      customSince: patch.customSince ?? customSince,
      pool: patch.pool ?? pool,
      country: patch.country ?? country,
      remote: patch.remote ?? remote,
      postedDays: patch.postedDays ?? postedDays,
      sources: patch.sources ?? sources,
    });
  }

  function persistAndGo(next: {
    country?: string;
    remote?: boolean;
    postedDays?: string;
    sources?: string[];
    range?: DiscoveredRange;
    customSince?: string;
    pool?: PoolView;
  }) {
    writePoolPrefs(market, {
      country: next.country ?? country,
      sources: next.sources ?? sources,
      remote: next.remote ?? remote,
      postedDays: next.postedDays ?? postedDays,
      showSponsorship,
    });
    router.push(href(next));
  }

  const jobOf = (j: HubJob): HubJob =>
    Object.prototype.hasOwnProperty.call(overrides, j.id) ? { ...j, ...overrides[j.id] } : j;

  const statusOf = (j: HubJob): HubJobStatus | null => jobOf(j).status;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, unset: 0 };
    for (const j of jobs) {
      const s = statusOf(j);
      const key = s ?? "unset";
      c[key] = (c[key] ?? 0) + 1;
      if (s !== "closed" || showClosed) c.all += 1;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, overrides, showClosed]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = jobs.filter((j) => {
      const merged = jobOf(j);
      const s = merged.status;
      if (!jobVisibleInPool(s, filter, showClosed)) return false;
      if (!q) return true;
      return [j.title, j.company, j.location, j.source]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    const sorted = [...filtered];
    if (sort === "published") {
      sorted.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
    } else if (sort === "newest") {
      sorted.sort((a, b) => b.discovered_at.localeCompare(a.discovered_at));
    } else {
      sorted.sort((a, b) => compareActiveJobs(jobOf(a), jobOf(b)));
    }
    if (pool === "excluded") return sorted;
    return sorted.filter((j) => !poolActions.isHidden(j));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    jobs,
    query,
    filter,
    sort,
    overrides,
    pool,
    showClosed,
    poolActions.hiddenIds,
    poolActions.hiddenCompanies,
  ]);

  function setRange(next: DiscoveredRange) {
    persistAndGo({ range: next, customSince: next === "custom" ? customSince : "" });
  }

  function setCustomSince(value: string) {
    persistAndGo({ range: "custom", customSince: value });
  }

  function setPool(next: PoolView) {
    persistAndGo({ pool: next });
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-10 -mx-1 space-y-3 rounded-2xl border border-line bg-bg/90 p-3 backdrop-blur-md md:top-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, company, location…"
              aria-label="Search jobs"
              className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink shadow-sm placeholder:text-muted/70 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            />
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
            Discovered
            <PopoverSelect
              value={range}
              onChange={(v) => setRange(v as DiscoveredRange)}
              aria-label="Discovered date range"
              className="w-40"
              options={DISCOVERED_RANGE_OPTIONS}
            />
          </label>
          {range === "custom" && (
            <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
              On or after
              <input
                type="date"
                value={customSince}
                onChange={(e) => setCustomSince(e.target.value)}
                aria-label="Jobs discovered on or after this date"
                className="h-10 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
              />
            </label>
          )}
          <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
            Sort
            <PopoverSelect
              value={sort}
              onChange={(v) => setSort(v as "active" | "newest" | "published")}
              aria-label="Sort jobs"
              className="w-40"
              options={[
                { value: "active", label: "To Do & due dates" },
                { value: "newest", label: "Discovered" },
                { value: "published", label: "Published" },
              ]}
            />
          </label>
          <button
            type="button"
            onClick={() => setPool(pool === "excluded" ? "included" : "excluded")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              pool === "excluded"
                ? "border-ink bg-ink text-white"
                : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink",
            )}
          >
            {pool === "excluded" ? "Back to Job Pool" : `Excluded ${otherCount}`}
          </button>
          {showSponsorToggle && (
          <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showSponsorship}
              onChange={(e) => {
                const next = e.target.checked;
                setShowSponsorship(next);
                writeShowSponsorshipInfo(next);
                writePoolPrefs(market, {
                  country,
                  sources,
                  remote,
                  postedDays,
                  showSponsorship: next,
                });
              }}
              className="h-4 w-4 rounded border-line"
            />
            Show sponsorship info
          </label>
          )}
          <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              className="h-4 w-4 rounded border-line"
            />
            Show closed
          </label>
        </div>
        {(showCountry || showRemote || showPosted || showSource) && (
          <div className="flex flex-wrap items-center gap-3">
            {showCountry && (
              <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
                Country
                <PopoverSelect
                  value={country || "all"}
                  onChange={(v) => persistAndGo({ country: v === "all" ? "" : v })}
                  aria-label="Country"
                  className="w-48"
                  options={[
                    { value: "all", label: "All" },
                    ...countryOptions.map((c) => ({ value: c.code, label: c.name })),
                  ]}
                />
              </label>
            )}
            {showRemote && (
              <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={remote}
                  onChange={(e) => persistAndGo({ remote: e.target.checked })}
                  className="h-4 w-4 rounded border-line"
                />
                Remote
              </label>
            )}
            {showPosted && (
              <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
                Posted
                <PopoverSelect
                  value={postedDays || ""}
                  onChange={(v) => persistAndGo({ postedDays: v })}
                  aria-label="Posted date"
                  className="w-40"
                  options={[
                    { value: "", label: "Any time" },
                    { value: "1", label: "Past 24 hours" },
                    { value: "7", label: "Past week" },
                    { value: "30", label: "Past month" },
                  ]}
                />
              </label>
            )}
          </div>
        )}
        {showSource && sourceOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by source">
            <button
              type="button"
              onClick={() => persistAndGo({ sources: [] })}
              aria-pressed={sources.length === 0}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                sources.length === 0
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink",
              )}
            >
              All sources
            </button>
            {sourceOptions.map((s) => {
              const on = sources.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(sources);
                    if (on) next.delete(s.id);
                    else next.add(s.id);
                    persistAndGo({ sources: [...next] });
                  }}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {POOL_STATUS_CHIPS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === s
                  ? "border-ink bg-ink text-white"
                  : s === "to_do"
                    ? "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400"
                    : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink",
              )}
            >
              {statusChipLabel(s)}
              <span
                className={cn(
                  "ml-1.5 tabular-nums",
                  filter === s ? "text-white/60" : s === "to_do" ? "text-amber-800/70" : "text-muted/60",
                )}
              >
                {counts[s] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <ArchiveControls />
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardTitle>Nothing matches</CardTitle>
          <CardSub className="mt-2">
            {jobs.length === 0
              ? pool === "excluded"
                ? "No excluded jobs for this date range."
                : "No jobs in the pool yet. Use Collect Jobs, or import with job-sentinel ingest."
              : "Try a different search, date, or status filter."}
          </CardSub>
        </Card>
      ) : (
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((j, idx) => {
            const merged = jobOf(j);
            const st = merged.status;
            const dueTasks = openTasksSorted(merged);
            return (
              <motion.div
                key={j.id}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.3) }}
              >
                <Card
                  className="group relative overflow-hidden pl-6"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    poolActions.openMenu(j, e.clientX, e.clientY);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={cn("absolute inset-y-0 left-0 w-1", ACCENT[st ?? "unset"] ?? "bg-stone-300")}
                  />
                  <button
                    type="button"
                    aria-label={`Actions for ${j.title}`}
                    aria-haspopup="menu"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      poolActions.openMenu(j, rect.right - 8, rect.bottom + 4);
                    }}
                    className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-ink/[0.06] hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
                  >
                    ···
                  </button>
                  <div className="min-w-0 pb-3 pr-8">
                    <CardTitle className="leading-snug">
                      {merged.favorite ? <span className="mr-1 text-amber-500">★</span> : null}
                      {j.title}
                    </CardTitle>
                    <CardSub className="mt-0.5">
                      {[j.company, j.location, j.source].filter(Boolean).join(" · ")}
                    </CardSub>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted">Discovered {dayStamp(j.discovered_at)}</span>
                      {merged.next_step && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          Next: {merged.next_step}
                        </span>
                      )}
                      {merged.deadline && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            isDateOverdue(merged.deadline)
                              ? "bg-rose-100 text-rose-800"
                              : taskDueUrgency(merged.deadline) === "today"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-sky-50 text-sky-800",
                          )}
                        >
                          DDL {dayStamp(merged.deadline)}
                        </span>
                      )}
                      {dueTasks.slice(0, 3).map((task) => (
                          <span
                            key={task.id}
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              TASK_CHIP[taskDueUrgency(task.due_at)],
                            )}
                          >
                            {taskChipText(task.title, task.due_at)}
                          </span>
                        ))}
                      {dueTasks.length > 3 && (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                          +{dueTasks.length - 3} more
                        </span>
                      )}
                      {j.published_at && (
                        <span className="text-[11px] text-muted">Published {dayStamp(j.published_at)}</span>
                      )}
                      {j.salary && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          {j.salary}
                        </span>
                      )}
                      {typeof j.match_score === "number" && (
                        <span className="text-[11px] text-muted">
                          Match {(j.match_score * 100).toFixed(0)}%
                        </span>
                      )}
                      {pool === "excluded" && (j.filter_reasons?.length ?? 0) > 0 && (
                        <span className="text-[11px] text-amber-700">
                          {j.filter_reasons?.join(", ")}
                        </span>
                      )}
                      {showSponsorToggle && showSponsorship && <SponsorshipChips job={j} />}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    {j.job_url && (
                      <a
                        href={externalUrl(j.job_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-ink/30 hover:bg-bg"
                      >
                        Open source ↗
                      </a>
                    )}
                    <JobActions
                      job={merged}
                      onPatched={(next) =>
                        setOverrides((o) => ({
                          ...o,
                          [j.id]: { ...next, tasks: next.tasks ?? o[j.id]?.tasks ?? merged.tasks },
                        }))
                      }
                    />
                  </div>
                  <div className="border-t border-line pt-3">
                    <JobTasks
                      job={merged}
                      onChange={(tasks) =>
                        setOverrides((o) => ({
                          ...o,
                          [j.id]: { ...(o[j.id] ?? merged), tasks },
                        }))
                      }
                    />
                  </div>

                  {(j.description ||
                    (showSponsorToggle &&
                      showSponsorship &&
                      (sponsorshipFromJob(j)?.evidence?.length ?? 0) > 0)) && (
                    <details className="group/details border-t border-line">
                      <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-xs font-medium text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
                        Job details
                        <span
                          aria-hidden="true"
                          className="ml-auto transition-transform duration-200 group-open/details:rotate-180"
                        >
                          ▾
                        </span>
                      </summary>
                      <div className="space-y-2 pb-2">
                        <FactRow label="Source" value={j.source} />
                        {showSponsorToggle && showSponsorship && <SponsorshipDetailFacts job={j} />}
                        {j.description && (
                          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{j.description}</p>
                        )}
                      </div>
                    </details>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}

      {poolActions.menu && (
        <JobPoolActionMenu
          menu={poolActions.menu}
          busy={poolActions.busy}
          menuRef={menuRef}
          onDismiss={poolActions.dismiss}
          onHideCompany={poolActions.hideCompany}
        />
      )}
      {poolActions.toast && (
        <JobPoolUndoToast
          message={poolActions.toast.message}
          busy={poolActions.busy}
          onUndo={() => void poolActions.undo()}
        />
      )}
    </div>
  );
}

function ArchiveControls() {
  const router = useRouter();
  const [settings, setSettings] = useState<ArchiveSettings>({ enabled: false, idle_days: 14 });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    void getArchiveSettings().then((s) => {
      if (s) setSettings(s);
    });
  }, []);

  async function persist(next: ArchiveSettings) {
    setSettings(next);
    setBusy(true);
    const saved = await saveArchiveSettings(next);
    setBusy(false);
    if (saved) setSettings(saved);
  }

  async function runNow() {
    setBusy(true);
    setNote("");
    const result = await runJobArchive({ force: true });
    setBusy(false);
    if (!result) {
      setNote("Archive run failed");
      return;
    }
    setNote(`Closed ${result.archived} idle job${result.archived === 1 ? "" : "s"}`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={busy}
          onChange={(e) => void persist({ ...settings, enabled: e.target.checked })}
          className="h-4 w-4 rounded border-line"
        />
        Auto-archive idle jobs
      </label>
      <label className="flex items-center gap-2">
        after
        <input
          type="number"
          min={1}
          max={365}
          value={settings.idle_days}
          disabled={busy}
          aria-label="Idle days before auto-archive"
          onChange={(e) => {
            const idle_days = Number(e.target.value) || 14;
            setSettings((s) => ({ ...s, idle_days }));
          }}
          onBlur={() => void persist(settings)}
          className="h-8 w-16 rounded-lg border border-line bg-surface px-2 text-xs text-ink"
        />
        days
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => void runNow()}
        className="h-8 rounded-lg border border-line px-3 font-medium text-ink hover:border-ink/30 disabled:opacity-50"
      >
        Run now
      </button>
      {note && <span className="text-ink">{note}</span>}
    </div>
  );
}

function SponsorshipChips({ job }: { job: HubJob }) {
  const info = sponsorshipFromJob(job);
  const chip = sponsorshipStatusChip(info);
  if (!chip) return null;
  const extras = extraSponsorshipFacts(info);
  return (
    <>
      <span title={chip.title} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", chip.classes)}>
        {chip.label}
      </span>
      {extras.map((bit) => (
        <span key={bit} className="text-[11px] text-muted">
          {bit}
        </span>
      ))}
    </>
  );
}

function SponsorshipDetailFacts({ job }: { job: HubJob }) {
  const info = sponsorshipFromJob(job);
  if (!info) return null;
  const snippet = info.evidence?.find((e) => e.snippet)?.snippet;
  const source =
    info.evidence?.find((e) => e.registry_source)?.registry_source || info.registry_name;
  return (
    <>
      <FactRow label="Sponsor register" value={source} />
      <FactRow label="Evidence" value={snippet} />
      <FactRow
        label="Confidence"
        value={typeof info.confidence === "number" ? String(info.confidence) : null}
      />
    </>
  );
}
