import type { ApplicationStage } from "@/lib/api";

const SUBMITTED_STAGES: ReadonlySet<ApplicationStage> = new Set([
  "applied",
  "interview",
  "offer",
  "closed",
]);

/** True once the application has been submitted at least once. */
export function applicationWasSubmitted(app: {
  stage: ApplicationStage;
  submissions?: readonly unknown[] | null;
}): boolean {
  if (SUBMITTED_STAGES.has(app.stage)) return true;
  return (app.submissions?.length ?? 0) > 0;
}
