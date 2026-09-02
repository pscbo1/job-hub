"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AddApplicationDialog } from "@/components/AddApplicationDialog";
import { ApplicationDrawer } from "@/components/ApplicationDrawer";
import { ApplicationRowActions } from "@/components/ApplicationRowActions";
import { ApplicationViewOptions } from "@/components/ApplicationViewOptions";
import { type Column, DataTable } from "@/components/DataTable";
import { LocalSetupGuide } from "@/components/LocalSetupGuide";
import { SubmitConfirm } from "@/components/SubmitConfirm";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { PopoverSelect } from "@/components/ui/popover-select";
import {
  type Application,
  type ApplicationStage,
  type HubJob,
  type IdleCleanupSettings,
  abandonApplication,
  closeApplication,
  getApplication,
  getApplications,
  getApplicationStats,
  getIdleCleanupSettings,
  listApplicationTags,
  putIdleCleanupSettings,
  updateApplication,
} from "@/lib/api";
import { type ApplicationDrawerTab, nextStepLabel, parseApplicationTab, tabQueryValue } from "@/lib/applicationUi";
import { applicationMatchesTags, uniqueApplicationTags } from "@/lib/applicationTags";
import { applicationWasSubmitted } from "@/lib/applicationLifecycle";
import { isDateOverdue } from "@/lib/jobPipeline";
import { currentMaterialCount, formatAppliedDate, materialCountLabel } from "@/lib/materialsUi";
import { manualApplicationHidden } from "@/lib/manualApplicationUi";
import { formatCalendarDate, todayInAppTz } from "@/lib/timezone";
import { cn } from "@/lib/utils";

import styles from "./page.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

function ExportMenu({ count }: { count: number }) {
  const [open, setOpen] = useState(false);

  function download(fmt: "csv" | "json") {
    setOpen(false);
    const a = document.createElement("a");
    a.href = `${API_BASE}/api/applications/export?fmt=${fmt}`;
    a.download = `applications.${fmt}`;
    a.click();
  }

  if (count === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm hover:border-ink/30 transition-colors"
        aria-label="Export applications"
      >
        Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
            <button onClick={() => download("csv")} className="flex w-full px-4 py-2.5 text-sm hover:bg-bg">
              CSV
            </button>
            <button onClick={() => download("json")} className="flex w-full border-t border-line px-4 py-2.5 text-sm hover:bg-bg">
              JSON
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const OPEN_STAGES: ApplicationStage[] = ["draft", "applied", "interview", "offer"];
const PIPELINE_STAGES: ApplicationStage[] = ["applied", "interview", "offer", "closed"];

const STAGE_STYLES: Record<ApplicationStage, string> = {
  draft: "bg-stone-200 text-stone-700",
  applied: "bg-sky-100 text-sky-700",
  interview: "bg-violet-100 text-violet-700",
  offer: "bg-emerald-100 text-emerald-700",
  closed: "bg-stone-100 text-stone-500",
};

type BoardView = "open" | "closed";

function replaceAppQuery(id: string | null, tab: ApplicationDrawerTab) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("id", id);
  else url.searchParams.delete("id");
  const tabValue = id ? tabQueryValue(tab) : null;
  if (tabValue) url.searchParams.set("tab", tabValue);
  else url.searchParams.delete("tab");
  url.searchParams.delete("job");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [apiDown, setApiDown] = useState(false);
  const [board, setBoard] = useState<BoardView>("open");
  const [staleOnly, setStaleOnly] = useState(false);
  const [stageFilter, setStageFilter] = useState<ApplicationStage | "all">("all");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ApplicationDrawerTab>("overview");
  const [submitId, setSubmitId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [idle, setIdle] = useState<IdleCleanupSettings>({ enabled: false, idle_days: 14 });
  const [fetchedApp, setFetchedApp] = useState<Application | null>(null);
  const [fetching, setFetching] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [createdToast, setCreatedToast] = useState<{ hidden: boolean } | null>(null);
  const addTriggerRef = useRef<HTMLButtonElement | null>(null);

  async function refresh() {
    const [list, catalog] = await Promise.all([
      getApplications(undefined, 500, {
        view: board,
        staleApplied: board === "open" && staleOnly,
      }),
      listApplicationTags(),
    ]);
    setApps(list);
    setKnownTags(catalog);
    setSelected([]);
  }

  useEffect(() => {
    void Promise.all([
      getApplications(undefined, 500, { view: "open" }),
      getApplicationStats(),
      getIdleCleanupSettings(),
      listApplicationTags(),
    ])
      .then(([list, st, settings, catalog]) => {
        if (list.length === 0 && Object.keys(st).length === 0) setApiDown(true);
        setApps(list);
        setIdle(settings);
        setKnownTags(catalog);
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job");
    const id = params.get("id");
    setActiveTab(parseApplicationTab(params.get("tab")));
    if (id) setActiveId(id);
    if (jobId) {
      void getApplications(undefined, 500, { view: "all" }).then((list) => {
        const match = list.find((a) => a.job_id === jobId);
        if (match) {
          setActiveId(match.id);
          replaceAppQuery(match.id, parseApplicationTab(params.get("tab")));
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    void refresh();
  }, [board, staleOnly]);

  useEffect(() => {
    if (!activeId) {
      setFetchedApp(null);
      setFetching(false);
      return;
    }
    const inList = apps.find((row) => row.id === activeId);
    if (inList) {
      setFetchedApp(null);
      setFetching(false);
      return;
    }
    let cancelled = false;
    setFetching(true);
    void getApplication(activeId).then((row) => {
      if (cancelled) return;
      setFetchedApp(row);
      setFetching(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, apps]);

  function openApp(id: string, tab: ApplicationDrawerTab = "overview") {
    setActiveId(id);
    setActiveTab(tab);
    replaceAppQuery(id, tab);
  }

  function closeDrawer() {
    setActiveId(null);
    setActiveTab("overview");
    setFetchedApp(null);
    replaceAppQuery(null, "overview");
  }

  function openAdd(event: React.MouseEvent<HTMLButtonElement>) {
    addTriggerRef.current = event.currentTarget;
    setAddOpen(true);
  }

  function closeAdd() {
    setAddOpen(false);
    requestAnimationFrame(() => addTriggerRef.current?.focus());
  }

  function showCreated(created: { job: HubJob; application: Application }) {
    const hidden = manualApplicationHidden(created.application, {
      board,
      staleOnly,
      stage: stageFilter,
      source: sourceFilter,
      query,
      selectedTags,
    });
    setApps((current) => [
      created.application,
      ...current.filter((row) => row.id !== created.application.id),
    ]);
    setCreatedToast({ hidden });
    setAddOpen(false);
    openApp(created.application.id, "overview");
  }

  function showCreatedInList() {
    setBoard("open");
    setStaleOnly(false);
    setStageFilter("all");
    setSourceFilter("");
    setSelectedTags([]);
    setQuery("");
    setCreatedToast({ hidden: false });
  }

  async function onStage(id: string, stage: ApplicationStage) {
    const row = apps.find((a) => a.id === id);
    if (!row) return;
    if (row.stage === "draft" && stage !== "draft") return;
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, stage } : a)));
    const ok = await updateApplication(id, { stage });
    if (ok) void refresh();
  }

  async function onCancelDraft(id: string) {
    const row = apps.find((a) => a.id === id) ?? fetchedApp;
    if (!row || applicationWasSubmitted(row)) return;
    if (!window.confirm("Cancel this draft? Materials already in the library are kept.")) return;
    setApps((prev) => prev.filter((a) => a.id !== id));
    await abandonApplication(id);
    if (activeId === id) closeDrawer();
    void refresh();
  }

  async function onCloseSelected() {
    const ids = selected.slice();
    for (const id of ids) {
      const row = apps.find((a) => a.id === id);
      if (row?.exclude_from_idle) continue;
      await closeApplication(id);
    }
    void refresh();
  }

  const sources = useMemo(
    () => [...new Set(apps.map((a) => a.source).filter(Boolean))].sort(),
    [apps],
  );
  const availableTags = useMemo(() => uniqueApplicationTags(apps), [apps]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => {
      if (staleOnly && a.exclude_from_idle) return false;
      if (stageFilter !== "all" && a.stage !== stageFilter) return false;
      if (sourceFilter && a.source !== sourceFilter) return false;
      if (!applicationMatchesTags(a, selectedTags)) return false;
      if (!q) return true;
      return [a.title, a.employer, a.location, a.source, a.notes, a.next_step].join(" ").toLowerCase().includes(q);
    });
  }, [apps, stageFilter, sourceFilter, query, staleOnly, selectedTags]);

  const requestedApp = apps.find((a) => a.id === activeId) ?? fetchedApp;
  const submitApp =
    (submitId && apps.find((a) => a.id === submitId)) ||
    (submitId && fetchedApp?.id === submitId ? fetchedApp : null) ||
    (submitId && requestedApp?.id === submitId ? requestedApp : null);

  const columns: Column<Application>[] = [
    {
      key: "select",
      header: "",
      headerClassName: "!px-3",
      className: "!px-3",
      render: (a) =>
        staleOnly && !a.exclude_from_idle ? (
          <input
            type="checkbox"
            checked={selected.includes(a.id)}
            onChange={(e) =>
              setSelected((ids) =>
                e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id),
              )
            }
            aria-label={`Select ${a.title}`}
          />
        ) : null,
    },
    {
      key: "title",
      header: "Role / Company",
      sortValue: (a) => a.title.toLowerCase(),
      render: (a) => (
        <button type="button" className="min-w-0 text-left" onClick={() => openApp(a.id, "overview")}>
          <div className="font-medium text-ink">{a.title || "Untitled"}</div>
          <div className="text-xs text-muted">{[a.employer, a.location].filter(Boolean).join(" · ")}</div>
        </button>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      headerClassName: "!px-2 whitespace-nowrap",
      className: "!px-1 whitespace-nowrap",
      sortValue: (a) => ["draft", "applied", "interview", "offer", "closed"].indexOf(a.stage),
      render: (a) => (
        <PopoverSelect
          value={a.stage}
          onChange={(v) => onStage(a.id, v as ApplicationStage)}
          aria-label={`Stage for ${a.title}`}
          options={(a.stage === "draft" ? (["draft"] as ApplicationStage[]) : PIPELINE_STAGES).map(
            (s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }),
          )}
          className={cn(
            "h-8 min-w-[110px] border-0 px-3 pr-8 text-xs font-medium capitalize shadow-none",
            STAGE_STYLES[a.stage],
          )}
        />
      ),
    },
    {
      key: "next_step",
      header: "Next step",
      sortValue: (a) => `${a.next_step ?? ""}${a.job_deadline ?? ""}`,
      render: (a) => {
        const overdue = isDateOverdue(a.job_deadline, todayInAppTz());
        return (
          <button
            type="button"
            className="w-full min-w-0 text-left"
            onClick={() => openApp(a.id, "overview")}
          >
            <div className="break-words text-sm text-ink">{nextStepLabel(a.next_step)}</div>
            {a.job_deadline ? (
              <div className={cn("text-xs", overdue ? "text-amber-800" : "text-muted")}>
                DDL {formatCalendarDate(a.job_deadline)}
              </div>
            ) : null}
          </button>
        );
      },
    },
    {
      key: "applied_date",
      header: "Applied",
      headerClassName: "!px-2 whitespace-nowrap",
      className: "!px-2 whitespace-nowrap",
      sortValue: (a) => a.applied_date || "",
      render: (a) => <span className="text-muted">{formatAppliedDate(a.applied_date)}</span>,
    },
    {
      key: "materials",
      header: "Materials",
      headerClassName: "whitespace-nowrap",
      className: "whitespace-nowrap",
      sortValue: (a) => currentMaterialCount(a),
      render: (a) => (
        <button
          type="button"
          className="text-left text-sm text-ink hover:underline"
          onClick={() => openApp(a.id, "materials")}
        >
          {materialCountLabel(currentMaterialCount(a))}
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "!px-[6px] text-right",
      className: "!px-[6px] text-right",
      render: (a) => (
        <ApplicationRowActions
          app={a}
          onSubmit={(id) => setSubmitId(id)}
          onCancelDraft={(id) => void onCancelDraft(id)}
        />
      ),
    },
  ];

  const idleLabel = `No update ${idle.idle_days}d+`;

  if (!loaded) {
    return <div className="mx-auto max-w-5xl px-5 py-20 text-center text-muted">Loading…</div>;
  }
  if (apiDown) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <LocalSetupGuide context="Your application pipeline" />
      </div>
    );
  }

  return (
    <div className={cn("mx-auto max-w-[1280px] px-5 py-12", styles.page)}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Applications</h1>
          <p className="mt-1 text-sm text-muted">
            Track applications, next steps, and the materials you send.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="h-9 rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm"
        >
          Add application
        </button>
      </header>

      <div className={cn("mb-4", styles.toolbar)}>
        <div className={styles.searchGroup}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search role, employer, location…"
            className={cn(
              "h-9 rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm",
              styles.search,
            )}
          />
        </div>
        <div className={styles.filters}>
          <PopoverSelect
            value={stageFilter}
            onChange={(v) => setStageFilter(v as ApplicationStage | "all")}
            aria-label="Stage"
            className="h-9 w-36"
            options={[
              { value: "all", label: "All stages" },
              ...(board === "closed" ? (["closed"] as ApplicationStage[]) : OPEN_STAGES).map(
                (s) => ({
                  value: s,
                  label: s[0].toUpperCase() + s.slice(1),
                }),
              ),
            ]}
          />
          <PopoverSelect
            value={sourceFilter}
            onChange={setSourceFilter}
            aria-label="Source"
            className="h-9 w-40"
            options={[
              { value: "", label: "All sources" },
              ...sources.map((s) => ({ value: s, label: s })),
            ]}
          />
        </div>
        <div className={styles.actions}>
          {staleOnly && selected.length > 0 && (
            <button
              type="button"
              onClick={() => void onCloseSelected()}
              className="h-9 whitespace-nowrap rounded-lg border border-ink bg-ink px-3 text-sm text-white"
            >
              Close selected ({selected.length})
            </button>
          )}
          <span className={cn("text-sm text-muted", styles.count)}>{visible.length} shown</span>
          <ApplicationViewOptions
            board={board}
            staleOnly={staleOnly}
            idle={idle}
            idleLabel={idleLabel}
            availableTags={availableTags}
            selectedTags={selectedTags}
            onOpen={() => {
              setBoard("open");
              setStaleOnly(false);
              setStageFilter("all");
            }}
            onClosed={() => {
              setBoard("closed");
              setStaleOnly(false);
              setStageFilter("all");
            }}
            onStale={() => {
              setBoard("open");
              setStaleOnly(true);
              setStageFilter("all");
            }}
            onIdleChange={(next) => {
              setIdle(next);
              void putIdleCleanupSettings(next).then(() => refresh());
            }}
            onToggleTag={(tag) =>
              setSelectedTags((current) =>
                current.includes(tag)
                  ? current.filter((item) => item !== tag)
                  : [...current, tag],
              )
            }
          />
          <ExportMenu count={apps.length} />
        </div>
      </div>

      {(board !== "open" || staleOnly) && (
        <p className="mb-3 text-xs text-muted">
          {board === "closed" ? "Viewing closed history." : `Viewing ${idleLabel}.`}
          {staleOnly
            ? ` Exempt applications stay out of ${idleLabel}. Use More in the application drawer to exclude from idle cleanup.`
            : ""}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              setBoard("open");
              setStaleOnly(false);
            }}
          >
            Back to Open
          </button>
        </p>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        getRowKey={(a) => a.id}
        tableClassName={styles.table}
        colGroup={
          <colgroup>
            <col className={styles.selectColumn} />
            <col className={styles.roleColumn} />
            <col className={styles.stageColumn} />
            <col className={styles.nextStepColumn} />
            <col className={styles.appliedColumn} />
            <col className={styles.materialsColumn} />
            <col className={styles.actionsColumn} />
          </colgroup>
        }
        initialSortKey="title"
        initialSortDir="asc"
        empty={
          <Card className="grid min-h-[12rem] place-items-center text-center">
            <div className="max-w-xs space-y-1">
              <CardTitle>No applications</CardTitle>
              <CardSub>
                Add an opportunity you found, or start an application from Discover.
              </CardSub>
              <button
                type="button"
                onClick={openAdd}
                className="mt-3 h-9 rounded-lg bg-brand px-4 text-sm font-medium text-white"
              >
                Add application
              </button>
            </div>
          </Card>
        }
      />

      {activeId && (
        <ApplicationDrawer
          requestedApp={requestedApp}
          requestedTab={activeTab}
          loading={fetching && !requestedApp}
          missing={!fetching && !requestedApp}
          onClose={closeDrawer}
          onStay={(id) => {
            setActiveId(id);
            replaceAppQuery(id, activeTab);
          }}
          onTabChange={(tab) => {
            setActiveTab(tab);
            if (activeId) replaceAppQuery(activeId, tab);
          }}
          onChanged={() => void refresh()}
          onSubmitRequest={(id) => setSubmitId(id)}
          onToggleIdleExempt={(app) =>
            void updateApplication(app.id, { exclude_from_idle: !app.exclude_from_idle }).then(() => refresh())
          }
          knownTags={knownTags}
        />
      )}

      {submitId && submitApp && (
        <SubmitConfirm
          app={submitApp}
          onClose={() => setSubmitId(null)}
          onDone={() => {
            setSubmitId(null);
            void refresh();
          }}
        />
      )}

      {addOpen && <AddApplicationDialog onClose={closeAdd} onCreated={showCreated} />}

      {createdToast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-[120] max-w-sm rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-xl"
        >
          <div className="flex items-center gap-3">
            <span>
              {createdToast.hidden
                ? "Draft created. Hidden by current filters."
                : "Draft created."}
            </span>
            {createdToast.hidden && (
              <button type="button" onClick={showCreatedInList} className="font-medium underline">
                Show in list
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss Draft created message"
              onClick={() => setCreatedToast(null)}
              className="text-muted"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
