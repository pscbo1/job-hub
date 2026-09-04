"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, CheckSquare, Compass } from "lucide-react";

import { getApplications, getJobs } from "@/lib/api";
import { todaySuggestions, todayWorkspaceState, type TodayKind } from "@/lib/today";

const ICONS: Record<TodayKind, typeof BriefcaseBusiness> = {
  collect: BriefcaseBusiness,
  sources: Compass,
  tasks: CheckSquare,
  applications: BriefcaseBusiness,
  discover: Compass,
};

export default function TodayPage() {
  const [suggestions, setSuggestions] = useState(todaySuggestions({
    hasJobs: false,
    hasApplications: false,
    hasTasks: false,
  }));
  const [stateLabel, setStateLabel] = useState("Getting started");

  useEffect(() => {
    const load = async () => {
      const [jobs, applications, taskJobs] = await Promise.all([
        getJobs(1),
        getApplications(undefined, 1, { view: "all" }),
        getJobs(1, undefined, "included", { view: "tasks" }),
      ]);
      const snapshot = {
        hasJobs: jobs.length > 0,
        hasApplications: applications.length > 0,
        hasTasks: taskJobs.length > 0,
      };
      setStateLabel(todayWorkspaceState(snapshot).label);
      setSuggestions(todaySuggestions(snapshot));
    };
    void load();
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-ink">Today</h1>
          <span className="rounded border border-line px-2 py-1 text-xs text-muted">{stateLabel}</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          Suggested next steps. They do not change your records.
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        {suggestions.map(({ href, label, detail, kind }) => {
          const Icon = ICONS[kind];
          return (
            <Link
              key={href}
              href={href}
              className="group rounded-lg border border-line bg-surface p-5 transition-colors hover:border-brand/50 hover:bg-brand/[0.03]"
            >
              <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
              <h2 className="mt-5 flex items-center gap-2 font-medium text-ink">
                {label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{detail}</p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
