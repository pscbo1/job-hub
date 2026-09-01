import { describe, expect, it } from "vitest";

import { CLOSE_REASON_LABELS_ZH } from "@/lib/api";

describe("sealed application vocabulary", () => {
  it("uses Chinese close reasons without rejected", () => {
    expect(CLOSE_REASON_LABELS_ZH.not_selected).toBe("未录用");
    expect(CLOSE_REASON_LABELS_ZH.no_response).toBe("无回复");
    expect(CLOSE_REASON_LABELS_ZH.withdrew).toBe("主动结束");
    expect(CLOSE_REASON_LABELS_ZH.other).toBe("其他");
    expect(JSON.stringify(CLOSE_REASON_LABELS_ZH)).not.toMatch(/reject/i);
  });
});
