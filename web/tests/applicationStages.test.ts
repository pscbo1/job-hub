import { describe, expect, it } from "vitest";

import { CLOSE_REASON_LABELS_ZH } from "@/lib/api";
import { applicationWasSubmitted } from "@/lib/applicationLifecycle";
import { COMMAND_PALETTE_NAV } from "@/lib/commandPaletteNav";

describe("sealed application vocabulary", () => {
  it("uses Chinese close reasons without rejected", () => {
    expect(CLOSE_REASON_LABELS_ZH.not_selected).toBe("未录用");
    expect(CLOSE_REASON_LABELS_ZH.no_response).toBe("无回复");
    expect(CLOSE_REASON_LABELS_ZH.withdrew).toBe("主动结束");
    expect(CLOSE_REASON_LABELS_ZH.other).toBe("其他");
    expect(JSON.stringify(CLOSE_REASON_LABELS_ZH)).not.toMatch(/reject/i);
  });

  it("treats only never-submitted drafts as deletable", () => {
    expect(applicationWasSubmitted({ stage: "draft", submissions: [] })).toBe(false);
    expect(applicationWasSubmitted({ stage: "applied", submissions: [] })).toBe(true);
    expect(
      applicationWasSubmitted({
        stage: "draft",
        submissions: [{ id: "s1" }],
      }),
    ).toBe(true);
  });
});

describe("command palette product cut", () => {
  it("does not advertise Studio, Profile, or Documents", () => {
    const labels = COMMAND_PALETTE_NAV.map((item) => item.label.toLowerCase());
    const hrefs = COMMAND_PALETTE_NAV.map((item) => item.href);
    expect(labels).not.toContain("studio");
    expect(labels).not.toContain("profile");
    expect(labels).not.toContain("documents");
    expect(labels).not.toContain("my jobs");
    expect(hrefs).not.toContain("/studio");
    expect(hrefs).not.toContain("/profile");
    expect(hrefs).not.toContain("/resumes");
    expect(hrefs).toContain("/tasks");
    expect(hrefs).not.toContain("/my-jobs");
  });
});
