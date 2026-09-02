"use client";

import { useEffect, useMemo, useState } from "react";

import { JobActions } from "@/components/JobActions";
import { JobCommNotes } from "@/components/JobCommNotes";
import { JobTasks } from "@/components/JobTasks";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { PopoverSelect } from "@/components/ui/popover-select";
import { getCollectSources, getJobs, patchHubJob, type HubJob } from "@/lib/api";
import { dateInputValue, isDateOverdue, openTasksSorted, taskChipText, taskDueUrgency } from "@/lib/jobPipeline";
import { jobIdFromSearch, taskJobAnchorId } from "@/lib/jobTasksUi";
import { MARKET_ORDER, type MarketId } from "@/lib/markets";
import { groupTasksByDue, jobMatchesTaskSearch, TASK_SECTIONS } from "@/lib/taskBoard";
import { cn, externalUrl } from "@/lib/utils";

const TASK_CHIP: Record<string, string> = {
  overdue: "bg-rose-100 text-rose-800",
  today: "bg-amber-100 text-amber-900",
  upcoming: "bg-sky-50 text-sky-800",
  none: "bg-stone-100 text-stone-700",
};

export function TasksExplorer() {
  const [jobs, setJobs] = useState<HubJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [source, setSource] = useState("");
  const [market, setMarket] = useState<MarketId | "">("");
  const [hasDraft, setHasDraft] = useState<"all" | "yes" | "no">("all");
  const [sources, setSources] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({
    overdue: true,
    today: true,
    upcoming: true,
    none: true,
  });
  const [overrides, setOverrides] = useState<Record<string, HubJob>>({});
  const [focusJobId, setFocusJobId] = useState("");

  useEffect(() => {
    setFocusJobId(jobIdFromSearch(window.location.search));
  }, []);

  useEffect(() => {
    const draft =
      hasDraft === "yes" ? true : hasDraft === "no" ? false : undefined;
    void Promise.all([
      getJobs(200, undefined, "included", { view: "tasks", hasDraft: draft }),
      getCollectSources(),
    ]).then(([list, catalog]) => {
      setJobs(list);
      setSources((catalog?.sources ?? []).map((s) => ({ id: s.id, label: s.label })));
      setLoaded(true);
    });
  }, [hasDraft]);

  const merged = (j: HubJob): HubJob => overrides[j.id] ?? j;

  const visible = useMemo(() => {
    return jobs
      .map(merged)
      .filter((j) => jobMatchesTaskSearch(j, query))
      .filter((j) => (source ? j.source === source : true))
      .filter((j) => (market ? (j.market || "").toLowerCase() === market : true));
  }, [jobs, overrides, query, source, market]);

  const grouped = useMemo(() => groupTasksByDue(visible), [visible]);

  useEffect(() => {
    if (!focusJobId || !loaded) return;
    const el = document.getElementById(taskJobAnchorId(focusJobId));
    el?.scrollIntoView({ block: "start" });
  }, [focusJobId, loaded, visible]);

  async function saveNextStep(job: HubJob, nextStep: string) {
    const next = await patchHubJob(job.id, { next_step: nextStep });
    if (next) setOverrides((o) => ({ ...o, [job.id]: { ...job, ...next, tasks: job.tasks } }));
  }

  if (!loaded) {
    return <div className="py-16 text-center text-sm text-muted">Loading tasks…</div>;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Tasks</h1>
        <div className="relative min-w-0 flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, role or company…"
            aria-label="Search tasks, role or company"
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm placeholder:text-muted/70 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilter((v) => !v)}
          className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink"
        >
          Filter ▾
        </button>
      </header>
      {showFilter && (
        <div className="flex flex-wrap gap-3 rounded-xl border border-line bg-surface p-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Source
            <PopoverSelect
              value={source}
              onChange={setSource}
              aria-label="Source"
              className="w-40"
              options={[
                { value: "", label: "All" },
                ...sources.map((s) => ({ value: s.id, label: s.label })),
              ]}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            Market
            <PopoverSelect
              value={market}
              onChange={(v) => setMarket(v as MarketId | "")}
              aria-label="Market"
              className="w-32"
              options={[
                { value: "", label: "All" },
                ...MARKET_ORDER.map((id) => ({ value: id, label: id.toUpperCase() })),
              ]}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            Has Application Draft
            <PopoverSelect
              value={hasDraft}
              onChange={(v) => setHasDraft(v as "all" | "yes" | "no")}
              aria-label="Has Application Draft"
              className="w-36"
              options={[
                { value: "all", label: "All" },
                { value: "yes", label: "Draft only" },
                { value: "no", label: "No draft" },
              ]}
            />
          </label>
        </div>
      )}
      {visible.length === 0 ? (
        <Card>
          <CardTitle>No tasks</CardTitle>
          <CardSub className="mt-2">
            Tasks appear when a job has a next step, deadline, unfinished checklist item, or an
            application draft. Save-only and Reference-only jobs stay on Discover.
          </CardSub>
        </Card>
      ) : (
        TASK_SECTIONS.map((section) => {
          const rows = grouped[section.key];
          if (rows.length === 0) return null;
          const opened = open[section.key];
          return (
            <section key={section.key} className="space-y-2">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [section.key]: !opened }))}
                className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left text-sm font-semibold uppercase tracking-wide text-muted"
              >
                {section.label}
                <span className="tabular-nums font-normal">{rows.length}</span>
              </button>
              {opened &&
                rows.map((j) => {
                  const row = merged(j);
                  const dueTasks = openTasksSorted(row);
                  return (
                    <Card
                      key={j.id}
                      id={taskJobAnchorId(row.id)}
                      className={cn("space-y-3", focusJobId === row.id && "ring-2 ring-ink/20")}
                    >
                      <div>
                        <CardTitle className="leading-snug">{row.title}</CardTitle>
                        <CardSub className="mt-0.5">
                          {[row.company, row.location, row.source].filter(Boolean).join(" · ")}
                        </CardSub>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {row.next_step && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              Next: {row.next_step}
                            </span>
                          )}
                          {row.deadline && (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                isDateOverdue(row.deadline)
                                  ? "bg-rose-100 text-rose-800"
                                  : TASK_CHIP[taskDueUrgency(row.deadline)],
                              )}
                            >
                              DDL {dateInputValue(row.deadline)}
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
                        </div>
                      </div>
                      <label className="block text-xs text-muted">
                        Next step
                        <input
                          defaultValue={row.next_step ?? ""}
                          onBlur={(e) => void saveNextStep(row, e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink"
                        />
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        {row.job_url && (
                          <a
                            href={externalUrl(row.job_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-ink"
                          >
                            Open source ↗
                          </a>
                        )}
                        <JobActions
                          job={row}
                          variant="tasks"
                          onChange={(next) =>
                            setOverrides((o) => ({ ...o, [j.id]: { ...next, tasks: next.tasks ?? row.tasks } }))
                          }
                        />
                      </div>
                      <JobTasks
                        job={row}
                        onChange={(tasks) =>
                          setOverrides((o) => ({ ...o, [j.id]: { ...(o[j.id] ?? row), tasks } }))
                        }
                      />
                      <JobCommNotes jobId={row.id} notes={row.comm_notes} />
                    </Card>
                  );
                })}
            </section>
          );
        })
      )}
    </div>
  );
}
