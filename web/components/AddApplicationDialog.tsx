"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  createManualApplication,
  startApplicationForJob,
  type Application,
  type HubJob,
  type ManualApplicationDuplicate,
} from "@/lib/api";
import { readLastMarket, writeLastMarket } from "@/lib/marketPrefs";
import { manualApplicationFieldErrors } from "@/lib/manualApplicationUi";
import type { MarketId } from "@/lib/markets";

type Created = { job: HubJob; application: Application };

export function AddApplicationDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: Created) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const marketRef = useRef<HTMLSelectElement>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [location, setLocation] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [market, setMarket] = useState<MarketId>(() => readLastMarket());
  const [initialMarket] = useState(market);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [duplicate, setDuplicate] = useState<ManualApplicationDuplicate | null>(null);

  const dirty =
    Boolean(title || company || jobUrl || location || sourceNote) || market !== initialMarket;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (busy) return;
        if (confirmDiscard) setConfirmDiscard(false);
        else if (dirty) setConfirmDiscard(true);
        else onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, confirmDiscard, dirty, onClose]);

  function requestClose() {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  function focusFirstError(next: Record<string, string>) {
    const first = Object.keys(next)[0];
    const targets: Record<string, React.RefObject<HTMLElement | null>> = {
      title: titleRef,
      company: companyRef,
      job_url: linkRef,
      market: marketRef,
    };
    targets[first]?.current?.focus();
  }

  async function submit(createSeparately = false) {
    if (busy) return;
    const clientErrors = manualApplicationFieldErrors({ title, company, jobUrl });
    setErrors(clientErrors);
    setFormError("");
    setDuplicate(null);
    if (Object.keys(clientErrors).length > 0) {
      focusFirstError(clientErrors);
      return;
    }
    setBusy(true);
    const result = await createManualApplication({
      request_id: requestId,
      title,
      company,
      job_url: jobUrl,
      location,
      source_note: sourceNote,
      market,
      create_separately: createSeparately,
    });
    setBusy(false);
    if (result.ok) {
      writeLastMarket(market);
      onCreated({ job: result.job, application: result.application });
      return;
    }
    if (result.kind === "validation") {
      setErrors(result.fields);
      focusFirstError(result.fields);
    } else if (result.kind === "duplicate") {
      setDuplicate(result.duplicate);
      setFormError("An opportunity with this link already exists.");
    } else if (result.kind === "cancelled") {
      setFormError("This draft was already cancelled. Close and add it again.");
    } else {
      setFormError(result.message);
    }
  }

  async function openExisting() {
    if (!duplicate || busy) return;
    setBusy(true);
    const result = await startApplicationForJob(duplicate.job.id);
    setBusy(false);
    if (!result) {
      setFormError("Could not open the existing opportunity. Try again.");
      return;
    }
    onCreated(result);
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/35 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-application-title"
        aria-describedby="add-application-subtitle"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-line bg-surface shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {confirmDiscard ? (
          <div className="space-y-5 p-6">
            <div>
              <h2 className="text-xl font-semibold text-ink">Discard this application draft?</h2>
              <p className="mt-1 text-sm text-muted">Your entered details have not been saved.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" autoFocus onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </Button>
              <Button type="button" variant="danger" onClick={onClose}>
                Discard
              </Button>
            </div>
          </div>
        ) : (
          <>
            <header className="border-b border-line px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="add-application-title" className="text-xl font-semibold text-ink">
                    Add application
                  </h2>
                  <p id="add-application-subtitle" className="mt-1 text-sm text-muted">
                    Start a draft for an opportunity you found.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close Add application"
                  disabled={busy}
                  onClick={requestClose}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl text-muted hover:bg-bg disabled:opacity-50"
                >
                  ×
                </button>
              </div>
            </header>

            <div className="space-y-4 px-5 py-4">
              <Field label="Job title" required error={errors.title}>
                <input
                  ref={titleRef}
                  value={title}
                  maxLength={200}
                  aria-invalid={Boolean(errors.title)}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                />
              </Field>
              <Field label="Company" required error={errors.company}>
                <input
                  ref={companyRef}
                  value={company}
                  maxLength={200}
                  aria-invalid={Boolean(errors.company)}
                  onChange={(event) => setCompany(event.target.value)}
                  className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                />
              </Field>
              <Field label="Job link" optional error={errors.job_url}>
                <input
                  ref={linkRef}
                  type="url"
                  value={jobUrl}
                  maxLength={2048}
                  placeholder="https://…"
                  aria-invalid={Boolean(errors.job_url)}
                  onChange={(event) => setJobUrl(event.target.value)}
                  className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                />
              </Field>

              <button
                type="button"
                aria-expanded={more}
                onClick={() => setMore((value) => !value)}
                className="text-sm font-medium text-ink hover:underline"
              >
                More details {more ? "▴" : "▾"}
              </button>
              {more && (
                <div className="space-y-4 rounded-xl bg-bg p-3">
                  <Field label="Location" optional error={errors.location}>
                    <input
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                    />
                  </Field>
                  <Field label="Source" optional error={errors.source_note}>
                    <input
                      value={sourceNote}
                      placeholder="Where you found it"
                      onChange={(event) => setSourceNote(event.target.value)}
                      className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                    />
                  </Field>
                  <Field label="Market" error={errors.market}>
                    <select
                      ref={marketRef}
                      value={market}
                      onChange={(event) => setMarket(event.target.value as MarketId)}
                      className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                    >
                      <option value="cn">CN</option>
                      <option value="en">EN</option>
                    </select>
                  </Field>
                </div>
              )}

              {formError && (
                <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm text-amber-900">{formError}</p>
                  {duplicate && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" variant="dark" size="sm" disabled={busy} onClick={() => void openExisting()}>
                        Use existing
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void submit(true)}>
                        Create separately
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
              <p className="text-sm text-muted">
                Market: {market.toUpperCase()} ·{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMore(true);
                    requestAnimationFrame(() => marketRef.current?.focus());
                  }}
                  className="underline"
                >
                  Change
                </button>
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
                  Cancel
                </Button>
                <Button type="button" disabled={busy} onClick={() => void submit()}>
                  {busy ? "Creating…" : "Create draft"}
                </Button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  optional,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm text-ink">
      <span className="font-medium">
        {label}
        {required ? " *" : ""}
      </span>
      {optional && <span className="ml-1 font-normal text-muted">Optional</span>}
      <span className="mt-1 block">{children}</span>
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}
