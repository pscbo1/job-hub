import type { Application, Material, MaterialVersion, PacketSnapshotItem } from "@/lib/api";

export function materialCountLabel(count: number): string {
  if (count <= 0) return "No materials";
  return count === 1 ? "1 material" : `${count} materials`;
}

export function currentMaterialCount(app: Application): number {
  return app.current_material_count ?? 0;
}

export function formatAppliedDate(value: string): string {
  if (!value) return "—";
  const iso = value.length === 10 ? `${value}T00:00:00` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function snapshotItemLabel(item: PacketSnapshotItem): string {
  const version = item.version_label
    ? `v${item.version_number} · ${item.version_label}`
    : `v${item.version_number}`;
  const file = item.original_filename || item.url || "";
  return [item.title, version, file].filter(Boolean).join(" · ");
}

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
