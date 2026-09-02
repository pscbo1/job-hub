/** Light free-text direction tags. Not a taxonomy and not a list column. */

export const MAX_TAG_LENGTH = 40;
export const MAX_APPLICATION_TAGS = 20;

export function normalizeApplicationTags(
  values: readonly unknown[],
  known: readonly string[] = [],
): string[] {
  const reused = new Map<string, string>();
  for (const item of known) {
    const text = item.trim();
    if (text) reused.set(text.toLowerCase(), text);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const text = String(raw ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, MAX_TAG_LENGTH);
    if (!text) continue;
    const reusedText = reused.get(text.toLowerCase()) ?? text;
    const key = reusedText.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(reusedText);
    if (out.length >= MAX_APPLICATION_TAGS) break;
  }
  return out;
}

export function uniqueApplicationTags(
  apps: readonly { tags?: string[] | null }[],
): string[] {
  return normalizeApplicationTags(apps.flatMap((app) => app.tags ?? []));
}

export function suggestApplicationTags(current: readonly string[], known: readonly string[]): string[] {
  const have = new Set(normalizeApplicationTags(current).map((tag) => tag.toLowerCase()));
  return normalizeApplicationTags(known).filter((tag) => !have.has(tag.toLowerCase()));
}

export function applicationMatchesTags(
  app: { tags?: string[] | null },
  selected: readonly string[],
): boolean {
  const wanted = normalizeApplicationTags(selected);
  if (wanted.length === 0) return true;
  const have = new Set(normalizeApplicationTags(app.tags ?? []).map((tag) => tag.toLowerCase()));
  return wanted.some((tag) => have.has(tag.toLowerCase()));
}

export function tagsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tag, index) => tag === b[index]);
}
