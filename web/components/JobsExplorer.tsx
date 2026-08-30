"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { JobActions } from "@/components/JobActions";
import {
  JobPoolActionMenu,
  JobPoolUndoToast,
  useDismissOutside,
  useJobPoolActions,
} from "@/components/JobPoolActions";
import { PopoverSelect } from "@/components/ui/popover-select";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import type { HubJob, HubJobStatus } from "@/lib/api";
import {
  DISCOVERED_RANGE_OPTIONS,
  jobsPoolHref,
  type DiscoveredRange,
  type PoolView,
} from "@/lib/discoveredRange";
import { cn, externalUrl } from "@/lib/utils";

const STATUSES: HubJobStatus[] = ["saved", "to_do", "applied", "closed", "reference"];

function statusChipLabel(key: string): string {
  return key === "unset" ? "No status" : key;
}

const ACCENT: Record<string, string> = {
  unset: "bg-stone-300",
  saved: "bg-sky-500",
  to_do: "bg-amber-500",
  applied: "bg-violet-500",
  closed: "bg-stone-400",
  reference: "bg-emerald-500",
};

function dayStamp(iso: string): string {
  return iso.slice(0, 10);
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
}: {
  jobs: HubJob[];
  range?: DiscoveredRange;
  customSince?: string;
  pool?: PoolView;
  otherCount?: number;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<"newest" | "published">("newest");
  const [overrides, setOverrides] = useState<Record<string, HubJobStatus | null>>({});
  const poolActions = useJobPoolActions();
  const closeMenu = () => poolActions.setMenu(null);
  const menuRef = useDismissOutside(!!poolActions.menu, closeMenu);

  const statusOf = (j: HubJob): HubJobStatus | null =>
    Object.prototype.hasOwnProperty.call(overrides, j.id) ? overrides[j.id] : j.status;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: jobs.length, unset: 0 };
    for (const j of jobs) {
      const s = statusOf(j);
      const key = s ?? "unset";
      c[key] = (c[key] ?? 0) + 1;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, overrides]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = jobs.filter((j) => {
      const s = statusOf(j);
      if (filter === "unset" && s !== null) return false;
      if (filter !== "all" && filter !== "unset" && s !== filter) return false;
      if (!q) return true;
      return [j.title, j.company, j.location, j.source]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    const sorted = [...filtered];
    if (sort === "published") {
      sorted.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
    } else {
      sorted.sort((a, b) => b.discovered_at.localeCompare(a.discovered_at));
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
    poolActions.hiddenIds,
    poolActions.hiddenCompanies,
  ]);

  function setRange(next: DiscoveredRange) {
    router.push(jobsPoolHref(next, next === "custom" ? customSince : "", pool));
  }

  function setCustomSince(value: string) {
    router.push(jobsPoolHref("custom", value, pool));
  }

  function setPool(next: PoolView) {
    router.push(jobsPoolHref(range, customSince, next));
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
              onChange={(v) => setSort(v as "newest" | "published")}
              aria-label="Sort jobs"
              className="w-40"
              options={[
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
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {["all", "unset", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === s
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink",
              )}
            >
              {statusChipLabel(s)}
              <span className={cn("ml-1.5 tabular-nums", filter === s ? "text-white/60" : "text-muted/60")}>
                {counts[s] ?? 0}
              </span>
            </button>
          ))}
        </div>
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
            const st = statusOf(j);
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
                    <CardTitle className="leading-snug">{j.title}</CardTitle>
                    <CardSub className="mt-0.5">
                      {[j.company, j.location, j.source].filter(Boolean).join(" · ")}
                    </CardSub>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted">Discovered {dayStamp(j.discovered_at)}</span>
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
                      jobId={j.id}
                      status={st}
                      onChange={(next) => setOverrides((o) => ({ ...o, [j.id]: next }))}
                    />
                  </div>

                  {j.description && (
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
                        <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{j.description}</p>
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
