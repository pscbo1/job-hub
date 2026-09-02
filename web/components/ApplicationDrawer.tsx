"use client";

import { useEffect, useRef, useState } from "react";

import { ApplicationAddTask } from "@/components/ApplicationAddTask";
import { ApplicationTagsEditor } from "@/components/ApplicationTagsEditor";
import { MaterialsArea, NotesPanel } from "@/components/ApplicationWorkspace";
import { SourceActionLink } from "@/components/SourceActionLink";
import { addCommNote, patchHubJob, updateApplication, type Application } from "@/lib/api";
import {
  type ApplicationDrawerTab,
  assistPacketReadiness,
  latestSubmissionLine,
  nextStepLabel,
} from "@/lib/applicationUi";
import { currentMaterialCount } from "@/lib/materialsUi";
import {
  DRAWER_SAVE_STEP_LABELS,
  applyDrawerSynced,
  canCompleteLeave,
  draftsAfterSave,
  drawerActionsLocked,
  saveDrawerRecord,
  withDrawerSaveLock,
  type DrawerSaveStep,
} from "@/lib/drawerSave";
import { tagsEqual } from "@/lib/applicationTags";
import { dateInputValue, isDateOverdue } from "@/lib/jobPipeline";
import { DIRTY_SWITCH_LABELS } from "@/lib/recordDraft";
import { sourceAction } from "@/lib/sourceAction";
import { formatCalendarDate, todayInAppTz } from "@/lib/timezone";
import { cn } from "@/lib/utils";

const TABS: { id: ApplicationDrawerTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "materials", label: "Materials" },
  { id: "notes", label: "Notes" },
];

const STAGE_STYLES: Record<Application["stage"], string> = {
  draft: "bg-amber-50 text-amber-800",
  applied: "bg-sky-50 text-sky-800",
  interview: "bg-violet-50 text-violet-800",
  offer: "bg-emerald-50 text-emerald-800",
  closed: "bg-stone-100 text-stone-600",
};

export function ApplicationDrawer({
  requestedApp,
  requestedTab,
  loading,
  missing,
  onClose,
  onStay,
  onTabChange,
  onChanged,
  onSubmitRequest,
  onToggleIdleExempt,
  knownTags = [],
}: {
  requestedApp: Application | null;
  requestedTab: ApplicationDrawerTab;
  loading?: boolean;
  missing?: boolean;
  onClose: () => void;
  onStay: (id: string) => void;
  onTabChange: (tab: ApplicationDrawerTab) => void;
  onChanged: () => void;
  onSubmitRequest: (id: string) => void;
  onToggleIdleExempt?: (app: Application) => void;
  knownTags?: string[];
}) {
  const [shown, setShown] = useState<Application | null>(requestedApp);
  const [pending, setPending] = useState<Application | null>(null);
  const [tab, setTab] = useState<ApplicationDrawerTab>(requestedTab);
  const [notesDraft, setNotesDraft] = useState(requestedApp?.notes ?? "");
  const [contactDraft, setContactDraft] = useState(requestedApp?.contact ?? "");
  const [tagsDraft, setTagsDraft] = useState<string[]>(requestedApp?.tags ?? []);
  const [nextDraft, setNextDraft] = useState(requestedApp?.next_step ?? "");
  const [ddlDraft, setDdlDraft] = useState(dateInputValue(requestedApp?.job_deadline));
  const [commDraft, setCommDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<DrawerSaveStep | null>(null);
  const [closeArmed, setCloseArmed] = useState(false);
  const [notesTick, setNotesTick] = useState(0);
  const dirtyRef = useRef(false);
  const shownIdRef = useRef(requestedApp?.id ?? "");
  const saveLock = useRef(false);
  const baselineRef = useRef({
    notes: requestedApp?.notes ?? "",
    contact: requestedApp?.contact ?? "",
    tags: requestedApp?.tags ?? [],
    nextStep: requestedApp?.next_step ?? "",
    deadline: dateInputValue(requestedApp?.job_deadline),
  });

  function resetBaseline(app: Application) {
    baselineRef.current = {
      notes: app.notes,
      contact: app.contact ?? "",
      tags: app.tags ?? [],
      nextStep: app.next_step ?? "",
      deadline: dateInputValue(app.job_deadline),
    };
  }

  function syncDrafts(app: Application) {
    setNotesDraft(app.notes);
    setContactDraft(app.contact ?? "");
    setTagsDraft(app.tags ?? []);
    setNextDraft(app.next_step ?? "");
    setDdlDraft(dateInputValue(app.job_deadline));
    setCommDraft("");
    setSaveError(null);
    resetBaseline(app);
  }

  const isDirty =
    shown != null &&
    (notesDraft !== shown.notes ||
      contactDraft !== (shown.contact ?? "") ||
      !tagsEqual(tagsDraft, shown.tags ?? []) ||
      nextDraft !== (shown.next_step ?? "") ||
      ddlDraft !== dateInputValue(shown.job_deadline) ||
      commDraft.trim() !== "");
  dirtyRef.current = isDirty;
  shownIdRef.current = shown?.id ?? "";

  useEffect(() => {
    if (!requestedApp) {
      if (!dirtyRef.current && !saveLock.current) {
        setShown(null);
        setPending(null);
      }
      return;
    }
    if (requestedApp.id === shownIdRef.current) {
      if (!saveLock.current) setShown(requestedApp);
      return;
    }
    if (!dirtyRef.current) {
      setShown(requestedApp);
      setPending(null);
      setCloseArmed(false);
      syncDrafts(requestedApp);
      return;
    }
    setPending(requestedApp);
  }, [requestedApp]);

  useEffect(() => {
    if (!pending) setTab(requestedTab);
  }, [requestedTab, pending]);

  useEffect(() => {
    if (shown) syncDrafts(shown);
    // Only reset drafts when the shown record identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.id]);

  async function saveShown(): Promise<boolean> {
    if (!shown) return false;
    const appId = shown.id;
    const snapshot = shown;
    const currentDrafts = {
      notes: notesDraft,
      contact: contactDraft,
      tags: tagsDraft,
      nextStep: nextDraft,
      deadline: ddlDraft,
      commDraft,
    };
    const result = await withDrawerSaveLock(saveLock, async () => {
      setSaving(true);
      setSaveError(null);
      try {
        return await saveDrawerRecord(
          {
            appId,
            jobId: snapshot.job_id,
            shownNotes: baselineRef.current.notes,
            shownContact: baselineRef.current.contact,
            shownTags: baselineRef.current.tags,
            shownNextStep: baselineRef.current.nextStep,
            shownDeadline: baselineRef.current.deadline,
            drafts: currentDrafts,
          },
          { updateApplication, patchHubJob, addCommNote },
          { isCancelled: () => shownIdRef.current !== appId },
        );
      } finally {
        if (shownIdRef.current === appId) setSaving(false);
      }
    });
    if (result == null || shownIdRef.current !== appId) return false;

    const nextShown = applyDrawerSynced(shownIdRef.current, appId, snapshot, result.synced);
    if (nextShown) setShown(nextShown);
    if (result.synced.notes !== undefined) baselineRef.current.notes = result.synced.notes;
    if (result.synced.contact !== undefined) baselineRef.current.contact = result.synced.contact;
    if (result.synced.tags !== undefined) {
      baselineRef.current.tags = result.synced.tags;
      setTagsDraft(result.synced.tags);
    }
    if (result.synced.nextStep !== undefined) baselineRef.current.nextStep = result.synced.nextStep;
    if (result.synced.deadline !== undefined) baselineRef.current.deadline = result.synced.deadline;
    const nextDrafts = draftsAfterSave(currentDrafts, result.synced);
    if (nextDrafts.commDraft !== currentDrafts.commDraft) setCommDraft(nextDrafts.commDraft);

    if (!result.ok) {
      setSaveError(result.failedStep);
      return false;
    }
    setSaveError(null);
    if (result.synced.commCleared) setNotesTick((n) => n + 1);
    onChanged();
    return true;
  }

  async function saveAndSwitch() {
    if (drawerActionsLocked(saving) || saveLock.current) return;
    const target = pending;
    const ok = await saveShown();
    if (!canCompleteLeave(ok, saveLock.current) || !target) return;
    setShown(target);
    setPending(null);
    setCloseArmed(false);
    syncDrafts(target);
    setTab(requestedTab);
  }

  function discardAndSwitch() {
    if (drawerActionsLocked(saving) || saveLock.current) return;
    const target = pending;
    if (!target) {
      setPending(null);
      return;
    }
    setShown(target);
    setPending(null);
    setCloseArmed(false);
    syncDrafts(target);
    setTab(requestedTab);
  }

  function stay() {
    if (!shown) return;
    setPending(null);
    setCloseArmed(false);
    onStay(shown.id);
  }

  function requestClose() {
    if (drawerActionsLocked(saving) || saveLock.current) return;
    if (isDirty && shown) {
      setCloseArmed(true);
      return;
    }
    onClose();
  }

  const saveBusy = saving || saveLock.current;

  const source = shown
    ? sourceAction({ apply_url: shown.apply_url, url: shown.url, job_url: shown.job_url })
    : null;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-ink/30" aria-label="Close drawer" onClick={requestClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[720px] flex-col border-l border-line bg-surface shadow-xl max-sm:inset-0">
        {saveError && shown && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm">
            Could not save {DRAWER_SAVE_STEP_LABELS[saveError]}. This application and unsaved drafts were kept.
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => void saveShown()}
                className="h-8 rounded-lg bg-ink px-3 text-xs text-white disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        {pending && shown && pending.id !== shown.id && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm">
            Unsaved changes on this application.
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => void saveAndSwitch()}
                className="h-8 rounded-lg bg-ink px-3 text-xs text-white disabled:opacity-50"
              >
                {DIRTY_SWITCH_LABELS.save}
              </button>
              <button
                type="button"
                disabled={saveBusy}
                onClick={discardAndSwitch}
                className="h-8 rounded-lg border border-line px-3 text-xs disabled:opacity-50"
              >
                {DIRTY_SWITCH_LABELS.discard}
              </button>
              <button type="button" onClick={stay} className="h-8 rounded-lg border border-line px-3 text-xs">
                {DIRTY_SWITCH_LABELS.stay}
              </button>
            </div>
          </div>
        )}
        {closeArmed && shown && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm">
            Unsaved changes. Save, discard, or stay on this application.
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saveBusy}
                onClick={async () => {
                  if (saveBusy) return;
                  const ok = await saveShown();
                  if (canCompleteLeave(ok, saveLock.current)) {
                    setCloseArmed(false);
                    onClose();
                  }
                }}
                className="h-8 rounded-lg bg-ink px-3 text-xs text-white disabled:opacity-50"
              >
                Save and close
              </button>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => {
                  if (saveBusy) return;
                  setCloseArmed(false);
                  onClose();
                }}
                className="h-8 rounded-lg border border-line px-3 text-xs disabled:opacity-50"
              >
                {DIRTY_SWITCH_LABELS.discard}
              </button>
              <button
                type="button"
                onClick={() => setCloseArmed(false)}
                className="h-8 rounded-lg border border-line px-3 text-xs"
              >
                {DIRTY_SWITCH_LABELS.stay}
              </button>
            </div>
          </div>
        )}

        {loading && !shown ? (
          <div className="p-6 text-sm text-muted">Loading application…</div>
        ) : missing && !shown ? (
          <div className="p-6 text-sm text-muted">
            Application not found.
            <button type="button" className="ml-2 underline" onClick={onClose}>
              Close
            </button>
          </div>
        ) : shown ? (
          <>
            <header className="border-b border-line px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-ink">{shown.title || "Untitled"}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                    <span>{[shown.employer, shown.location].filter(Boolean).join(" · ")}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STAGE_STYLES[shown.stage])}>{shown.stage}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={saveBusy}
                  onClick={requestClose}
                  className="text-sm text-muted hover:text-ink disabled:opacity-50"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <SourceActionLink
                  variant="primary"
                  apply_url={shown.apply_url}
                  url={shown.url}
                  job_url={shown.job_url}
                />
                {shown.stage === "draft" && (
                  <button
                    type="button"
                    onClick={() => onSubmitRequest(shown.id)}
                    className="h-8 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink"
                  >
                    Mark submitted
                  </button>
                )}
                {onToggleIdleExempt && (
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer hover:text-ink">More</summary>
                    {shown.stage !== "draft" && (
                      <button
                        type="button"
                        onClick={() => onSubmitRequest(shown.id)}
                        className="mt-2 block text-left hover:text-ink"
                      >
                        {shown.stage === "closed" ? "Reopen (mark submitted)" : "Record another submission"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onToggleIdleExempt(shown)}
                      className="mt-2 block text-left hover:text-ink"
                    >
                      {shown.exclude_from_idle ? "Include in idle cleanup" : "Exclude from idle cleanup"}
                    </button>
                  </details>
                )}
              </div>
              <div className="mt-4 flex gap-1 border-b border-line">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTab(item.id);
                      onTabChange(item.id);
                    }}
                    className={cn(
                      "-mb-px border-b-2 px-3 py-2 text-sm",
                      tab === item.id
                        ? "border-ink font-medium text-ink"
                        : "border-transparent text-muted hover:text-ink",
                    )}
                  >
                      {item.label}{item.id === "materials" && shown.current_material_count != null ? ` (${shown.current_material_count})` : ""}
                  </button>
                ))}
              </div>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {tab === "overview" && (
                <OverviewTab
                  app={shown}
                  contactDraft={contactDraft}
                  onContactChange={setContactDraft}
                  tagsDraft={tagsDraft}
                  onTagsChange={setTagsDraft}
                  knownTags={knownTags}
                  nextDraft={nextDraft}
                  ddlDraft={ddlDraft}
                  onNextChange={setNextDraft}
                  onDdlChange={setDdlDraft}
                  sourceMissing={source?.kind === "missing"}
                  onOpenMaterials={() => {
                    setTab("materials");
                    onTabChange("materials");
                  }}
                  onSubmitRequest={() => onSubmitRequest(shown.id)}
                />
              )}
              {tab === "materials" && <MaterialsArea key={shown.id} app={shown} onChanged={onChanged} />}
              {tab === "notes" && (
                <NotesPanel
                  key={`${shown.id}:${notesTick}`}
                  app={shown}
                  notes={notesDraft}
                  onNotesChange={setNotesDraft}
                  commDraft={commDraft}
                  onCommDraftChange={setCommDraft}
                />
              )}
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function OverviewTab({
  app,
  contactDraft,
  onContactChange,
  tagsDraft,
  onTagsChange,
  knownTags,
  nextDraft,
  ddlDraft,
  onNextChange,
  onDdlChange,
  sourceMissing,
  onOpenMaterials,
  onSubmitRequest,
}: {
  app: Application;
  contactDraft: string;
  onContactChange: (value: string) => void;
  tagsDraft: string[];
  onTagsChange: (value: string[]) => void;
  knownTags: string[];
  nextDraft: string;
  ddlDraft: string;
  onNextChange: (value: string) => void;
  onDdlChange: (value: string) => void;
  sourceMissing: boolean;
  onOpenMaterials: () => void;
  onSubmitRequest: () => void;
}) {
  const jd = (app.job_description ?? "").trim();
  const comment = (app.job_comment ?? "").trim();
  const summary = latestSubmissionLine(app);
  const overdue = isDateOverdue(ddlDraft, todayInAppTz());

  return (
    <div className="space-y-5">
      {app.stage === "draft" && (
        <section className="space-y-3 rounded-lg border border-brand/30 bg-brand/5 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">Next action</p>
            <p className="mt-1 text-base font-semibold text-ink">
              {sourceMissing ? "Prepare materials" : "Open apply page"}
            </p>
            <p className="mt-1 text-sm text-muted">{assistPacketReadiness(currentMaterialCount(app))}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SourceActionLink
              variant="primary"
              apply_url={app.apply_url}
              url={app.url}
              job_url={app.job_url}
            />
            <button
              type="button"
              onClick={onOpenMaterials}
              className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink"
            >
              Open Materials
            </button>
            <button
              type="button"
              onClick={onSubmitRequest}
              className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink"
            >
              Mark submitted
            </button>
          </div>
        </section>
      )}
      <section className="rounded-lg border border-line bg-bg p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Next step</h3>
          {overdue && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800">Overdue</span>}
        </div>
        {app.job_id ? (
          <div className="mt-2 space-y-2">
            <input
              value={nextDraft}
              onChange={(e) => onNextChange(e.target.value)}
              placeholder="Next step"
              className="h-9 w-full rounded-lg border border-line bg-bg px-3 text-sm"
            />
            <label className="block text-xs text-muted">
              Deadline
              <input
                type="date"
                value={ddlDraft}
                onChange={(e) => onDdlChange(e.target.value)}
                className={cn(
                  "mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 text-sm text-ink",
                  overdue && "text-amber-800",
                )}
              />
            </label>
            {ddlDraft && (
              <p className={cn("text-xs", overdue ? "text-amber-800" : "text-muted")}>
                DDL {formatCalendarDate(ddlDraft)}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {nextStepLabel(app.next_step)}
            {app.job_deadline ? ` · DDL ${formatCalendarDate(app.job_deadline)}` : ""}
            <span className="mt-1 block text-xs">This application has no linked job, so next step cannot be edited here.</span>
          </p>
        )}
      </section>
      {summary && app.stage !== "draft" && (
        <section className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Latest submission</p>
          <p className="mt-1 text-sm font-medium text-ink">{summary}</p>
        </section>
      )}
      <details className="rounded-lg border border-line bg-bg p-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">More details</summary>
        <div className="mt-4 space-y-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Contact <span className="font-normal">(optional)</span></h3>
            <textarea
              value={contactDraft}
              onChange={(e) => onContactChange(e.target.value)}
              placeholder="Name, email, WeChat, or a link"
              rows={3}
              className="mt-2 w-full select-text resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </section>
          <ApplicationAddTask key={app.id} app={app} />
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Job description</h3>
            {jd ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{jd}</p>
            ) : (
              <div className="mt-2 rounded-lg border border-dashed border-line p-3 text-sm text-muted">
                Full JD not saved.
                <div className="mt-2">
                  <SourceActionLink apply_url={app.apply_url} url={app.url} job_url={app.job_url} />
                </div>
              </div>
            )}
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Research notes</h3>
            {comment ? <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{comment}</p> : <p className="mt-2 text-sm text-muted">No research notes.</p>}
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Tags{tagsDraft.length > 0 ? <span className="ml-2 tabular-nums font-normal text-muted">{tagsDraft.length}</span> : null}
            </h3>
            <div className="mt-2">
              <ApplicationTagsEditor tags={tagsDraft} knownTags={knownTags} onChange={onTagsChange} />
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
