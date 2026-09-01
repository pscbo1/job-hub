"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

import { AiMatch } from "@/components/AiMatch";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import type { JobPosting } from "@/lib/api";
import { ATS_COLORS, detectAts } from "@/lib/atsDetect";
import { detectGhostSignal, GHOST_LABELS } from "@/lib/ghostSignal";
import { cn, externalUrl } from "@/lib/utils";

/** Initial-letter monogram used as a lightweight employer "logo". */
function Monogram({ name }: { name: string }) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <div
      aria-hidden="true"
      className="grid h-11 w-11 shrink-0 select-none place-items-center rounded-xl border border-line bg-bg font-semibold text-muted"
    >
      {letter}
    </div>
  );
}

/**
 * A single search result (from any source). Results are ephemeral — not in the
 * DB. Open the source or go to Discover; drafts are created only via Start
 * Application on a stable Job.
 */
export function SearchResultCard({ job, index }: { job: JobPosting; index: number }) {
  const reduced = useReducedMotion();
  const [showDetails, setShowDetails] = useState(false);

  const raw = job.raw_data ?? {};
  const salary = typeof raw.salary_text === "string" ? raw.salary_text : "";
  const isRemote = raw.is_remote === true;
  const tags = Array.isArray(raw.tags) ? (raw.tags as unknown[]).filter((t) => typeof t === "string") : [];
  const detail = (raw.detail ?? {}) as { description?: string };
  const description = (detail.description || job.description_snippet || "").trim();

  const ghostSignal = detectGhostSignal({
    postedDate: job.posted_date,
    descriptionLength: description.length,
    hasSalary: Boolean(salary),
    tagCount: tags.length,
  });
  const atsPlatform = detectAts(job.portal_url);

  const jobText = [job.title, job.employer, job.job_type, description].filter(Boolean).join("\n");

  return (
    <motion.div
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.025, 0.25) }}
    >
      <Card className="space-y-0">
        <div className="flex items-start gap-3.5 pb-3">
          <Monogram name={job.employer || job.title} />
          <div className="min-w-0 flex-1">
            <CardTitle className="leading-snug">{job.title}</CardTitle>
            <CardSub className="mt-0.5">
              {[job.employer, job.location, job.job_type].filter(Boolean).join(" · ")}
            </CardSub>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {isRemote && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                  Remote
                </span>
              )}
              {salary && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  {salary}
                </span>
              )}
              <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                {job.source_adapter || "source"}
              </span>
              {job.posted_date && <span className="text-[11px] text-muted">· {job.posted_date}</span>}
              {atsPlatform && (
                <span
                  title={`Apply via ${atsPlatform}`}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                    ATS_COLORS[atsPlatform],
                  )}
                >
                  {atsPlatform}
                </span>
              )}
              {ghostSignal && (
                <span
                  title={GHOST_LABELS[ghostSignal].title}
                  className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200"
                >
                  ⚠ {GHOST_LABELS[ghostSignal].short}
                </span>
              )}
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {(tags as string[]).slice(0, 5).map((t) => (
                  <span key={t} className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {job.portal_url && (
            <a
              href={externalUrl(job.portal_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-ink/30 hover:bg-bg"
            >
              Open source ↗
            </a>
          )}
          <Link
            href="/jobs"
            className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-ink/30 hover:bg-bg"
          >
            Open Discover
          </Link>
          {description && (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-xs font-medium text-muted transition-colors hover:border-ink/30 hover:text-ink"
            >
              Job details
              <span aria-hidden="true" className={cn("transition-transform duration-200", showDetails && "rotate-180")}>
                ▾
              </span>
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {showDetails && description && (
            <motion.div
              initial={reduced ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduced ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <p className="border-l-2 border-line pl-3 pt-2 pb-1 text-sm leading-relaxed text-muted">
                {description}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <AiMatch jobText={jobText} />
      </Card>
    </motion.div>
  );
}
