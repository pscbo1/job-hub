"use client";

import { useEffect, useMemo, useState } from "react";

import { type Column, DataTable } from "@/components/DataTable";
import { LocalSetupGuide } from "@/components/LocalSetupGuide";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { PopoverSelect } from "@/components/ui/popover-select";
import {
  type Application,
  type ApplicationStage,
  abandonApplication,
  closeApplication,
  getApplications,
  getApplicationStats,
  submitApplication,
  updateApplication,
} from "@/lib/api";
import { applicationWasSubmitted } from "@/lib/applicationLifecycle";
import { cn, externalUrl } from "@/lib/utils";

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

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [apiDown, setApiDown] = useState(false);
  const [board, setBoard] = useState<BoardView>("open");
  const [staleOnly, setStaleOnly] = useState(false);
  const [stageFilter, setStageFilter] = useState<ApplicationStage | "all">("all");
  const [sourceFilter, setSourceFilter] = useState("");
  const [query, setQuery] = useState("");
  const [notesId, setNotesId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  async function refresh() {
    const list = await getApplications(undefined, 500, {
      view: board,
      staleApplied: board === "open" && staleOnly,
    });
    setApps(list);
    setSelected([]);
  }

  useEffect(() => {
    void Promise.all([getApplications(undefined, 500, { view: "open" }), getApplicationStats()])
      .then(([list, st]) => {
        if (list.length === 0 && Object.keys(st).length === 0) setApiDown(true);
        setApps(list);
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    void refresh();
  }, [board, staleOnly]);

  async function onStage(id: string, stage: ApplicationStage) {
    const row = apps.find((a) => a.id === id);
    if (!row) return;
    if (row.stage === "draft" && stage !== "draft") return;
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, stage } : a)));
    const ok = await updateApplication(id, { stage });
    if (ok) void refresh();
  }

  async function onSubmit(id: string) {
    if (!window.confirm("Mark this application as submitted?")) return;
    const ok = await submitApplication(id);
    if (ok) void refresh();
  }

  async function onCancelDraft(id: string) {
    const row = apps.find((a) => a.id === id);
    if (!row || applicationWasSubmitted(row)) return;
    setApps((prev) => prev.filter((a) => a.id !== id));
    await abandonApplication(id);
    void refresh();
  }

  async function onCloseSelected() {
    const ids = selected.slice();
    for (const id of ids) {
      await closeApplication(id);
    }
    void refresh();
  }

  async function onNotes(id: string, notes: string) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, notes } : a)));
    await updateApplication(id, { notes });
  }

  const sources = useMemo(
    () => [...new Set(apps.map((a) => a.source).filter(Boolean))].sort(),
    [apps],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => {
      if (stageFilter !== "all" && a.stage !== stageFilter) return false;
      if (sourceFilter && a.source !== sourceFilter) return false;
      if (!q) return true;
      return [a.title, a.employer, a.location, a.source, a.notes].join(" ").toLowerCase().includes(q);
    });
  }, [apps, stageFilter, sourceFilter, query]);

  const columns: Column<Application>[] = [
    {
      key: "select",
      header: "",
      headerClassName: "w-8",
      render: (a) =>
        staleOnly ? (
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
      header: "Role",
      sortValue: (a) => a.title.toLowerCase(),
      render: (a) => (
        <button type="button" className="min-w-0 text-left" onClick={() => setNotesId(a.id)}>
          <div className="font-medium text-ink">{a.title || "Untitled"}</div>
          <div className="text-xs text-muted">{[a.employer, a.location].filter(Boolean).join(" · ")}</div>
        </button>
      ),
    },
    {
      key: "stage",
      header: "Stage",
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
      key: "source",
      header: "Source",
      sortValue: (a) => a.source.toLowerCase(),
      render: (a) =>
        a.source ? (
          <span className="rounded-full border border-line bg-bg px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
            {a.source}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "applied_date",
      header: "Applied",
      sortValue: (a) => a.applied_date || "",
      render: (a) => <span className="text-muted">{a.applied_date || "—"}</span>,
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-40",
      render: (a) => (
        <div className="flex flex-wrap items-center gap-2">
          {a.url && (
            <a href={externalUrl(a.url)} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
              Open source
            </a>
          )}
          {a.stage === "draft" && (
            <button type="button" onClick={() => onSubmit(a.id)} className="text-xs font-medium text-ink hover:underline">
              Mark submitted
            </button>
          )}
          {a.stage === "closed" && (
            <button type="button" onClick={() => onSubmit(a.id)} className="text-xs font-medium text-ink hover:underline">
              Reopen (mark submitted)
            </button>
          )}
          {!applicationWasSubmitted(a) && (
            <button
              type="button"
              onClick={() => onCancelDraft(a.id)}
              className="text-muted transition-colors hover:text-red-600"
              aria-label={`Cancel draft ${a.title}`}
            >
              Cancel draft
            </button>
          )}
        </div>
      ),
    },
  ];

  const notesRow = apps.find((a) => a.id === notesId) ?? null;

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
    <div className="mx-auto max-w-5xl px-5 py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Applications</h1>
        <p className="mt-1 text-sm text-muted">
          Start Application creates a draft. Mark submitted to enter Applied. Closed is history.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setBoard("open");
            setStaleOnly(false);
            setStageFilter("all");
          }}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            board === "open" && !staleOnly ? "border-ink bg-ink text-white" : "border-line text-muted",
          )}
        >
          Open
        </button>
        <button
          type="button"
          onClick={() => {
            setBoard("closed");
            setStaleOnly(false);
            setStageFilter("all");
          }}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            board === "closed" ? "border-ink bg-ink text-white" : "border-line text-muted",
          )}
        >
          Closed
        </button>
        {board === "open" && (
          <button
            type="button"
            onClick={() => setStaleOnly((v) => !v)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              staleOnly ? "border-amber-700 bg-amber-50 text-amber-900" : "border-line text-muted",
            )}
          >
            No update 14d+
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search role, employer, location…"
          className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm"
        />
        <PopoverSelect
          value={stageFilter}
          onChange={(v) => setStageFilter(v as ApplicationStage | "all")}
          aria-label="Stage"
          className="w-36"
          options={[
            { value: "all", label: "All stages" },
            ...(board === "closed" ? (["closed"] as ApplicationStage[]) : OPEN_STAGES).map((s) => ({
              value: s,
              label: s[0].toUpperCase() + s.slice(1),
            })),
          ]}
        />
        <PopoverSelect
          value={sourceFilter}
          onChange={setSourceFilter}
          aria-label="Source"
          className="w-40"
          options={[{ value: "", label: "All sources" }, ...sources.map((s) => ({ value: s, label: s }))]}
        />
        {staleOnly && selected.length > 0 && (
          <button
            type="button"
            onClick={() => void onCloseSelected()}
            className="h-9 rounded-lg border border-ink bg-ink px-3 text-sm text-white"
          >
            Close selected ({selected.length})
          </button>
        )}
        <span className="ml-auto text-sm text-muted">{visible.length} shown</span>
        <ExportMenu count={apps.length} />
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        getRowKey={(a) => a.id}
        initialSortKey="title"
        initialSortDir="asc"
        empty={
          <Card className="grid min-h-[12rem] place-items-center text-center">
            <div className="max-w-xs space-y-1">
              <CardTitle>No applications</CardTitle>
              <CardSub>
                Start an application from Discover. Search results cannot create a draft on their own.
              </CardSub>
            </div>
          </Card>
        }
      />

      {notesRow && (
        <div className="mt-4 rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Notes — {notesRow.title}</h2>
            <button type="button" onClick={() => setNotesId(null)} className="text-xs text-muted">
              Close
            </button>
          </div>
          <textarea
            defaultValue={notesRow.notes}
            onBlur={(e) => void onNotes(notesRow.id, e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-line bg-bg p-3 text-sm text-ink"
            placeholder="Optional notes. Close reasons can live here."
          />
        </div>
      )}
    </div>
  );
}
