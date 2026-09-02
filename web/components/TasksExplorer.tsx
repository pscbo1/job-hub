"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { JobActions } from "@/components/JobActions";
import { JobCommNotes } from "@/components/JobCommNotes";
import { JobContact } from "@/components/JobContact";
import { JobTasks } from "@/components/JobTasks";
import { SourceActionLink } from "@/components/SourceActionLink";
import { TaskRemindersPanel } from "@/components/TaskRemindersPanel";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { PopoverSelect } from "@/components/ui/popover-select";
import { getApplications, getCollectSources, getHubJob, getJobs, patchHubJob, patchJobTask, type ApplicationStage, type HubJob, type JobTask, updateApplication } from "@/lib/api";
import { dateInputValue, isDateOverdue, openTasksSorted, taskChipText, taskDueUrgency } from "@/lib/jobPipeline";
import { jobIdFromSearch, taskIdFromSearch, taskItemAnchorId, taskJobAnchorId } from "@/lib/jobTasksUi";
import { MARKET_ORDER, type MarketId } from "@/lib/markets";
import { groupTasksByDue, jobMatchesTaskSearch, TASK_SECTIONS } from "@/lib/taskBoard";
import { cn } from "@/lib/utils";

const TASK_CHIP: Record<string, string> = {
  overdue: "bg-rose-100 text-rose-800",
  today: "bg-amber-100 text-amber-900",
  upcoming: "bg-sky-50 text-sky-800",
  none: "bg-stone-100 text-stone-700",
};

type TaskPhase = ApplicationStage | "not_started";

const PHASE_LABEL: Record<TaskPhase, string> = {
  not_started: "Not applied",
  draft: "Draft",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  closed: "Closed",
};

const PHASE_CHIP: Record<TaskPhase, string> = {
  not_started: "bg-stone-100 text-stone-700",
  draft: "bg-amber-50 text-amber-800",
  applied: "bg-sky-50 text-sky-800",
  interview: "bg-violet-50 text-violet-800",
  offer: "bg-emerald-50 text-emerald-800",
  closed: "bg-stone-100 text-stone-500",
};

const APPLICATION_PHASES: ApplicationStage[] = ["draft", "applied", "interview", "offer", "closed"];

function phaseOptionDisabled(current: ApplicationStage, option: ApplicationStage): boolean {
  if (option === "draft") return current !== "draft";
  return current === "draft";
}

export function TasksExplorer() {
  const [jobs, setJobs] = useState<HubJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [source, setSource] = useState("");
  const [market, setMarket] = useState<MarketId | "">("");
  const [hasDraft, setHasDraft] = useState<"all" | "yes" | "no">("all");
  const [hasNextStep, setHasNextStep] = useState<"all" | "yes" | "no">("all");
  const [completion, setCompletion] = useState<"all" | "incomplete" | "completed">("incomplete");
  const [sources, setSources] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({
    overdue: true,
    today: true,
    upcoming: true,
    none: true,
  });
  const [overrides, setOverrides] = useState<Record<string, HubJob>>({});
  const [focusJobId, setFocusJobId] = useState("");
  const [focusTaskId, setFocusTaskId] = useState("");
  const [pinned, setPinned] = useState<HubJob | null>(null);
  const [missingTask, setMissingTask] = useState("");
  const [view, setView] = useState<"tasks" | "jobs">("tasks");
  const [applicationStages, setApplicationStages] = useState<Record<string, ApplicationStage>>({});
  const [applicationIds, setApplicationIds] = useState<Record<string, string>>({});
  const [editingNextStep, setEditingNextStep] = useState<string | null>(null);
  const [nextStepDraft, setNextStepDraft] = useState("");

  useEffect(() => {
    setFocusJobId(jobIdFromSearch(window.location.search));
    setFocusTaskId(taskIdFromSearch(window.location.search));
  }, []);

  useEffect(() => {
    const draft =
      hasDraft === "yes" ? true : hasDraft === "no" ? false : undefined;
    void Promise.all([
      getJobs(200, undefined, "included", { view: completion === "incomplete" ? "tasks" : "discover", hasDraft: draft }),
      getCollectSources(),
      getApplications(undefined, 500, { view: "all" }),
    ]).then(([list, catalog, applications]) => {
      setJobs(list);
      setSources((catalog?.sources ?? []).map((s) => ({ id: s.id, label: s.label })));
      const linked = applications.filter((application) => application.job_id);
      setApplicationStages(Object.fromEntries(linked.map((application) => [application.job_id as string, application.stage])));
      setApplicationIds(Object.fromEntries(linked.map((application) => [application.job_id as string, application.id])));
      setLoaded(true);
    });
  }, [hasDraft, completion]);

  const merged = useCallback((j: HubJob): HubJob => overrides[j.id] ?? j, [overrides]);

  const visible = useMemo(() => {
    const rows = jobs
      .map(merged)
      .filter((j) => {
        const hasOpen = openTasksSorted(j).length > 0;
        const hasCompleted = (j.tasks ?? []).some((task) => task.done);
        if (completion === "completed") return hasCompleted;
        if (completion === "all") return hasOpen || hasCompleted;
        return hasOpen;
      })
      .filter((j) => hasNextStep === "all" || (hasNextStep === "yes" ? Boolean(j.next_step?.trim()) : !j.next_step?.trim()))
      .filter((j) => jobMatchesTaskSearch(j, query));
    const filtered = rows
      .filter((j) => (source ? j.source === source : true))
      .filter((j) => (market ? (j.market || "").toLowerCase() === market : true));
    if (pinned && !filtered.some((j) => j.id === pinned.id)) {
      return [merged(pinned), ...filtered];
    }
    return filtered;
  }, [jobs, merged, query, source, market, pinned, completion, applicationStages]);

  const grouped = useMemo(() => groupTasksByDue(visible), [visible]);

  const taskRows = useMemo(() => {
    const rows: Array<{ id: string; title: string; dueAt: string | null; kind: string; phase: TaskPhase; job: HubJob; task?: JobTask }> = [];
    for (const job of visible) {
      const phase = applicationStages[job.id] ?? "not_started";
      const taskList = completion === "incomplete"
        ? openTasksSorted(job)
        : (job.tasks ?? []).slice().sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") || a.sort_order - b.sort_order);
      for (const task of taskList) rows.push({ id: task.id, title: task.title, dueAt: task.due_at, kind: "Task", phase, job, task });
    }
    return rows.sort((a, b) => {
      const urgency = (value: string | null) => ({ today: 0, upcoming: 1, none: 2, overdue: 3 }[taskDueUrgency(value)] ?? 2);
      return urgency(a.dueAt) - urgency(b.dueAt) || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || a.title.localeCompare(b.title);
    });
  }, [visible, applicationStages, completion]);

  useEffect(() => {
    if (!focusJobId || !loaded) return;
    let cancelled = false;
    const found = jobs.some((j) => j.id === focusJobId) || pinned?.id === focusJobId;
    if (!found) {
      void getHubJob(focusJobId).then((job) => {
        if (cancelled) return;
        if (job) setPinned(job);
        else setMissingTask("Task no longer available.");
      });
      return () => {
        cancelled = true;
      };
    }
    const row = [...jobs, pinned].find((j) => j && j.id === focusJobId);
    if (focusTaskId && row && !(row.tasks ?? []).some((t) => t.id === focusTaskId)) {
      setMissingTask("Task no longer available.");
      return;
    }
    setMissingTask("");
    const el = document.getElementById(
      focusTaskId ? taskItemAnchorId(focusTaskId) : taskJobAnchorId(focusJobId),
    );
    el?.scrollIntoView({ block: "start" });
    return () => {
      cancelled = true;
    };
  }, [focusJobId, focusTaskId, loaded, jobs, visible, pinned]);

  async function saveNextStep(job: HubJob, nextStep: string) {
    const next = await patchHubJob(job.id, { next_step: nextStep });
    if (next) setOverrides((o) => ({ ...o, [job.id]: { ...job, ...next, tasks: job.tasks } }));
    setEditingNextStep(null);
  }

  async function changePhase(job: HubJob, phase: ApplicationStage) {
    const applicationId = applicationIds[job.id] ?? job.application_id;
    if (!applicationId) return;
    const saved = await updateApplication(applicationId, { stage: phase });
    if (saved) setApplicationStages((current) => ({ ...current, [job.id]: saved.stage }));
  }

  if (!loaded) {
    return <div className="py-16 text-center text-sm text-muted">Loading tasks…</div>;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Tasks</h1>
        <div className="flex rounded-lg border border-line bg-surface p-0.5" role="tablist" aria-label="Task view">
          <button type="button" role="tab" aria-selected={view === "tasks"} onClick={() => setView("tasks")} className={cn("rounded-md px-2.5 py-1.5 text-xs", view === "tasks" ? "bg-ink text-white" : "text-muted")}>My tasks</button>
          <button type="button" role="tab" aria-selected={view === "jobs"} onClick={() => setView("jobs")} className={cn("rounded-md px-2.5 py-1.5 text-xs", view === "jobs" ? "bg-ink text-white" : "text-muted")}>By job</button>
        </div>
        <TaskRemindersPanel />
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
      {missingTask && <p className="text-sm text-amber-800">{missingTask}</p>}
      {showFilter && (
        <div className="flex flex-wrap items-center gap-3 border-y border-line bg-bg px-1 py-3">
          <div className="flex items-center gap-2 text-sm text-muted">
            Completion
            <div className="flex rounded-lg border border-line bg-surface p-0.5" role="tablist" aria-label="Task completion">
              {(["all", "incomplete", "completed"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={completion === key}
                  onClick={() => setCompletion(key)}
                  className={cn("rounded-md px-2.5 py-1.5 text-xs font-medium", completion === key ? "bg-ink text-white" : "text-muted hover:text-ink")}
                >
                  {key === "all" ? "All" : key === "incomplete" ? "Incomplete" : "Completed"}
                </button>
              ))}
            </div>
          </div>
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
          <label className="flex items-center gap-2 text-sm text-muted">
            Next step
            <PopoverSelect
              value={hasNextStep}
              onChange={(v) => setHasNextStep(v as "all" | "yes" | "no")}
              aria-label="Next step"
              className="w-36"
              options={[
                { value: "all", label: "All" },
                { value: "yes", label: "Added" },
                { value: "no", label: "Not added" },
              ]}
            />
          </label>
        </div>
      )}
      {visible.length === 0 ? (
        <Card>
          <CardTitle>No tasks</CardTitle>
          <CardSub className="mt-2">
            Tasks appear when a job has a checklist item. Next steps are optional actions attached
            to a task and can be filtered separately.
          </CardSub>
        </Card>
      ) : view === "tasks" ? (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line bg-bg text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Task</th><th className="px-3 py-2">Due</th><th className="px-3 py-2">Phase</th><th className="px-3 py-2">Application</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
            <tbody>
              {taskRows.map((row) => {
                const urgency = taskDueUrgency(row.dueAt);
                return <tr key={row.id} className="border-b border-line last:border-0 hover:bg-bg/70">
                  <td className="px-3 py-3"><div className="flex items-center gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center">{row.task ? <input type="checkbox" title={row.task.done ? "Mark task incomplete" : "Mark task complete"} aria-label={row.task.done ? `Mark ${row.title} incomplete` : `Mark ${row.title} complete`} checked={row.task.done} onChange={() => void patchJobTask(row.job.id, row.task!.id, { done: !row.task!.done }).then((saved) => { if (saved) setOverrides((o) => ({ ...o, [row.job.id]: { ...row.job, tasks: row.job.tasks?.map((task) => task.id === row.task!.id ? saved : task) } })); })} /> : null}</span><span className={cn("font-medium text-ink", row.task?.done && "text-muted line-through")}>{row.title}</span>{row.task?.done && <span className="text-[11px] text-muted">Completed</span>}{editingNextStep === row.job.id ? <input autoFocus value={nextStepDraft} onChange={(event) => setNextStepDraft(event.target.value)} onBlur={() => void saveNextStep(row.job, nextStepDraft)} onKeyDown={(event) => { if (event.key === "Enter") void saveNextStep(row.job, nextStepDraft); if (event.key === "Escape") setEditingNextStep(null); }} aria-label="Next step note" className="h-6 w-44 rounded-full border border-amber-300 bg-amber-50 px-2 text-[11px] text-amber-900" /> : <button type="button" onClick={() => { setEditingNextStep(row.job.id); setNextStepDraft(row.job.next_step ?? ""); }} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100">{row.job.next_step ? `Next step: ${row.job.next_step}` : "Add next step"}</button>}</div></td>
                  <td className="px-3 py-3"><span className={cn("rounded-full px-2 py-0.5 text-xs", urgency === "overdue" ? "bg-stone-100 text-stone-700" : urgency === "today" ? "bg-amber-50 text-amber-800" : "text-muted")}>{row.dueAt ? dateInputValue(row.dueAt) : "No date"}</span></td>
                  <td className="px-3 py-3">
                    {row.phase === "not_started" ? (
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", PHASE_CHIP[row.phase])}>{PHASE_LABEL[row.phase]}</span>
                    ) : (
                      <select
                        value={row.phase}
                        onChange={(event) => void changePhase(row.job, event.target.value as ApplicationStage)}
                        aria-label={`Change phase for ${row.job.title}`}
                        className={cn("rounded-full border-0 px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-brand/30", PHASE_CHIP[row.phase])}
                      >
                        {APPLICATION_PHASES.map((phase) => (
                          <option key={phase} value={phase} disabled={phaseOptionDisabled(row.phase as ApplicationStage, phase)}>{PHASE_LABEL[phase]}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-3"><button type="button" className="text-left text-ink hover:underline" onClick={() => { setPinned(row.job); setView("jobs"); }}>{row.job.title}<span className="block text-xs text-muted">{row.job.company}</span></button></td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {row.job.job_url ? (
                        <SourceActionLink url={row.job.job_url} job_url={row.job.job_url} />
                      ) : null}
                      <button type="button" className="text-xs text-muted underline" onClick={() => { setPinned(row.job); setView("jobs"); }}>Open job</button>
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
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
                          {applicationStages[row.id] ? (
                            <select
                              value={applicationStages[row.id]}
                              onChange={(event) => void changePhase(row, event.target.value as ApplicationStage)}
                              aria-label={`Change phase for ${row.title}`}
                              className={cn("rounded-full border-0 px-2 py-1 text-[11px] font-medium focus:ring-2 focus:ring-brand/30", PHASE_CHIP[applicationStages[row.id]!])}
                            >
                              {APPLICATION_PHASES.map((phase) => (
                                <option key={phase} value={phase} disabled={phaseOptionDisabled(applicationStages[row.id]!, phase)}>{PHASE_LABEL[phase]}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", PHASE_CHIP.not_started)}>{PHASE_LABEL.not_started}</span>
                          )}
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
                          <SourceActionLink
                            variant="primary"
                            url={row.job_url}
                            job_url={row.job_url}
                          />
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
                        highlightTaskId={focusJobId === row.id ? focusTaskId : ""}
                        onChange={(tasks) =>
                          setOverrides((o) => ({ ...o, [j.id]: { ...(o[j.id] ?? row), tasks } }))
                        }
                      />
                      <JobContact jobId={row.id} contact={row.contact} />
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
