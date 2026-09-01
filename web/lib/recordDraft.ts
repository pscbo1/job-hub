/** Helpers for switching records without cross-writing unsaved drafts. */

export type RecordSwitchDecision = "apply" | "confirm";

export function recordSwitchDecision(
  currentId: string,
  nextId: string,
  dirty: boolean,
): RecordSwitchDecision {
  if (!currentId || currentId === nextId || !dirty) return "apply";
  return "confirm";
}

export function isStaleGeneration(started: number, current: number): boolean {
  return started !== current;
}

export const DIRTY_SWITCH_LABELS = {
  save: "Save and switch",
  discard: "Discard",
  stay: "Stay",
} as const;
