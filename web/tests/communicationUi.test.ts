import { describe, expect, it } from "vitest";

import { COMMUNICATION_COPY } from "@/components/communication/copy";
import { SOURCE_OPTIONS } from "@/components/communication/types";

describe("communication chrome copy", () => {
  it("keeps the sealed tabs and empty-state pattern", () => {
    expect(COMMUNICATION_COPY.pendingTab).toBe("Needs action");
    expect(COMMUNICATION_COPY.retainedTab).toBe("Saved conversations");
    expect(COMMUNICATION_COPY.title).toBe("Communication");
    expect(COMMUNICATION_COPY.pendingEmptyTitle).toBe("Nothing needs action");
    expect(COMMUNICATION_COPY.retainedEmptyTitle).toBe("No saved conversations");
    expect(SOURCE_OPTIONS.map((item) => item.id)).toEqual(["email", "boss", "manual"]);
  });
});
