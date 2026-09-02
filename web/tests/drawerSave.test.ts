import { afterEach, describe, expect, it, vi } from "vitest";

import { addCommNote, patchHubJob, updateApplication } from "@/lib/api";
import {
  applyDrawerSynced,
  canCompleteLeave,
  createDrawerSaveLock,
  draftsAfterSave,
  drawerActionsLocked,
  saveDrawerRecord,
  withDrawerSaveLock,
  type DrawerDrafts,
  type DrawerSaveClient,
  type DrawerSaveInput,
  type DrawerSaveStep,
} from "@/lib/drawerSave";

const drafts: DrawerDrafts = {
  notes: "edited notes",
  contact: "",
  nextStep: "Prep OA",
  deadline: "2026-09-10",
  commDraft: " emailed recruiter ",
};

function input(overrides: Partial<DrawerSaveInput> = {}): DrawerSaveInput {
  return {
    appId: "app-a",
    jobId: "job-a",
    shownNotes: "old notes",
    shownContact: "",
    shownNextStep: "",
    shownDeadline: "",
    drafts: { ...drafts },
    ...overrides,
  };
}

function client(overrides: Partial<DrawerSaveClient> = {}): DrawerSaveClient {
  return {
    updateApplication: vi.fn(async () => ({ id: "app-a" })),
    patchHubJob: vi.fn(async () => ({ id: "job-a" })),
    addCommNote: vi.fn(async () => ({ id: "note-1" })),
    ...overrides,
  };
}

function httpFail(): Promise<null> {
  return Promise.resolve(null);
}

function networkError(): Promise<null> {
  return Promise.reject(new Error("Failed to fetch"));
}

describe("saveDrawerRecord failures keep remaining drafts", () => {
  const cases: { step: DrawerSaveStep; fail: keyof DrawerSaveClient }[] = [
    { step: "notes", fail: "updateApplication" },
    { step: "next_step", fail: "patchHubJob" },
    { step: "comm_note", fail: "addCommNote" },
  ];

  for (const { step, fail } of cases) {
    it(`Save and switch / Save and close keep drafts on HTTP failure of ${step}`, async () => {
      const api = client({ [fail]: vi.fn(httpFail) });
      const result = await saveDrawerRecord(input(), api);
      expect(result.ok).toBe(false);
      expect(result.failedStep).toBe(step);
      const kept = draftsAfterSave(input().drafts, result.synced);
      expect(kept.notes).toBe(drafts.notes);
      expect(kept.nextStep).toBe(drafts.nextStep);
      expect(kept.deadline).toBe(drafts.deadline);
      expect(kept.commDraft).toBe(drafts.commDraft);
      expect(canCompleteLeave(result.ok, false)).toBe(false);
    });

    it(`Save and switch / Save and close keep drafts on network error of ${step}`, async () => {
      const api = client({ [fail]: vi.fn(networkError) });
      const result = await saveDrawerRecord(input(), api);
      expect(result.ok).toBe(false);
      expect(result.failedStep).toBe(step);
      expect(draftsAfterSave(input().drafts, result.synced).commDraft).toBe(drafts.commDraft);
      expect(canCompleteLeave(result.ok, false)).toBe(false);
    });
  }

  it("Save and switch and Save and close both refuse to leave when notes fail", async () => {
    const result = await saveDrawerRecord(input(), client({ updateApplication: vi.fn(httpFail) }));
    expect(canCompleteLeave(result.ok, false)).toBe(false);
    expect(draftsAfterSave(input().drafts, result.synced).notes).toBe("edited notes");
    expect(draftsAfterSave(input().drafts, result.synced).commDraft).toBe(drafts.commDraft);
  });

  it("does not call later steps after an earlier failure", async () => {
    const api = client({ updateApplication: vi.fn(httpFail) });
    await saveDrawerRecord(input(), api);
    expect(api.patchHubJob).not.toHaveBeenCalled();
    expect(api.addCommNote).not.toHaveBeenCalled();
  });
});

describe("saveDrawerRecord success and partial retry", () => {
  it("clears the comm draft only after addCommNote succeeds", async () => {
    const result = await saveDrawerRecord(input(), client());
    expect(result.ok).toBe(true);
    expect(result.synced.commCleared).toBe(true);
    expect(draftsAfterSave(input().drafts, result.synced).commDraft).toBe("");
    expect(canCompleteLeave(result.ok, false)).toBe(true);
  });

  it("syncs saved notes on partial success and retries only remaining steps", async () => {
    const first = client({ patchHubJob: vi.fn(httpFail) });
    const partial = await saveDrawerRecord(input(), first);
    expect(partial.ok).toBe(false);
    expect(partial.failedStep).toBe("next_step");
    expect(partial.synced.notes).toBe("edited notes");
    expect(partial.synced.commCleared).toBeUndefined();
    expect(first.addCommNote).not.toHaveBeenCalled();
    const remaining = draftsAfterSave(input().drafts, partial.synced);
    expect(remaining.commDraft).toBe(drafts.commDraft);

    const retryClient = client();
    const retry = await saveDrawerRecord(
      input({
        shownNotes: partial.synced.notes ?? input().shownNotes,
        shownNextStep: input().shownNextStep,
        shownDeadline: input().shownDeadline,
        drafts: remaining,
      }),
      retryClient,
    );
    expect(retry.ok).toBe(true);
    expect(retryClient.updateApplication).not.toHaveBeenCalled();
    expect(retryClient.patchHubJob).toHaveBeenCalledOnce();
    expect(retryClient.addCommNote).toHaveBeenCalledOnce();
    expect(retryClient.addCommNote).toHaveBeenCalledWith("app-a", "emailed recruiter");
  });

  it("patches contact through the application update API and keeps it on failure", async () => {
    const contactDrafts: DrawerDrafts = { ...drafts, notes: "old notes", contact: "Ada / wechat: ada" };
    const api = client({ updateApplication: vi.fn(httpFail) });
    const result = await saveDrawerRecord(
      input({ shownNotes: "old notes", shownContact: "", drafts: contactDrafts }),
      api,
    );
    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("contact");
    expect(api.updateApplication).toHaveBeenCalledWith("app-a", { contact: "Ada / wechat: ada" });
    expect(draftsAfterSave(contactDrafts, result.synced).contact).toBe("Ada / wechat: ada");
    expect(canCompleteLeave(result.ok, false)).toBe(false);
  });

  it("saves contact and reloads the synced value", async () => {
    const contactDrafts: DrawerDrafts = { ...drafts, notes: "old notes", contact: "Ada / wechat: ada" };
    const result = await saveDrawerRecord(
      input({ shownNotes: "old notes", shownContact: "", drafts: contactDrafts }),
      client(),
    );
    expect(result.ok).toBe(true);
    expect(result.synced.contact).toBe("Ada / wechat: ada");
    const record = applyDrawerSynced(
      "app-a",
      "app-a",
      { id: "app-a", notes: "old notes", contact: "" },
      result.synced,
    );
    expect(record?.contact).toBe("Ada / wechat: ada");
  });
});

describe("in-flight save lock", () => {
  it("blocks duplicate save so a slow notes request is not posted twice", async () => {
    const lock = createDrawerSaveLock();
    let resolveNotes: ((value: object | null) => void) | undefined;
    const updateApplication = vi.fn(
      () =>
        new Promise<object | null>((resolve) => {
          resolveNotes = resolve;
        }),
    );
    const addCommNote = vi.fn(async () => ({ id: "note-1" }));
    const api = client({ updateApplication, addCommNote, patchHubJob: vi.fn(async () => ({ id: "job-a" })) });

    const first = withDrawerSaveLock(lock, () => saveDrawerRecord(input(), api));
    const second = await withDrawerSaveLock(lock, () => saveDrawerRecord(input(), api));
    expect(second).toBeNull();
    expect(drawerActionsLocked(lock.current)).toBe(true);
    expect(canCompleteLeave(true, lock.current)).toBe(false);

    resolveNotes?.({ id: "app-a" });
    const finished = await first;
    expect(finished?.ok).toBe(true);
    expect(updateApplication).toHaveBeenCalledOnce();
    expect(addCommNote).toHaveBeenCalledOnce();
    expect(drawerActionsLocked(lock.current)).toBe(false);
  });

  it("does not apply a late response onto another record", async () => {
    let currentId = "app-a";
    let resolveNotes: ((value: object | null) => void) | undefined;
    const api = client({
      updateApplication: () =>
        new Promise<object | null>((resolve) => {
          resolveNotes = resolve;
        }),
    });
    const pending = saveDrawerRecord(input(), api, { isCancelled: () => currentId !== "app-a" });
    currentId = "app-b";
    resolveNotes?.({ id: "app-a" });
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(
      applyDrawerSynced("app-b", "app-a", { id: "app-b", notes: "other" }, result.synced),
    ).toBeNull();
  });
});

describe("live API adapters return null on HTTP and network errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updateApplication / patchHubJob / addCommNote return null on HTTP 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    expect(await updateApplication("app-a", { notes: "x" })).toBeNull();
    expect(await patchHubJob("job-a", { next_step: "Prep OA", deadline: null })).toBeNull();
    expect(await addCommNote("app-a", "hello")).toBeNull();
  });

  it("updateApplication / patchHubJob / addCommNote return null on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Failed to fetch");
      }),
    );
    expect(await updateApplication("app-a", { notes: "x" })).toBeNull();
    expect(await patchHubJob("job-a", { next_step: "Prep OA", deadline: null })).toBeNull();
    expect(await addCommNote("app-a", "hello")).toBeNull();
  });
});
