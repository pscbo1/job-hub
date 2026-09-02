import type { Application, Material, MaterialVersion, PacketItem, PacketSnapshotItem } from "@/lib/api";
import { formatCalendarDate } from "@/lib/timezone";

export function materialCountLabel(count: number): string {
  if (count <= 0) return "No materials";
  return count === 1 ? "1 material" : `${count} materials`;
}

export function currentMaterialCount(app: Application): number {
  return app.current_material_count ?? 0;
}

export function formatAppliedDate(value: string): string {
  if (!value) return "—";
  return formatCalendarDate(value.slice(0, 10));
}

export function snapshotItemLabel(item: PacketSnapshotItem): string {
  const version = item.version_label
    ? `v${item.version_number} · ${item.version_label}`
    : `v${item.version_number}`;
  const file = item.original_filename || item.url || "";
  return [item.title, version, file].filter(Boolean).join(" · ");
}

export type MaterialLane = "files" | "knowledge";

/** Display copy only. Lane ids stay `files` / `knowledge`. */
export const MATERIAL_LANE_COPY: Record<
  MaterialLane,
  {
    tab: string;
    description: string;
    add: string;
    search: string;
    empty: string;
    createTitle: string;
  }
> = {
  files: {
    tab: "Documents",
    description: "Resumes, cover letters, portfolios, and supporting documents.",
    add: "Add document",
    search: "Search documents",
    empty: "No documents in this tab.",
    createTitle: "Add document",
  },
  knowledge: {
    tab: "Templates & Answers",
    description: "Reusable messages and application answers.",
    add: "Add template or answer",
    search: "Search templates and answers",
    empty: "No templates or answers in this tab.",
    createTitle: "Add template or answer",
  },
};

export const FILE_MATERIAL_KINDS = [
  "resume",
  "cover_letter",
  "portfolio",
  "transcript",
  "other",
] as const;

export const KNOWLEDGE_MATERIAL_KINDS = ["message_template", "application_answer"] as const;

export function isKnowledgeKind(kind: string): boolean {
  return kind === "message_template" || kind === "application_answer";
}

export function formatKind(kind: string): string {
  return kind.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function looksLikeVersionNoise(value: string): boolean {
  return /^v?\d+$/i.test(value) || /^\d+\s*·\s*\d+$/.test(value);
}

/** Title for workbench rows and picker: human name, never raw vN · N. */
export function humanMaterialTitle(
  material?: { title?: string | null; kind?: string | null } | null,
  version?: { original_filename?: string | null } | null,
): string {
  const title = (material?.title ?? "").trim();
  if (title && !looksLikeVersionNoise(title)) return title;
  const file = (version?.original_filename ?? "").trim();
  if (file) return file.replace(/\.[^.]+$/, "") || file;
  const kind = (material?.kind ?? "").trim();
  if (kind) return formatKind(kind);
  if (title) return title;
  return "Untitled material";
}

/** Extra version text when one material has several files. Skip numeric junk. */
export function humanVersionLabel(
  version?: {
    version_label?: string | null;
    original_filename?: string | null;
    version_date?: string | null;
    display_label?: string | null;
    version_number?: number | null;
  } | null,
): string {
  const label = (version?.version_label ?? "").trim();
  if (label && !looksLikeVersionNoise(label)) return label;
  const file = (version?.original_filename ?? "").trim();
  if (file) return file;
  const date = (version?.version_date ?? "").trim();
  if (date) return date;
  const display = (version?.display_label ?? "").trim();
  if (display && !looksLikeVersionNoise(display.replace(/^v/i, "").trim())) return display;
  const n = version?.version_number;
  return typeof n === "number" && n > 0 ? `Version ${n}` : "";
}

export function partitionPacketItems(items: PacketItem[]): {
  files: PacketItem[];
  knowledge: PacketItem[];
} {
  const files: PacketItem[] = [];
  const knowledge: PacketItem[] = [];
  for (const item of items) {
    if (isKnowledgeKind(item.material?.kind ?? "")) knowledge.push(item);
    else files.push(item);
  }
  return { files, knowledge };
}

export function partitionMaterials(rows: Material[]): {
  files: Material[];
  knowledge: Material[];
} {
  const files: Material[] = [];
  const knowledge: Material[] = [];
  for (const row of rows) {
    if (isKnowledgeKind(row.kind)) knowledge.push(row);
    else files.push(row);
  }
  return { files, knowledge };
}

export function latestVersion(material: Material): MaterialVersion | null {
  const live = material.versions.filter((row) => !row.archived_at);
  if (live.length === 0) return null;
  return live.reduce((best, row) => (row.version_number > best.version_number ? row : best));
}

export function versionFileLabel(version: MaterialVersion): string {
  const versionPart = version.display_label
    ? version.display_label
    : version.version_label
      ? `v${version.version_number} · ${version.version_label}`
      : `v${version.version_number}`;
  const file = version.original_filename || version.url || "";
  return file ? `${versionPart} · ${file}` : versionPart;
}

export function expectedVersionIdsMatch(
  expected: string[] | null | undefined,
  current: string[],
): boolean {
  if (expected == null) return true;
  if (expected.length !== current.length) return false;
  const seen = new Set(current);
  return expected.every((id) => seen.has(id));
}

export function knowledgePreviewText(material: Material): string {
  const version = latestVersion(material);
  return (version?.text ?? version?.url ?? "").trim();
}

export function searchKnowledgeItems(items: Material[], query: string): Material[] {
  const knowledge = items.filter((row) => isKnowledgeKind(row.kind) && !row.archived_at);
  const q = query.trim().toLowerCase();
  if (!q) return knowledge;
  return knowledge.filter((row) => {
    const hay = [row.title, formatKind(row.kind), knowledgePreviewText(row)].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

export type KnowledgeBindDecision = "copy_only" | "bind_new" | "replace_version" | "unavailable";

export function knowledgeBindDecision(opts: {
  kind: string;
  items: PacketItem[] | null;
  materialId: string;
}): KnowledgeBindDecision {
  if (opts.kind !== "application_answer") return "copy_only";
  if (opts.items == null) return "unavailable";
  const existing = opts.items.find((row) => row.binding.material_id === opts.materialId);
  return existing ? "replace_version" : "bind_new";
}

export function copyFeedback(ok: boolean): "Copied" | "Copy failed" {
  return ok ? "Copied" : "Copy failed";
}
