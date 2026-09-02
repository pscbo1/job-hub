/** Orchestrate application-drawer saves so failures keep drafts and never switch. */

export type DrawerSaveStep = "notes" | "next_step" | "comm_note";

export const DRAWER_SAVE_STEP_LABELS: Record<DrawerSaveStep, string> = {
  notes: "application notes",
  next_step: "next step",
  comm_note: "communication note",
};

export type DrawerDrafts = {
  notes: string;
  nextStep: string;
  deadline: string;
  commDraft: string;
};

export type DrawerSaveInput = {
  appId: string;
  jobId: string | null | undefined;
  shownNotes: string;
  shownNextStep: string;
  shownDeadline: string;
  drafts: DrawerDrafts;
};

export type DrawerSaveSynced = {
  notes?: string;
  nextStep?: string;
  deadline?: string;
  commCleared?: boolean;
};

export type DrawerSaveResult =
  | { ok: true; failedStep: null; synced: DrawerSaveSynced }
  | { ok: false; failedStep: DrawerSaveStep; synced: DrawerSaveSynced };

export type DrawerSaveClient = {
  updateApplication: (id: string, patch: { notes: string }) => Promise<unknown | null>;
  patchHubJob: (
    jobId: string,
    body: { next_step: string; deadline: string | null },
  ) => Promise<unknown | null>;
  addCommNote: (id: string, body: string) => Promise<unknown | null>;
};

export type DrawerSaveLock = { current: boolean };

export function createDrawerSaveLock(): DrawerSaveLock {
  return { current: false };
}

export function drawerActionsLocked(saving: boolean): boolean {
  return saving;
}

export function canCompleteLeave(saveOk: boolean, saving: boolean): boolean {
  return saveOk && !saving;
}

export function applyDrawerSynced<T extends { id: string }>(
  currentId: string,
  savedId: string,
  record: T,
  synced: DrawerSaveSynced,
): T | null {
  if (currentId !== savedId || record.id !== savedId) return null;
  return {
    ...record,
    ...(synced.notes !== undefined ? { notes: synced.notes } : {}),
    ...(synced.nextStep !== undefined ? { next_step: synced.nextStep } : {}),
    ...(synced.deadline !== undefined
      ? { job_deadline: synced.deadline.trim() ? synced.deadline : "" }
      : {}),
  };
}

export function draftsAfterSave(drafts: DrawerDrafts, synced: DrawerSaveSynced): DrawerDrafts {
  return {
    notes: drafts.notes,
    nextStep: drafts.nextStep,
    deadline: drafts.deadline,
    commDraft: synced.commCleared ? "" : drafts.commDraft,
  };
}

async function callStep<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function saveDrawerRecord(
  input: DrawerSaveInput,
  client: DrawerSaveClient,
  opts?: { isCancelled?: () => boolean },
): Promise<DrawerSaveResult> {
  const synced: DrawerSaveSynced = {};
  const cancelled = (): boolean => Boolean(opts?.isCancelled?.());
  const drafts = input.drafts;

  if (drafts.notes !== input.shownNotes) {
    const result = await callStep(() => client.updateApplication(input.appId, { notes: drafts.notes }));
    if (cancelled()) return { ok: false, failedStep: "notes", synced };
    if (result == null) return { ok: false, failedStep: "notes", synced };
    synced.notes = drafts.notes;
  }

  const nextDirty =
    Boolean(input.jobId) &&
    (drafts.nextStep !== input.shownNextStep || drafts.deadline !== input.shownDeadline);
  if (input.jobId && nextDirty) {
    const result = await callStep(() =>
      client.patchHubJob(input.jobId as string, {
        next_step: drafts.nextStep,
        deadline: drafts.deadline.trim() ? drafts.deadline : null,
      }),
    );
    if (cancelled()) return { ok: false, failedStep: "next_step", synced };
    if (result == null) return { ok: false, failedStep: "next_step", synced };
    synced.nextStep = drafts.nextStep;
    synced.deadline = drafts.deadline;
  }

  const comm = drafts.commDraft.trim();
  if (comm) {
    const result = await callStep(() => client.addCommNote(input.appId, comm));
    if (cancelled()) return { ok: false, failedStep: "comm_note", synced };
    if (result == null) return { ok: false, failedStep: "comm_note", synced };
    synced.commCleared = true;
  }

  return { ok: true, failedStep: null, synced };
}

export async function withDrawerSaveLock<T>(
  lock: DrawerSaveLock,
  fn: () => Promise<T>,
): Promise<T | null> {
  if (lock.current) return null;
  lock.current = true;
  try {
    return await fn();
  } finally {
    lock.current = false;
  }
}
