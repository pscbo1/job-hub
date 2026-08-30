/** Search filter capabilities. Prefer catalog.search_fields from the API. */

export const COMMON_FILTER_KEYS = [
  "keywords",
  "location",
  "remote",
  "date_posted_days",
  "max_results",
] as const;

export type SearchFilterKey = (typeof COMMON_FILTER_KEYS)[number];

export const DEFAULT_SEARCH_FIELDS: readonly SearchFilterKey[] = [
  "keywords",
  "location",
  "max_results",
];

/** Fallback when the API omitted search_fields (demo / older payloads). */
export const SOURCE_CAPABILITIES: Record<string, readonly SearchFilterKey[]> = {
  linkedin: ["keywords", "location", "remote", "date_posted_days", "max_results"],
  hiring_cafe: DEFAULT_SEARCH_FIELDS,
  boss: DEFAULT_SEARCH_FIELDS,
  liepin: DEFAULT_SEARCH_FIELDS,
  zhaopin: DEFAULT_SEARCH_FIELDS,
  impactpool: DEFAULT_SEARCH_FIELDS,
  tencent: DEFAULT_SEARCH_FIELDS,
};

export const FILTER_LABELS: Record<SearchFilterKey, string> = {
  keywords: "Keywords",
  location: "Location",
  remote: "Remote",
  date_posted_days: "Posted date",
  max_results: "Max results",
};

export interface CapableSource {
  id: string;
  label?: string;
  search_fields?: string[];
}

export interface CommonSearchFilters {
  keywords: string;
  location: string;
  remote: boolean | null;
  date_posted_days: number | null;
  max_results: number;
}

export interface SearchPreset {
  id: string;
  name: string;
  market: string;
  sources: string[];
  common_filters: CommonSearchFilters;
  source_overrides: Record<string, Record<string, unknown>>;
  created_at: string;
  updated_at: string;
}

export function fieldsForSource(source: CapableSource): SearchFilterKey[] {
  const listed = (source.search_fields ?? []).filter((key): key is SearchFilterKey =>
    (COMMON_FILTER_KEYS as readonly string[]).includes(key),
  );
  if (listed.length > 0) return listed;
  const fallback = SOURCE_CAPABILITIES[source.id] ?? DEFAULT_SEARCH_FIELDS;
  return [...fallback];
}

export function sourcesForField(
  field: SearchFilterKey,
  selected: Iterable<string>,
  catalog: readonly CapableSource[],
): CapableSource[] {
  const selectedIds = new Set(selected);
  return catalog.filter((source) => selectedIds.has(source.id) && fieldsForSource(source).includes(field));
}

export function fieldIsPartial(
  field: SearchFilterKey,
  selected: Iterable<string>,
  catalog: readonly CapableSource[],
): boolean {
  const selectedCount = [...selected].length;
  const supporting = sourcesForField(field, selected, catalog).length;
  return supporting > 0 && supporting < selectedCount;
}

export function emptyCommonFilters(): CommonSearchFilters {
  return {
    keywords: "",
    location: "",
    remote: null,
    date_posted_days: null,
    max_results: 100,
  };
}

function commonIsSet(filters: CommonSearchFilters, key: SearchFilterKey): boolean {
  if (key === "keywords") return Boolean(filters.keywords.trim());
  if (key === "location") return Boolean(filters.location.trim());
  if (key === "remote") return filters.remote === true;
  if (key === "date_posted_days") return (filters.date_posted_days ?? 0) > 0;
  if (key === "max_results") return true;
  return false;
}

export function presetLoadWarnings(
  preset: Pick<SearchPreset, "sources" | "common_filters" | "source_overrides">,
  catalog: readonly CapableSource[],
): string[] {
  const byId = new Map(catalog.map((source) => [source.id, source]));
  const warnings: string[] = [];
  const usable: string[] = [];
  for (const id of preset.sources) {
    if (byId.has(id)) usable.push(id);
    else warnings.push(`${id} is no longer available`);
  }
  for (const key of COMMON_FILTER_KEYS) {
    if (key === "keywords" || key === "max_results") continue;
    if (!commonIsSet(preset.common_filters, key)) continue;
    if (sourcesForField(key, usable, catalog).length === 0) {
      warnings.push(`${FILTER_LABELS[key]} is no longer supported by the selected sources`);
    }
  }
  for (const [sourceId, fields] of Object.entries(preset.source_overrides)) {
    const spec = byId.get(sourceId);
    if (!spec) continue;
    const caps = new Set(fieldsForSource(spec));
    for (const key of Object.keys(fields)) {
      if (!caps.has(key as SearchFilterKey)) {
        warnings.push(`${sourceId}: ${key} is no longer supported`);
      }
    }
  }
  return warnings;
}

export function snapshotEquals(
  a: { sources: string[]; common: CommonSearchFilters; overrides: Record<string, Record<string, unknown>> },
  b: { sources: string[]; common: CommonSearchFilters; overrides: Record<string, Record<string, unknown>> },
): boolean {
  return JSON.stringify(normalizeSnapshot(a)) === JSON.stringify(normalizeSnapshot(b));
}

function normalizeSnapshot(snap: {
  sources: string[];
  common: CommonSearchFilters;
  overrides: Record<string, Record<string, unknown>>;
}) {
  const sources = [...snap.sources].sort();
  const overrides: Record<string, Record<string, unknown>> = {};
  for (const id of sources) {
    const fields = snap.overrides[id];
    if (fields && Object.keys(fields).length > 0) overrides[id] = fields;
  }
  return {
    sources,
    common: {
      keywords: snap.common.keywords.trim(),
      location: snap.common.location.trim(),
      remote: snap.common.remote === true ? true : null,
      date_posted_days: snap.common.date_posted_days,
      max_results: snap.common.max_results,
    },
    overrides,
  };
}
