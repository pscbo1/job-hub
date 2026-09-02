import { describe, expect, it } from "vitest";

import {
  APPLICATION_ROW_MORE_LABEL,
  APPLICATION_VIEW_OPTIONS_GROUPS,
  APPLICATION_VIEW_OPTIONS_LABEL,
  ASSIST_BTN_PRIMARY,
  ASSIST_BTN_SECONDARY,
  ASSIST_COPY,
  ASSIST_NO_APPLY_URL,
  DEFAULT_APPLICATION_TAB,
  applicationRowMoreLabel,
  assistPacketReadiness,
  latestSubmissionLine,
  nextStepLabel,
  parseApplicationTab,
  tabQueryValue,
  packetWorkbenchPath,
} from "@/lib/applicationUi";
import { DIRTY_SWITCH_LABELS, recordSwitchDecision } from "@/lib/recordDraft";
import { sourceAction } from "@/lib/sourceAction";
import { formatCalendarDate, formatDateTimeInAppTz } from "@/lib/timezone";
import type { Application } from "@/lib/api";

describe("sourceAction", () => {
  it("prefers a real http apply URL", () => {
    expect(
      sourceAction({
        apply_url: "https://boards.example.com/apply/1",
        url: "https://example.com/job",
      }),
    ).toEqual({
      kind: "apply",
      href: "https://boards.example.com/apply/1",
      label: "Open apply page",
    });
  });

  it("falls back to source URL and never invents conversation or email links", () => {
    expect(
      sourceAction({
        apply_url: "mailto:hr@example.com",
        url: "https://example.com/job",
        job_url: "https://example.com/other",
      }),
    ).toEqual({ kind: "source", href: "https://example.com/job", label: "Open source" });
    expect(sourceAction({ apply_url: "", url: "", job_url: "" })).toEqual({
      kind: "missing",
      href: "",
      label: "Link missing",
    });
  });
});

describe("application drawer helpers", () => {
  it("maps packet deep links to the Materials tab and defaults to Overview", () => {
    expect(parseApplicationTab("packet")).toBe("materials");
    expect(parseApplicationTab("materials")).toBe("materials");
    expect(parseApplicationTab("notes")).toBe("notes");
    expect(parseApplicationTab("overview")).toBe("overview");
    expect(parseApplicationTab(null)).toBe("overview");
    expect(DEFAULT_APPLICATION_TAB).toBe("overview");
    expect(tabQueryValue("materials")).toBe("packet");
    expect(tabQueryValue("overview")).toBe(null);
  });

  it("keeps assist action-row buttons on one size and weight pair", () => {
    expect(ASSIST_BTN_PRIMARY).toMatch(/h-10/);
    expect(ASSIST_BTN_SECONDARY).toMatch(/h-10/);
    expect(ASSIST_BTN_PRIMARY).toMatch(/bg-ink/);
    expect(ASSIST_BTN_SECONDARY).toMatch(/border-line/);
    expect(ASSIST_BTN_PRIMARY).toMatch(/rounded-lg/);
    expect(ASSIST_BTN_SECONDARY).toMatch(/rounded-lg/);
  });

  it("keeps packet readiness from blocking the apply action", () => {
    expect(assistPacketReadiness(0)).toBe("Nothing selected yet.");
    expect(assistPacketReadiness(2)).toBe("2 selected");
    expect(ASSIST_NO_APPLY_URL).toBe("No apply URL stored");
    expect(packetWorkbenchPath("app-1")).toBe("/applications/app-1/packet");
    expect(ASSIST_COPY.choose).toBe("Select materials");
    expect(ASSIST_COPY.openApply).toBe("Open apply page");
    expect(ASSIST_COPY.openWindow).toBe("Open in new window");
    expect(ASSIST_COPY.copyLink).toBe("Copy link");
    expect(ASSIST_COPY.filesSection).toBe("Files");
    expect(ASSIST_COPY.knowledgeSection).toBe("Templates & answers");
  });

  it("shows an em dash when next step is empty", () => {
    expect(nextStepLabel("")).toBe("—");
    expect(nextStepLabel("Prep OA")).toBe("Prep OA");
  });

  it("summarizes the latest submission without treating bindings as history", () => {
    const app = {
      id: "a",
      title: "Role",
      employer: "Acme",
      submissions: [
        {
          id: "s1",
          submitted_at: "2026-06-09T12:00:00Z",
          packet_snapshot: { material_version_ids: ["v1"], items: [{ title: "Resume" }] },
        },
      ],
    } as unknown as Application;
    expect(latestSubmissionLine(app)).toMatch(/Last submission/);
    expect(latestSubmissionLine(app)).toMatch(/1 material/);
  });
});

describe("timezone display", () => {
  it("formats calendar dates without shifting the day", () => {
    expect(formatCalendarDate("2026-04-01")).toMatch(/Apr 1/);
  });

  it("formats datetimes in the app timezone", () => {
    const label = formatDateTimeInAppTz("2026-06-09T12:00:00Z");
    expect(label).toMatch(/Jun/);
    expect(label).not.toBe("—");
  });
});

describe("dirty switch labels", () => {
  it("keeps save / discard / stay wording", () => {
    expect(DIRTY_SWITCH_LABELS).toEqual({
      save: "Save and switch",
      discard: "Discard",
      stay: "Stay",
    });
    expect(recordSwitchDecision("a", "b", true)).toBe("confirm");
  });
});

describe("application toolbar and row overflow copy", () => {
  it("uses View options and More actions instead of repeating More", () => {
    expect(APPLICATION_VIEW_OPTIONS_LABEL).toBe("View options");
    expect(APPLICATION_VIEW_OPTIONS_GROUPS).toEqual({
      views: "Views",
      tags: "Tags",
      cleanup: "Cleanup settings",
    });
    expect(APPLICATION_ROW_MORE_LABEL).toBe("More actions");
    expect(applicationRowMoreLabel("Backend Engineer")).toBe(
      "More actions for Backend Engineer",
    );
    expect(applicationRowMoreLabel("")).toBe("More actions for Untitled");
  });
});
