import { describe, expect, it } from "vitest";

import {
  NOTEBOOK_COPY,
  extractNotebookTopics,
  notebookMatchesQuery,
  notebookMatchesTopic,
  uniqueNotebookTopics,
  type NotebookPageRow,
} from "@/lib/notebook";

function page(partial: Partial<NotebookPageRow>): NotebookPageRow {
  return {
    id: "p",
    title: "Untitled",
    markdown_body: "",
    sort_order: 0,
    created_at: "",
    updated_at: "",
    topics: [],
    ...partial,
  };
}

describe("notebook copy", () => {
  it("stays out of Materials and packets", () => {
    expect(NOTEBOOK_COPY.title).toBe("Notebook");
    expect(NOTEBOOK_COPY.subtitle.toLowerCase()).toMatch(/not attached to applications/);
    expect(NOTEBOOK_COPY.subtitle.toLowerCase()).toMatch(/not added to packets/);
  });
});

describe("notebook topics and search", () => {
  it("reads #topics from title and body and searches both", () => {
    expect(extractNotebookTopics("Prep", "Ask about #visa and #research.")).toEqual([
      "visa",
      "research",
    ]);
    expect(extractNotebookTopics("## Heading", "no tag")).toEqual([]);
    const row = page({
      title: "Boss follow-up",
      markdown_body: "Keep a #follow-up log.",
      topics: ["follow-up"],
    });
    expect(notebookMatchesQuery(row, "follow")).toBe(true);
    expect(notebookMatchesQuery(row, "missing")).toBe(false);
    expect(notebookMatchesTopic(row, "#follow-up")).toBe(true);
    expect(uniqueNotebookTopics([row])).toEqual(["follow-up"]);
  });
});
