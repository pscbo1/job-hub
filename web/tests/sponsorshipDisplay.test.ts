import { describe, expect, it, vi } from "vitest";

import { readShowSponsorshipInfo, writeShowSponsorshipInfo } from "../lib/poolPrefs";
import {
  extraSponsorshipFacts,
  sponsorshipFromJob,
  sponsorshipStatusChip,
} from "../lib/sponsorshipDisplay";
import type { HubJob, SponsorshipInfo } from "../lib/api";
function installMemoryStorage(): void {
  const data = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
  vi.stubGlobal("localStorage", storage);
}

function job(info?: SponsorshipInfo | null): HubJob {
  return {
    id: "1",
    title: "Engineer",
    company: "Acme",
    location: "London",
    source: "linkedin",
    job_url: "https://example.test/job",
    published_at: null,
    discovered_at: "2026-08-30T00:00:00Z",
    status: null,
    match_score: null,
    sponsorship: info ?? undefined,
  };
}

describe("sponsorshipDisplay", () => {
  it("hides unknown and missing metadata", () => {
    expect(sponsorshipStatusChip(null)).toBeNull();
    expect(sponsorshipFromJob(job())).toBeNull();
    expect(sponsorshipStatusChip({ status: "unknown" })).toBeNull();
  });

  it("maps statuses to short labels", () => {
    expect(sponsorshipStatusChip({ status: "explicit_yes" })?.label).toBe("Sponsorship available");
    expect(sponsorshipStatusChip({ status: "explicit_no" })?.label).toBe("No sponsorship");
    expect(sponsorshipStatusChip({ status: "employer_eligible", country: "GB" })?.label).toBe(
      "Licensed sponsor",
    );
    expect(sponsorshipStatusChip({ status: "employer_eligible", country: "NL" })?.label).toBe(
      "Recognised sponsor",
    );
  });

  it("surfaces country, visa route, and relocation without dumping evidence", () => {
    expect(
      extraSponsorshipFacts({
        status: "explicit_yes",
        country: "GB",
        visa_route: "Skilled Worker",
        relocation_support: true,
      }),
    ).toEqual(["GB", "Skilled Worker", "Relocation"]);
  });
});

describe("poolPrefs sponsorship toggle", () => {
  it("defaults to off and persists the last choice", () => {
    installMemoryStorage();
    expect(readShowSponsorshipInfo()).toBe(false);
    writeShowSponsorshipInfo(true);
    expect(readShowSponsorshipInfo()).toBe(true);
    writeShowSponsorshipInfo(false);
    expect(readShowSponsorshipInfo()).toBe(false);
  });
});

describe("market pool prefs sponsorship flag", () => {
  it("defaults showSponsorship to false and round-trips", async () => {
    installMemoryStorage();
    const { readPoolPrefs, writePoolPrefs } = await import("../lib/marketPrefs");
    expect(readPoolPrefs("en").showSponsorship).toBe(false);
    writePoolPrefs("en", {
      country: "",
      sources: [],
      remote: false,
      postedDays: "",
      showSponsorship: true,
    });
    expect(readPoolPrefs("en").showSponsorship).toBe(true);
  });
});
