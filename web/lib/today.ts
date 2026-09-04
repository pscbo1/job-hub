export type TodayKind = "collect" | "sources" | "tasks" | "applications" | "discover";

export type TodaySuggestion = {
  href: string;
  label: string;
  detail: string;
  kind: TodayKind;
};

export const EMPTY_TODAY_SUGGESTIONS: TodaySuggestion[] = [
  {
    href: "/search",
    label: "Open Collect Jobs",
    detail: "Find and review a few new roles.",
    kind: "collect",
  },
  {
    href: "/settings",
    label: "Explore and configure sources",
    detail: "Review available channels and set up the ones you use.",
    kind: "sources",
  },
  {
    href: "/tasks",
    label: "Create a next step",
    detail: "Add a concrete task for a role you want to pursue.",
    kind: "tasks",
  },
];

export function todayWorkspaceState(input: {
  hasJobs: boolean;
  hasApplications: boolean;
  hasTasks: boolean;
}): { label: string; empty: boolean } {
  if (input.hasTasks) return { label: "Next steps", empty: false };
  if (input.hasApplications) return { label: "Applications", empty: false };
  if (input.hasJobs) return { label: "Choose a role", empty: false };
  return { label: "Getting started", empty: true };
}

export function todaySuggestions(input: {
  hasJobs: boolean;
  hasApplications: boolean;
  hasTasks: boolean;
}): TodaySuggestion[] {
  if (!input.hasJobs && !input.hasApplications && !input.hasTasks) {
    return EMPTY_TODAY_SUGGESTIONS;
  }
  const next: TodaySuggestion[] = [];
  if (input.hasTasks) {
    next.push({
      href: "/tasks",
      label: "Complete a next step",
      detail: "Work on the most important open task.",
      kind: "tasks",
    });
  }
  if (input.hasApplications) {
    next.push({
      href: "/applications",
      label: "Move an application forward",
      detail: "Continue the application with the clearest next action.",
      kind: "applications",
    });
  }
  if (input.hasJobs) {
    next.push({
      href: "/jobs",
      label: "Choose one role to pursue",
      detail: "Pick one opportunity and decide the next step.",
      kind: "discover",
    });
  }
  return next.slice(0, 3);
}
