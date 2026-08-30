export const SHOW_SPONSORSHIP_KEY = "jobhub.jobs.showSponsorshipInfo";

function storage(): Storage | null {
  try {
    const g = globalThis as typeof globalThis & { localStorage?: Storage };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readShowSponsorshipInfo(): boolean {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(SHOW_SPONSORSHIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeShowSponsorshipInfo(on: boolean): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(SHOW_SPONSORSHIP_KEY, on ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}
