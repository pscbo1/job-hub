"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LocalSetupGuide } from "@/components/LocalSetupGuide";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import {
  type Application,
  type ApplicationAnalytics,
  type ApplicationStage,
  type GeneratedDocument,
  getApplicationAnalytics,
  getApplications,
  getApplicationStats,
  getDocuments,
  getJobs,
  getSources,
  type HubJob,
  type JobSourceStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const STAGES: ApplicationStage[] = [
  "draft",
  "applied",
  "interview",
  "offer",
  "closed",
];

export default function DashboardPage() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [apps, setApps] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<HubJob[]>([]);
  const [docs, setDocs] = useState<GeneratedDocument[]>([]);
  const [sources, setSources] = useState<JobSourceStatus[]>([]);
  const [analytics, setAnalytics] = useState<ApplicationAnalytics | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    Promise.all([
      getApplicationStats(),
      getApplications(undefined, 100),
      getJobs(100),
      getDocuments(undefined, 100),
      getSources(),
      getApplicationAnalytics(),
    ])
      .then(([st, ap, jb, dc, sr, an]) => {
        if (sr === null && Object.keys(st).length === 0) setApiDown(true);
        setStats(st);
        setApps(ap);
        setJobs(jb);
        setDocs(dc);
        setSources(sr?.sources ?? []);
        setAnalytics(an);
      })
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) {
    return <div className="mx-auto max-w-5xl px-5 py-20 text-center text-muted">Loading…</div>;
  }
  if (apiDown) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <LocalSetupGuide context="Your career dashboard" />
      </div>
    );
  }

  const total = stats.total ?? 0;
  const active = (stats.applied ?? 0) + (stats.interview ?? 0);
  const deadlines: { j: HubJob; d: number }[] = [];
  const recentApps = [...apps]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);
  const recentDocs = [...docs]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);
  const activeSources = sources.filter((s) => s.enabled && s.configured);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Your whole search at a glance — pipeline, deadlines, and what the engine has produced.
        </p>
      </header>

      {/* Headline stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tracked roles" value={total} />
        <Stat label="Active (applied + interview)" value={active} />
        <Stat label="Offers" value={stats.offer ?? 0} accent="text-emerald-600" />
        <Stat label="Documents built" value={docs.length} />
      </div>

      {/* Pipeline funnel */}
      <Card className="mb-6">
        <CardTitle className="text-base">Pipeline</CardTitle>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {STAGES.map((s) => (
            <Link
              key={s}
              href="/applications"
              className="rounded-lg border border-line bg-bg p-2.5 text-center transition-colors hover:border-ink/30"
            >
              <div className="text-xl font-bold text-ink">{stats[s] ?? 0}</div>
              <div className="text-[11px] capitalize text-muted">{s}</div>
            </Link>
          ))}
        </div>
      </Card>

      {/* Analytics band — only shown when there's data */}
      {analytics && (analytics.funnel.length > 0 || analytics.weekly_volume.length > 0) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {/* Overall response rate */}
          <Card className="flex flex-col items-center justify-center py-5 text-center">
            <div className="text-4xl font-bold text-ink">
              {analytics.overall_response_rate !== null
                ? `${analytics.overall_response_rate.toFixed(0)}%`
                : "—"}
            </div>
            <div className="mt-1 text-xs text-muted">Overall response rate</div>
            <div className="mt-0.5 text-[11px] text-muted/70">
              interview + offers ÷ applied
            </div>
          </Card>

          {/* Funnel conversion bars */}
          <Card className="sm:col-span-2">
            <CardTitle className="text-base">Funnel conversion</CardTitle>
            <div className="mt-3 space-y-2">
              {analytics.funnel
                .filter((e) => e.pct_of_applied !== null)
                .map((e) => (
                  <div key={e.stage}>
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="capitalize text-ink">{e.stage}</span>
                      <span className="text-muted">
                        {e.pct_of_applied!.toFixed(0)}% of applied
                        <span className="ml-1.5 text-muted/60">({e.count})</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          e.stage === "offer"
                            ? "bg-emerald-500"
                            : e.stage === "closed"
                              ? "bg-red-400"
                              : "bg-brand",
                        )}
                        style={{ width: `${Math.min(e.pct_of_applied!, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
            {analytics.funnel.filter((e) => e.pct_of_applied !== null).length === 0 && (
              <CardSub className="mt-3">Apply to roles to see conversion rates.</CardSub>
            )}
          </Card>
        </div>
      )}

      {/* Weekly volume sparkline — only shown when data exists */}
      {analytics && analytics.weekly_volume.length > 1 && (
        <Card className="mb-6">
          <CardTitle className="text-base">Applications per week</CardTitle>
          <WeeklySparkline data={analytics.weekly_volume} />
        </Card>
      )}

      {/* Response rate by source — only shown when data exists */}
      {analytics && analytics.by_source.length > 0 && (
        <Card className="mb-6">
          <CardTitle className="text-base">Response rate by source</CardTitle>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {analytics.by_source
              .filter((s) => s.applied > 0)
              .sort((a, b) => (b.response_rate ?? 0) - (a.response_rate ?? 0))
              .map((s) => (
                <div
                  key={s.source}
                  className="flex items-center justify-between rounded-lg border border-line bg-bg px-3 py-2"
                >
                  <div>
                    <div className="text-sm capitalize text-ink">{s.source}</div>
                    <div className="text-[11px] text-muted">
                      {s.responded}/{s.applied} responded
                    </div>
                  </div>
                  <div
                    className={cn(
                      "text-lg font-bold",
                      (s.response_rate ?? 0) >= 30
                        ? "text-emerald-600"
                        : (s.response_rate ?? 0) >= 10
                          ? "text-amber-600"
                          : "text-muted",
                    )}
                  >
                    {s.response_rate !== null ? `${s.response_rate.toFixed(0)}%` : "—"}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Deadlines */}
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Closing soon</CardTitle>
            <Link href="/jobs" className="text-xs text-brand hover:underline">
              All jobs →
            </Link>
          </div>
          {deadlines.length === 0 ? (
            <CardSub className="mt-3">No deadlines within three weeks.</CardSub>
          ) : (
            <ul className="mt-3 space-y-2">
              {deadlines.map(({ j, d }) => (
                <li key={j.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink">
                    {j.title} <span className="text-muted">· {j.company}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      (d ?? 99) <= 7 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700",
                    )}
                  >
                    {d === 0 ? "today" : `${d}d`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent activity */}
        <Card>
          <CardTitle className="text-base">Recent activity</CardTitle>
          {recentApps.length === 0 && recentDocs.length === 0 ? (
            <CardSub className="mt-3">
              Nothing yet — find roles on{" "}
              <Link href="/search" className="text-brand hover:underline">Collect Jobs</Link>.
            </CardSub>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {recentApps.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-ink">{a.title}</span>
                  <span className="shrink-0 text-xs capitalize text-muted">{a.stage}</span>
                </li>
              ))}
              {recentDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-muted">
                    📄 {d.title || d.label || "Document"}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{d.created_at.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Source health */}
        <Card>
          <CardTitle className="text-base">Job sources</CardTitle>
          <CardSub className="mt-1">{activeSources.length} active</CardSub>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <span
                key={s.id}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  s.enabled && s.configured
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : s.enabled && !s.configured
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-line bg-bg text-muted",
                )}
                title={
                  s.enabled && !s.configured ? "Enabled but needs an API key" : undefined
                }
              >
                {s.label}
              </span>
            ))}
          </div>
          <Link href="/company-sources" className="mt-3 inline-block text-xs text-brand hover:underline">
            Manage sources →
          </Link>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardTitle className="text-base">Quick actions</CardTitle>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { href: "/search", label: "Collect Jobs" },
              { href: "/studio", label: "Tailor a résumé" },
              { href: "/applications", label: "Update pipeline" },
              { href: "/profile", label: "Edit profile" },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="rounded-lg border border-line bg-bg px-3 py-2.5 text-center text-sm font-medium text-ink transition-colors hover:border-ink/30 hover:bg-surface"
              >
                {a.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <Card className="p-4">
      <div className={cn("text-3xl font-bold text-ink", accent)}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </Card>
  );
}

function WeeklySparkline({ data }: { data: { week: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const W = 40; // bar slot width px
  const H = 64; // chart height px
  const GAP = 6;
  const BAR_W = W - GAP;

  return (
    <div className="mt-3 overflow-x-auto">
      <div className="flex items-end gap-0" style={{ height: H + 24 }}>
        {data.map((d, i) => {
          const barH = Math.max(4, Math.round((d.count / max) * H));
          return (
            <div
              key={d.week}
              className="flex flex-col items-center"
              style={{ width: W, flexShrink: 0 }}
            >
              <span className="mb-1 text-[10px] text-muted">{d.count}</span>
              <div
                className={cn(
                  "rounded-t-sm",
                  i === data.length - 1 ? "bg-brand" : "bg-brand/40",
                )}
                style={{ width: BAR_W, height: barH }}
                title={`${d.week}: ${d.count}`}
              />
              <span
                className="mt-1 text-[9px] text-muted/70"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: 36 }}
              >
                {d.week.replace(/^\d{4}-/, "")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
