import { describe, expect, it } from "vitest";

import { isStaleGeneration, DIRTY_SWITCH_LABELS, recordSwitchDecision } from "@/lib/recordDraft";
import {
  copyFeedback,
  currentMaterialCount,
  expectedVersionIdsMatch,
  formatAppliedDate,
  knowledgeBindDecision,
  knowledgePreviewText,
  latestVersion,
  materialCountLabel,
  humanMaterialTitle,
  humanVersionLabel,
  MATERIAL_LANE_COPY,
  partitionPacketItems,
  searchKnowledgeItems,
} from "@/lib/materialsUi";
import type { Application, Material, PacketItem } from "@/lib/api";

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

  it("uses human titles instead of numeric display labels", () => {
    expect(humanMaterialTitle({ title: "English resume" })).toBe("English resume");
    expect(humanMaterialTitle({ title: "22 · 33" }, { original_filename: "resume.pdf" })).toBe(
      "resume",
    );
    expect(humanMaterialTitle({ title: "v22", kind: "resume" })).toBe("Resume");
    expect(humanVersionLabel({ display_label: "v22 · 33", version_number: 2 })).toBe("Version 2");
    expect(humanVersionLabel({ version_label: "research track" })).toBe("research track");
  });

  it("splits one packet into file and template lanes", () => {
    const resume: PacketItem = {
      binding: {
        id: "b-file",
        application_id: "a",
        material_id: "m-resume",
        material_version_id: "v-resume",
        sort_order: 0,
        created_at: "",
      },
      material: { id: "m-resume", title: "Resume", kind: "resume" } as Material,
      version: { id: "v-resume" } as Material["versions"][0],
    };
    const answer: PacketItem = {
      binding: {
        id: "b-ans",
        application_id: "a",
        material_id: "mat-answer",
        material_version_id: "ver-ans-1",
        sort_order: 1,
        created_at: "",
      },
      material: { id: "mat-answer", title: "Why this role", kind: "application_answer" } as Material,
      version: { id: "ver-ans-1" } as Material["versions"][0],
    };
    expect(partitionPacketItems([resume, answer])).toEqual({
      files: [resume],
      knowledge: [answer],
    });
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

describe("in-application templates and answers", () => {
  const template = {
    id: "mat-template",
    title: "Boss greeting",
    kind: "message_template",
    purpose: [],
    notes: "",
    created_at: "",
    updated_at: "",
    versions: [
      {
        id: "ver-tpl-1",
        material_id: "mat-template",
        version_number: 1,
        version_label: "",
        purpose: [],
        file_ref: "",
        original_filename: "content.md",
        content_type: "",
        byte_size: 1,
        url: "",
        notes: "",
        text: "Hi, thanks for the chat about the role.",
        created_at: "",
      },
    ],
  } as Material;
  const answer = {
    ...template,
    id: "mat-answer",
    title: "Why this role",
    kind: "application_answer",
    versions: [
      {
        ...template.versions[0],
        id: "ver-ans-1",
        material_id: "mat-answer",
        text: "I want to work on rider-experience research.",
      },
    ],
  } as Material;
  const bound: PacketItem = {
    binding: {
      id: "b1",
      application_id: "a",
      material_id: "mat-answer",
      material_version_id: "ver-ans-old",
      sort_order: 0,
      created_at: "",
    },
    material: answer,
    version: answer.versions[0],
  };

  it("searches knowledge items by title and body", () => {
    const rows = searchKnowledgeItems([template, answer], "rider");
    expect(rows.map((row) => row.id)).toEqual(["mat-answer"]);
    expect(searchKnowledgeItems([template, answer], "greeting")[0]?.id).toBe("mat-template");
    expect(knowledgePreviewText(answer)).toMatch(/rider-experience/);
  });

  it("copies templates only and binds or replaces answers", () => {
    expect(
      knowledgeBindDecision({ kind: "message_template", items: [], materialId: "mat-template" }),
    ).toBe("copy_only");
    expect(
      knowledgeBindDecision({ kind: "application_answer", items: [], materialId: "mat-answer" }),
    ).toBe("bind_new");
    expect(
      knowledgeBindDecision({
        kind: "application_answer",
        items: [bound],
        materialId: "mat-answer",
      }),
    ).toBe("replace_version");
    expect(
      knowledgeBindDecision({ kind: "application_answer", items: null, materialId: "mat-answer" }),
    ).toBe("unavailable");
    expect(copyFeedback(true)).toBe("Copied");
    expect(copyFeedback(false)).toBe("Copy failed");
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
