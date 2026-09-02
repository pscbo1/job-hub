import { describe, expect, it } from "vitest";

import { hasJobContact } from "@/lib/jobContact";

describe("hasJobContact", () => {
  it("is hidden when empty", () => {
    expect(hasJobContact("")).toBe(false);
    expect(hasJobContact("   ")).toBe(false);
    expect(hasJobContact(undefined)).toBe(false);
  });

  it("is visible for leftover free text", () => {
    expect(hasJobContact("Ada / wechat: ada")).toBe(true);
  });
});
