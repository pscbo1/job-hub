/** User-facing Collect Jobs copy. Keep backend terms out of the main UI. */

export const COLLECT_TOAST_MS = 4000;

export interface CollectToastContent {
  title: string;
  lines: string[];
}

/** Map Collect Jobs UI filters onto `/api/collect/jobs` query fields. */
export function collectQueryFilters(
  remoteOnly: boolean,
  datePostedDays: string,
): { remote?: boolean; date_posted_days?: number } {
  const posted = Number(datePostedDays);
  return {
    ...(remoteOnly ? { remote: true } : {}),
    ...(Number.isFinite(posted) && posted > 0 ? { date_posted_days: posted } : {}),
  };
}

export function formatCollectPlan(sourceCount: number, maxResults: number): string {
  const sources = sourceCount === 1 ? "1 source selected" : `${sourceCount} sources selected`;
  return `${sources} · up to ${maxResults} jobs/source`;
}

export function formatCollectResult(created: number, updated: number, excluded: number): string {
  return `${created} new · ${updated} refreshed · ${excluded} excluded`;
}

export function formatPoolTotal(total: number): string {
  return total === 1 ? "Job Pool now has 1 job" : `Job Pool now has ${total} jobs`;
}

export function shouldShowPoolTotal(poolCount: number, jobsCreated: number): boolean {
  return poolCount > 0 || jobsCreated === 0;
}

export function sourceDisplayName(id: string, labelsById: Record<string, string>): string {
  if (labelsById[id]) return labelsById[id];
  if (!id.trim()) return "A source";
  return id.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function failedSourceLabels(
  results: Array<{ name?: string; succeeded?: boolean }>,
  labelsById: Record<string, string>,
): string[] {
  return results
    .filter((s) => s.succeeded === false)
    .map((s) => sourceDisplayName(String(s.name ?? ""), labelsById));
}

export function formatFailedSourcesLine(failedLabels: string[], othersContinued: boolean): string {
  if (failedLabels.length === 0) {
    return othersContinued ? "Some sources failed; other sources continued" : "Collection failed";
  }
  const names =
    failedLabels.length === 1
      ? failedLabels[0]
      : failedLabels.length === 2
        ? `${failedLabels[0]} and ${failedLabels[1]}`
        : `${failedLabels.slice(0, -1).join(", ")}, and ${failedLabels[failedLabels.length - 1]}`;
  return othersContinued ? `${names} failed; other sources continued` : `${names} failed`;
}

export function buildCollectToast(input: {
  status: "completed" | "failed" | "partial" | "unreachable";
  created: number;
  updated: number;
  excluded: number;
  poolTotal: number | null;
  failedLabels: string[];
  othersContinued: boolean;
}): CollectToastContent {
  if (input.status === "unreachable") {
    return { title: "Collect failed", lines: ["Couldn't reach the local API."] };
  }
  if (input.status === "completed") {
    const lines = [formatCollectResult(input.created, input.updated, input.excluded)];
    if (input.poolTotal != null) {
      lines.push(`Job Pool: ${input.poolTotal} total`);
    }
    return { title: "Collect complete", lines };
  }
  return {
    title: "Collect partially completed",
    lines: [formatFailedSourcesLine(input.failedLabels, input.othersContinued)],
  };
}
