/** Collect Jobs source groups. Selection is always stored as individual source ids. */

export type SourceGroupId = "platform" | "vertical" | "company_careers";

export const SOURCE_GROUP_ORDER: SourceGroupId[] = [
  "platform",
  "vertical",
  "company_careers",
];

export const SOURCE_GROUP_LABELS: Record<SourceGroupId, string> = {
  platform: "Platforms",
  vertical: "Vertical Channels",
  company_careers: "Company Careers",
};

export interface GroupableSource {
  id: string;
  kind?: string;
  source_group?: string | null;
  enabled?: boolean;
  runnable?: boolean;
}

export function isSelectableCollectSource(source: GroupableSource): boolean {
  if (source.enabled === false) return false;
  return source.runnable !== false;
}

export function resolveSourceGroup(source: GroupableSource): SourceGroupId {
  const group = source.source_group;
  if (group === "platform" || group === "vertical" || group === "company_careers") {
    return group;
  }
  if (source.kind === "career_page") return "company_careers";
  if (source.kind === "vertical") return "vertical";
  return "platform";
}

export interface SourceGroupBucket<T extends GroupableSource> {
  id: SourceGroupId;
  label: string;
  sources: T[];
}

export function bucketCollectSources<T extends GroupableSource>(sources: T[]): SourceGroupBucket<T>[] {
  const selectable = sources.filter(isSelectableCollectSource);
  return SOURCE_GROUP_ORDER.map((id) => ({
    id,
    label: SOURCE_GROUP_LABELS[id],
    sources: selectable.filter((source) => resolveSourceGroup(source) === id),
  })).filter((bucket) => bucket.sources.length > 0);
}

export type GroupCheckState = "all" | "none" | "partial";

export function groupCheckState(groupIds: string[], selected: ReadonlySet<string>): GroupCheckState {
  if (groupIds.length === 0) return "none";
  const n = groupIds.filter((id) => selected.has(id)).length;
  if (n === 0) return "none";
  if (n === groupIds.length) return "all";
  return "partial";
}

/** Select every id in the group, or clear them all when already complete. */
export function toggleGroupSelection(
  groupIds: string[],
  selected: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selected);
  if (groupCheckState(groupIds, selected) === "all") {
    for (const id of groupIds) next.delete(id);
  } else {
    for (const id of groupIds) next.add(id);
  }
  return next;
}

export function toggleSourceSelection(id: string, selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Persist catalog ids only so future group members are not auto-selected. */
export function persistableSourceIds(
  selected: Iterable<string>,
  catalogIds: readonly string[],
): string[] {
  const allowed = new Set(catalogIds);
  return [...selected].filter((id) => allowed.has(id));
}

export function initialSourceSelection(
  remembered: string[] | null,
  catalogIds: readonly string[],
  defaults: readonly string[],
): string[] {
  const allowed = new Set(catalogIds);
  const seed = remembered ?? [...defaults];
  return seed.filter((id) => allowed.has(id));
}
