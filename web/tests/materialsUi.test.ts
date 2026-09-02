import { describe, expect, it } from "vitest";

import { isStaleGeneration, DIRTY_SWITCH_LABELS, recordSwitchDecision } from "@/lib/recordDraft";
import {
  currentMaterialCount,
  expectedVersionIdsMatch,
  formatAppliedDate,
  latestVersion,
  materialCountLabel,
  MATERIAL_LANE_COPY,
} from "@/lib/materialsUi";
import type { Application, Material } from "@/lib/api";

function app(partial: Partial<Application>): Application {
  return {
    id: "a",
    title: "UX Researcher",
    employer: "Acme",
    location: "",
    url: "",
    source: "",
    stage: "applied",
    salary: "",
    applied_date: "2026-09-01",
    deadline: "",
    notes: "",
    posting_id: null,
    resume_document_id: null,
    created_at: "",
    updated_at: "",
    raw_data: {},
    ...partial,
  };
}

describe("materials list copy", () => {
  it("labels current bindings without inflating versions", () => {
    expect(materialCountLabel(0)).toBe("No materials");
    expect(materialCountLabel(1)).toBe("1 material");
    expect(materialCountLabel(2)).toBe("2 materials");
    expect(currentMaterialCount(app({ current_material_count: 2 }))).toBe(2);
    expect(currentMaterialCount(app({}))).toBe(0);
  });

  it("displays Documents / Templates & Answers without renaming lane ids", () => {
    expect(MATERIAL_LANE_COPY.files.tab).toBe("Documents");
    expect(MATERIAL_LANE_COPY.files.add).toBe("Add document");
    expect(MATERIAL_LANE_COPY.files.search).toBe("Search documents");
    expect(MATERIAL_LANE_COPY.files.empty).toBe("No documents in this tab.");
    expect(MATERIAL_LANE_COPY.files.description).toMatch(/Resumes, cover letters/);
    expect(MATERIAL_LANE_COPY.knowledge.tab).toBe("Templates & Answers");
    expect(MATERIAL_LANE_COPY.knowledge.add).toBe("Add template or answer");
    expect(MATERIAL_LANE_COPY.knowledge.search).toBe("Search templates and answers");
    expect(MATERIAL_LANE_COPY.knowledge.empty).toBe("No templates or answers in this tab.");
    expect(MATERIAL_LANE_COPY.knowledge.description).toMatch(/Reusable messages/);
  });

  it("formats applied date as month day", () => {
    expect(formatAppliedDate("2026-09-01")).toMatch(/Sep 1/);
  });

  it("picks the highest live version number", () => {
    const material = {
      id: "m",
      title: "Resume",
      kind: "resume",
      purpose: [],
      notes: "",
      created_at: "",
      updated_at: "",
      versions: [
        {
          id: "v1",
          material_id: "m",
          version_number: 1,
          version_label: "",
          purpose: [],
          file_ref: "",
          original_filename: "a.pdf",
          content_type: "",
          byte_size: 1,
          url: "",
          notes: "",
          created_at: "",
        },
        {
          id: "v2",
          material_id: "m",
          version_number: 2,
          version_label: "",
          purpose: [],
          file_ref: "",
          original_filename: "b.pdf",
          content_type: "",
          byte_size: 1,
          url: "",
          notes: "",
          created_at: "",
        },
      ],
    } as Material;
    expect(latestVersion(material)?.id).toBe("v2");
  });

  it("treats expected version ids as a set, not a count", () => {
    expect(expectedVersionIdsMatch(["a", "b"], ["b", "a"])).toBe(true);
    expect(expectedVersionIdsMatch(["a"], ["b"])).toBe(false);
    expect(expectedVersionIdsMatch(["a", "a"], ["a"])).toBe(false);
    expect(expectedVersionIdsMatch(null, ["a"])).toBe(true);
  });
});

describe("record switch", () => {
  it("confirms only when leaving a dirty record", () => {
    expect(recordSwitchDecision("a", "b", false)).toBe("apply");
    expect(recordSwitchDecision("a", "b", true)).toBe("confirm");
    expect(recordSwitchDecision("a", "a", true)).toBe("apply");
  });

  it("drops stale generations", () => {
    expect(isStaleGeneration(1, 2)).toBe(true);
    expect(isStaleGeneration(4, 4)).toBe(false);
  });

  it("exposes save / discard / stay labels", () => {
    expect(DIRTY_SWITCH_LABELS.stay).toBe("Stay");
    expect(DIRTY_SWITCH_LABELS.save).toBe("Save and switch");
  });
});
