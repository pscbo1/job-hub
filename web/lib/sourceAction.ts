import { externalUrl } from "@/lib/utils";

export type SourceAction =
  | { kind: "apply"; href: string; label: "Open apply page" }
  | { kind: "source"; href: string; label: "Open source" }
  | { kind: "missing"; href: ""; label: "Link missing" };

function httpHref(raw: string | null | undefined): string {
  const href = externalUrl(raw ?? "");
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return "";
}

/** Prefer a stored apply URL; otherwise the job/source URL. Never invent chat/email links. */
export function sourceAction(input: {
  apply_url?: string | null;
  url?: string | null;
  job_url?: string | null;
}): SourceAction {
  const apply = httpHref(input.apply_url);
  if (apply) return { kind: "apply", href: apply, label: "Open apply page" };
  const source = httpHref(input.url) || httpHref(input.job_url);
  if (source) return { kind: "source", href: source, label: "Open source" };
  return { kind: "missing", href: "", label: "Link missing" };
}
