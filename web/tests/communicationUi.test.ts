import { describe, expect, it } from "vitest";

import { COMMUNICATION_COPY } from "@/components/communication/types";

describe("communication chrome copy", () => {
  it("keeps sealed tab labels", () => {
    expect(COMMUNICATION_COPY.needsAction).toBe("Needs action");
    expect(COMMUNICATION_COPY.savedConversations).toBe("Saved conversations");
    expect(COMMUNICATION_COPY.needsAction.toLowerCase()).not.toContain("pending");
    expect(COMMUNICATION_COPY.savedConversations.toLowerCase()).not.toContain("retained");
  });

  it("uses an Applications-style empty state instead of a bare list label", () => {
    expect(COMMUNICATION_COPY.emptyPendingTitle).not.toBe("No conversations.");
    expect(COMMUNICATION_COPY.emptySavedTitle).not.toBe("No conversations.");
    expect(COMMUNICATION_COPY.emptyPendingBody.length).toBeGreaterThan(20);
    expect(COMMUNICATION_COPY.emptySavedBody.length).toBeGreaterThan(20);
    expect(COMMUNICATION_COPY.manualRecord).toBe("Manual record");
  });
});
