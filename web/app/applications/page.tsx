"use client";

import { useEffect, useMemo, useState } from "react";

import { type Column, DataTable } from "@/components/DataTable";
import { LocalSetupGuide } from "@/components/LocalSetupGuide";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { PopoverSelect } from "@/components/ui/popover-select";
import {
  type Application,
  type ApplicationStage,
  deleteApplication,
  getApplications,
  getApplicationStats,
  updateApplication,
} from "@/lib/api";
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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" x2="12" y1="15" y2="3" />
        </svg>
        Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-line bg-surface shadow-lg overflow-hidden">
            <button
              onClick={() => download("csv")}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-bg transition-colors"
            >
              <span className="text-xs font-mono text-muted">CSV</span>
              Spreadsheet
            </button>
            <button
              onClick={() => download("json")}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-bg transition-colors border-t border-line"
            >
              <span className="text-xs font-mono text-muted">JSON</span>
              Raw data
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const STAGES: ApplicationStage[] = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "archived",
];

const STAGE_STYLES: Record<ApplicationStage, string> = {
  saved: "bg-stone-200 text-stone-700",
  applied: "bg-sky-100 text-sky-700",
  interviewing: "bg-violet-100 text-violet-700",
  offer: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  archived: "bg-stone-100 text-stone-500",
};

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [apiDown, setApiDown] = useState(false);
  const [filter, setFilter] = useState<ApplicationStage | "all">("all");
  const [query, setQuery] = useState("");

  async function refresh() {
    const [list, st] = await Promise.all([getApplications(undefined, 500), getApplicationStats()]);
    setApps(list);
    setStats(st);
  }

  useEffect(() => {
    Promise.all([getApplications(undefined, 500), getApplicationStats()])
      .then(([list, st]) => {
        // getApplications returns [] on API-down; distinguish via stats call.
        if (list.length === 0 && Object.keys(st).length === 0) setApiDown(true);
        setApps(list);
        setStats(st);
      })
      .finally(() => setLoaded(true));
  }, []);

  async function onStage(id: string, stage: ApplicationStage) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, stage } : a)));
    const ok = await updateApplication(id, { stage });
    if (ok) void refresh();
  }

  async function onDelete(id: string) {
    setApps((prev) => prev.filter((a) => a.id !== id));
    await deleteApplication(id);
    void refresh();
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => {
      if (filter !== "all" && a.stage !== filter) return false;
      if (!q) return true;
      return [a.title, a.employer, a.location, a.source].join(" ").toLowerCase().includes(q);
    });
  }, [apps, filter, query]);

  const columns: Column<Application>[] = [
    {
      key: "title",
      header: "Role",
      sortValue: (a) => a.title.toLowerCase(),
      render: (a) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{a.title || "Untitled"}</div>
          <div className="text-xs text-muted">
            {[a.employer, a.location].filter(Boolean).join(" · ")}
          </div>
        </div>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      sortValue: (a) => STAGES.indexOf(a.stage),
      render: (a) => (
        <PopoverSelect
          value={a.stage}
          onChange={(v) => onStage(a.id, v as ApplicationStage)}
          aria-label={`Stage for ${a.title}`}
          options={STAGES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))}
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
      key: "deadline",
      header: "Deadline",
      sortValue: (a) => a.deadline || "9999",
      render: (a) => {
        if (!a.deadline) return <span className="text-muted">—</span>;
        const t = Date.parse(a.deadline);
        if (Number.isNaN(t)) return <span className="text-muted text-xs">{a.deadline}</span>;
        const days = Math.ceil((t - Date.now()) / 86_400_000);
        if (days < 0)
          return (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
              passed
            </span>
          );
        return (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              days === 0
                ? "bg-red-100 text-red-700"
                : days <= 3
                  ? "bg-red-50 text-red-600"
                  : days <= 7
                    ? "bg-amber-100 text-amber-700"
                    : "bg-stone-100 text-stone-600",
            )}
          >
            {days === 0 ? "today" : `${days}d`}
          </span>
        );
      },
    },
    {
      key: "updated_at",
      header: "Updated",
      sortValue: (a) => a.updated_at,
      render: (a) => (
        <span className="text-xs text-muted">{a.updated_at.slice(0, 10)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-24",
      render: (a) => (
        <div className="flex items-center gap-2">
          {a.url && (
            <a
              href={externalUrl(a.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline"
              title="Open posting"
            >
              ↗
            </a>
          )}
          <button
            onClick={() => onDelete(a.id)}
            className="text-muted transition-colors hover:text-red-600"
            title="Delete"
            aria-label={`Delete ${a.title}`}
          >
            ✕
          </button>
        </div>
      ),
    },
  ];

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
          Your whole pipeline in one place — track every role from saved to offer.
        </p>
      </header>

      {/* Funnel */}
      <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {STAGES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter((f) => (f === s ? "all" : s))}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              filter === s ? "border-ink bg-bg" : "border-line bg-surface hover:border-ink/30",
            )}
          >
            <div className="text-2xl font-bold text-ink">{stats[s] ?? 0}</div>
            <div className="text-xs capitalize text-muted">{s}</div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search role, employer, location…"
          className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm placeholder:text-muted/70 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        />
        {filter !== "all" && (
          <button
            onClick={() => setFilter("all")}
            className="text-sm text-brand hover:underline"
          >
            Clear filter ({filter})
          </button>
        )}
        <span className="ml-auto text-sm text-muted">{visible.length} shown</span>
        <ExportMenu count={apps.length} />
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        getRowKey={(a) => a.id}
        initialSortKey="updated_at"
        initialSortDir="desc"
        empty={
          <Card className="grid min-h-[12rem] place-items-center text-center">
            <div className="max-w-xs space-y-1">
              <CardTitle>No applications yet</CardTitle>
              <CardSub>
                Collect roles from{" "}
                <a href="/search" className="text-brand hover:underline">
                  Collect Jobs
                </a>{" "}
                and track them in Job Pool.
              </CardSub>
            </div>
          </Card>
        }
      />
    </div>
  );
}
