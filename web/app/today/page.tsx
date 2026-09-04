"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BriefcaseBusiness, CheckSquare, Compass } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getApplications, getJobs } from "@/lib/api";
import { todaySuggestions, type TodayKind } from "@/lib/today";

const ICONS: Record<TodayKind, typeof BriefcaseBusiness> = {
  collect: BriefcaseBusiness,
  sources: Compass,
  tasks: CheckSquare,
  applications: BriefcaseBusiness,
  discover: Compass,
};

export default function TodayPage() {
  const [suggestions, setSuggestions] = useState(
    todaySuggestions({
      hasJobs: false,
      hasApplications: false,
      hasTasks: false,
    }),
  );

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
      setSuggestions(todaySuggestions(snapshot));
    };
    void load();
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <PageHeader
        title="Today"
        subtitle="Suggested next steps. They do not change your records."
      />
      <section className="grid gap-3 sm:grid-cols-3">
        {suggestions.map(({ href, label, detail, kind }) => {
          const Icon = ICONS[kind];
          return (
            <article key={href} className="flex flex-col rounded-lg border border-line bg-surface p-5">
              <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
              <h2 className="mt-5 font-medium text-ink">{label}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{detail}</p>
              <div className="mt-4 flex justify-end">
                <Link href={href} className={buttonVariants({ variant: "dark", size: "sm" })}>
                  Go
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
