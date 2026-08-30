import { describe, expect, it } from "vitest";

import { clampMenuPosition, companyAlreadyListed } from "@/lib/jobPoolMenu";

describe("jobPoolMenu", () => {
  it("clamps the menu inside the viewport", () => {
    expect(clampMenuPosition(2000, 2000, { width: 800, height: 600 })).toEqual({
      x: 800 - 196 - 8,
      y: 600 - 96 - 8,
    });
    expect(clampMenuPosition(-20, -10, { width: 800, height: 600 })).toEqual({ x: 8, y: 8 });
  });

  it("detects a company already in Hidden Companies", () => {
    expect(companyAlreadyListed(["Acme", "Other"], "acme")).toBe(true);
    expect(companyAlreadyListed(["Acme"], "Beta")).toBe(false);
    expect(companyAlreadyListed([], "Acme")).toBe(false);
  });
});
