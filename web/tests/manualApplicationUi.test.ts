import { afterEach, describe, expect, it, vi } from "vitest";

import { createManualApplication, type Application } from "@/lib/api";
import {
  manualApplicationFieldErrors,
  manualApplicationHidden,
} from "@/lib/manualApplicationUi";

const DRAFT = {
  id: "a1",
  title: "Backend Engineer",
  employer: "Acme",
  location: "Shanghai",
  source: "manual",
  stage: "draft",
  tags: [],
} as Application;

describe("manual Add application UI rules", () => {
  it("requires trimmed title and company and validates optional URL", () => {
    expect(
      manualApplicationFieldErrors({ title: " ", company: "", jobUrl: "javascript:x" }),
    ).toEqual({
      title: "Job title is required.",
      company: "Company is required.",
      job_url: "Enter a full http(s) link with a host.",
    });
    expect(
      manualApplicationFieldErrors({
        title: "Backend Engineer",
        company: "Acme",
        jobUrl: "https://example.com/jobs/1",
      }),
    ).toEqual({});
  });

  it("detects whether current filters hide the new Draft", () => {
    const base = {
      board: "open" as const,
      staleOnly: false,
      stage: "all",
      source: "",
      query: "",
      selectedTags: [] as string[],
    };
    expect(manualApplicationHidden(DRAFT, base)).toBe(false);
    expect(manualApplicationHidden(DRAFT, { ...base, stage: "applied" })).toBe(true);
    expect(manualApplicationHidden(DRAFT, { ...base, source: "linkedin" })).toBe(true);
    expect(manualApplicationHidden(DRAFT, { ...base, query: "research" })).toBe(true);
    expect(manualApplicationHidden(DRAFT, { ...base, board: "closed" })).toBe(true);
  });
});

describe("manual Add application API result", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns field errors without treating them as a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: [{ loc: ["body", "title"], msg: "Field required" }],
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const result = await createManualApplication({
      request_id: crypto.randomUUID(),
      title: "",
      company: "Acme",
    });
    expect(result).toEqual({
      ok: false,
      kind: "validation",
      fields: { title: "Field required" },
    });
  });

  it("exposes duplicate choice details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: {
              code: "duplicate_candidate",
              duplicate_candidate: {
                job: {
                  id: "j1",
                  title: "Backend Engineer",
                  company: "Acme",
                  location: "",
                  job_url: "https://example.com/1",
                  market: "cn",
                },
                application: null,
              },
            },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const result = await createManualApplication({
      request_id: crypto.randomUUID(),
      title: "Backend Engineer",
      company: "Acme",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("duplicate");
  });
});
