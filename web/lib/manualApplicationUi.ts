import type { Application } from "@/lib/api";

export interface ManualApplicationFilters {
  board: "open" | "closed";
  staleOnly: boolean;
  stage: string;
  source: string;
  query: string;
  selectedTags: string[];
}

export function manualApplicationFieldErrors(input: {
  title: string;
  company: string;
  jobUrl: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = input.title.trim();
  const company = input.company.trim();
  if (!title) errors.title = "Job title is required.";
  else if (title.length > 200) errors.title = "Use 200 characters or fewer.";
  if (!company) errors.company = "Company is required.";
  else if (company.length > 200) errors.company = "Use 200 characters or fewer.";
  const link = input.jobUrl.trim();
  if (link.length > 2048) errors.job_url = "Use 2048 characters or fewer.";
  if (link) {
    try {
      const parsed = new URL(link);
      if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
        errors.job_url = "Enter a full http(s) link with a host.";
      }
    } catch {
      errors.job_url = "Enter a full http(s) link with a host.";
    }
  }
  return errors;
}

export function manualApplicationHidden(
  app: Application,
  filters: ManualApplicationFilters,
): boolean {
  if (filters.board === "closed" || filters.staleOnly) return true;
  if (filters.stage !== "all" && app.stage !== filters.stage) return true;
  if (filters.source && app.source !== filters.source) return true;
  if (
    filters.selectedTags.length > 0 &&
    !filters.selectedTags.some((tag) => (app.tags ?? []).includes(tag))
  ) {
    return true;
  }
  const query = filters.query.trim().toLowerCase();
  if (!query) return false;
  return ![
    app.title,
    app.employer,
    app.location,
    app.source,
    app.notes,
    app.next_step,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}
