"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, CheckSquare, Compass } from "lucide-react";

const emptySuggestions = [
  { href: "/search", label: "Open Collect Jobs", detail: "Find and review a few new roles.", icon: BriefcaseBusiness },
  { href: "/settings", label: "Explore and configure sources", detail: "Review available channels and set up the ones you use.", icon: Compass },
  { href: "/tasks", label: "Create a next step", detail: "Add a concrete task for a role you want to pursue.", icon: CheckSquare },
];

export default function TodayPage() {
  const [suggestions, setSuggestions] = useState(emptySuggestions);
  const [stateLabel, setStateLabel] = useState("Getting started");

  useEffect(() => {
    const load = async () => {
      const results = await Promise.all([
        fetch("http://127.0.0.1:8000/api/jobs?limit=1").then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch("http://127.0.0.1:8000/api/applications?limit=1").then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch("http://127.0.0.1:8000/api/tasks?limit=1").then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      const rawJobs = Array.isArray(results[0]) ? results[0] : results[0]?.items ?? [];
      const jobs = rawJobs.filter((job: { company?: string; title?: string }) => !(job.company === "Example Labs" && job.title === "Product Engineer"));
      const applications = Array.isArray(results[1]) ? results[1] : results[1]?.items ?? [];
      const tasks = Array.isArray(results[2]) ? results[2] : results[2]?.items ?? [];
      if (tasks.length) setStateLabel("Next steps");
      else if (applications.length) setStateLabel("Applications");
      else if (jobs.length) setStateLabel("Choose a role");
      else return;
      setSuggestions([
        ...(tasks.length ? [{ href: "/tasks", label: "Complete a next step", detail: "Work on the most important open task.", icon: CheckSquare }] : []),
        ...(applications.length ? [{ href: "/applications", label: "Move an application forward", detail: "Continue the application with the clearest next action.", icon: BriefcaseBusiness }] : []),
        ...(jobs.length ? [{ href: "/jobs", label: "Choose one role to pursue", detail: "Pick one opportunity and decide the next step.", icon: Compass }] : emptySuggestions),
      ].slice(0, 3));
    };
    void load();
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <header className="mb-8">
        <p className="text-sm font-medium text-muted">Job Hub</p>
        <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold tracking-tight text-ink">Today</h1><span className="rounded border border-line px-2 py-1 text-xs text-muted">{stateLabel}</span></div>
        <p className="mt-2 text-sm text-muted">Your smallest useful next steps for moving the search forward.</p>
        <p className="mt-1 text-xs text-muted">These are suggestions for an empty workspace. They do not change your records automatically.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        {suggestions.map(({ href, label, detail, icon: Icon }) => (
          <Link key={href} href={href} className="group rounded-lg border border-line bg-surface p-5 transition-colors hover:border-brand/50 hover:bg-brand/[0.03]">
            <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
            <h2 className="mt-5 flex items-center gap-2 font-medium text-ink">{label}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{detail}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
