"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCover,
  buildResume,
  getLlmStatus,
  tailorResume,
  type LlmStatus,
  type TailorResult,
} from "@/lib/api";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StudioPage() {
  const [jd, setJd] = useState("");
  const [ai, setAi] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [busy, setBusy] = useState<"tailor" | "build" | "cover" | null>(null);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [llm, setLlm] = useState<LlmStatus | null>(null);

  useEffect(() => {
    void getLlmStatus().then(setLlm);
  }, []);

  async function onTailor() {
    if (!jd.trim()) return;
    setBusy("tailor");
    setMessage("");
    const r = await tailorResume(jd);
    setResult(r);
    if (!r)
      setMessage(
        "Could not reach the local engine — tailoring and PDF builds run on your machine. " +
          "Run `job-sentinel web` locally (setup guide: github.com/pscbo1/job-hub).",
      );
    setBusy(null);
  }

  async function onDownload() {
    setBusy("build");
    setMessage("");
    const res = await buildResume(jd, ai);
    if (res.ok && res.blob) download(res.blob, "resume.pdf");
    else setMessage(res.detail ?? "Build failed.");
    setBusy(null);
  }

  async function onCover() {
    setBusy("cover");
    setMessage("");
    const res = await buildCover(jd, role, company, ai);
    if (res.ok && res.blob) download(res.blob, "cover_letter.pdf");
    else setMessage(res.detail ?? "Cover letter build failed.");
    setBusy(null);
  }

  const pct = result ? Math.round(result.score * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Résumé studio</h1>
          <p className="mt-1 text-muted">
            Paste a job description, see how your profile matches, and download a tailored PDF.
          </p>
        </div>
        {llm && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              llm.chat_ready ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-muted"
            }`}
            title={
              llm.chat_ready
                ? `${llm.chat_model} via ${llm.base_url}`
                : `Ollama ${llm.reachable ? "is missing the model" : "is unreachable"} — AI rephrasing falls back to keyword tailoring`
            }
          >
            {llm.chat_ready ? `Local AI ready · ${llm.chat_model}` : "Local AI unavailable"}
          </span>
        )}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Input column */}
        <div className="space-y-5">
          <Textarea
            rows={12}
            placeholder="Paste the job description here…"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
          />

          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={onTailor} disabled={busy !== null || !jd.trim()}>
              {busy === "tailor" ? "Analyzing…" : "Analyze match"}
            </Button>
            <Button variant="outline" onClick={onDownload} disabled={busy !== null}>
              {busy === "build" ? "Building…" : "Download PDF"}
            </Button>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
              Rephrase with local LLM
            </label>
          </div>

          <Card>
            <CardTitle>Cover letter</CardTitle>
            <CardSub className="mt-1">
              Uses the job description above (optional) plus the role and company below.
            </CardSub>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="Role title (e.g. Software Engineer Intern)"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
                <Input
                  placeholder="Company / department"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={onCover} disabled={busy !== null}>
                {busy === "cover" ? "Building…" : "Download cover letter"}
              </Button>
            </div>
          </Card>

          {message && <p className="text-sm text-amber-600">{message}</p>}
        </div>

        {/* Results column */}
        <div className="lg:sticky lg:top-20">
          {result ? (
            <Card className="space-y-5">
              <div className="flex items-center gap-5">
                <ScoreRing pct={pct} />
                <div>
                  <CardTitle>ATS keyword coverage</CardTitle>
                  <CardSub className="mt-1">
                    How much of the posting&rsquo;s language your profile already speaks.
                  </CardSub>
                </div>
              </div>
              {result.matched_keywords.length > 0 && (
                <div>
                  <CardSub className="font-medium text-ink">Matched</CardSub>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {result.matched_keywords.slice(0, 30).map((k) => (
                      <span
                        key={k}
                        className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result.missing_keywords.length > 0 && (
                <div>
                  <CardSub className="font-medium text-ink">Missing — consider adding these</CardSub>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {result.missing_keywords.slice(0, 30).map((k) => (
                      <span
                        key={k}
                        className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ) : (
            <Card className="grid min-h-[16rem] place-items-center text-center">
              <div className="max-w-xs space-y-2">
                <p aria-hidden="true" className="text-3xl text-muted/50">
                  ◎
                </p>
                <CardSub>
                  Your match report appears here — score, matched keywords, and the gaps worth
                  closing before you apply.
                </CardSub>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** Animated radial gauge for the ATS coverage score. */
function ScoreRing({ pct }: { pct: number }) {
  const reduced = useReducedMotion();
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-24 w-24 shrink-0 place-items-center">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-stone-200" />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className="stroke-brand"
          strokeDasharray={c}
          initial={reduced ? { strokeDashoffset: c * (1 - pct / 100) } : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 0.9, ease: [0.21, 0.65, 0.36, 1] }}
        />
      </svg>
      <span className="absolute text-xl font-bold tabular-nums text-ink">{pct}%</span>
    </div>
  );
}
