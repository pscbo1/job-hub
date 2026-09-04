"use client";

import { motion, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";

import { SafeBoundary } from "@/components/SafeBoundary";
import { TerminalDemo } from "@/components/TerminalDemo";

// WebGL is client-only and lazy — it never blocks SSR or first paint.
const Hero3D = dynamic(() => import("@/components/Hero3D"), { ssr: false });

const stats = [
  { value: "100%", label: "local & private" },
  { value: "0", label: "API keys needed" },
  { value: "240+", label: "tests, Python + web" },
  { value: "9", label: "CI quality gates" },
];

export function Hero() {
  const reduced = useReducedMotion();
  const enter = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 22 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: [0.21, 0.65, 0.36, 1] as const },
        };

  return (
    <section data-nav-theme="dark" className="relative overflow-hidden bg-night text-white">
      <div className="bg-grid-dark absolute inset-0" aria-hidden="true" />
      {/* Emerald glow behind the 3D core */}
      <div
        aria-hidden="true"
        className="absolute right-[-10%] top-1/4 h-[420px] w-[420px] rounded-full bg-brand-500/20 blur-[120px]"
      />
      {!reduced && (
        <SafeBoundary>
          <Hero3D />
        </SafeBoundary>
      )}

      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-6 sm:py-32 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <motion.div {...enter(0)} className="mb-7 flex items-center gap-4">
            <img
              src="/brand/job-hub.png"
              alt="Job Hub"
              className="h-16 w-16 rounded-2xl border border-white/15 bg-night object-cover shadow-2xl shadow-brand/20"
            />
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand-400">
                Job Hub
              </p>
              <p className="mt-1 text-sm text-stone-400">Local-first career automation</p>
            </div>
          </motion.div>
          <motion.p
            {...enter(0.04)}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-brand-400"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
              <span className="h-2 w-2 rounded-full bg-brand-400" />
            </span>
            Open source · pip install job-sentinel
          </motion.p>

          <motion.h1
            {...enter(0.12)}
            className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl"
          >
            Your job hunt,
            <br />
            <span className="bg-gradient-to-r from-brand-400 to-emerald-200 bg-clip-text text-transparent">
              engineered.
            </span>
          </motion.h1>

          <motion.p {...enter(0.2)} className="mt-6 max-w-xl text-lg leading-relaxed text-stone-300">
            Job Hub watches your portals, tracks every posting and deadline, and generates
            ATS-ready résumés and cover letters tailored to each role by a{" "}
            <strong className="font-semibold text-white">local LLM</strong>. No API keys. No data
            leaving your machine.
          </motion.p>

          <motion.div {...enter(0.28)} className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/studio"
              className="rounded-lg bg-brand px-6 py-3 font-medium text-white shadow-lg shadow-brand/25 transition-all hover:bg-brand-500 active:scale-[0.98]"
            >
              Open the résumé studio
            </Link>
            <Link
              href="/jobs"
              className="rounded-lg border border-white/20 px-6 py-3 font-medium text-white transition-colors hover:bg-white/10"
            >
              View tracked jobs
            </Link>
          </motion.div>

          <motion.dl {...enter(0.38)} className="mt-12 grid max-w-lg grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="text-2xl font-bold text-white">{s.value}</dd>
                <dd className="mt-0.5 text-xs text-stone-400">{s.label}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
        {/* Right column: a live-typed replay of a real session, floating over the 3D. */}
        <motion.div {...enter(0.45)} className="flex min-w-0 items-center">
          <div className="w-full max-w-md lg:ml-auto">
            <TerminalDemo />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
