/** Helpers for switching records without cross-writing unsaved drafts. */

export type RecordSwitchDecision = "apply" | "confirm";

export function recordSwitchDecision(currentId: string, nextId: string, dirty: boolean): RecordSwitchDecision {
  if (!currentId || currentId === nextId || !dirty) return "apply";
  return "confirm";
}

export function isStaleGeneration(started: number, current: number): boolean {
  return started !== current;
}
