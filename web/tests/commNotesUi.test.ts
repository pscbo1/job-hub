import { describe, expect, it } from "vitest";

import { hasJobCommNotes } from "@/lib/commNotesUi";

describe("job communication notes", () => {
  it("shows the Job fold only when leftover notes exist", () => {
    expect(hasJobCommNotes([])).toBe(false);
    expect(hasJobCommNotes(undefined)).toBe(false);
    expect(hasJobCommNotes([{ id: "n1" }])).toBe(true);
  });
});
