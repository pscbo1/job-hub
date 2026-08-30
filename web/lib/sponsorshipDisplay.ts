import type { HubJob, SponsorshipInfo, SponsorshipStatus } from "@/lib/api";

export type SponsorshipChip = {
  label: string;
  title: string;
  classes: string;
};

const STATUS_CHIP: Record<Exclude<SponsorshipStatus, "unknown">, SponsorshipChip> = {
  explicit_yes: {
    label: "Sponsorship available",
    title: "This listing explicitly offers visa sponsorship",
    classes: "bg-emerald-100 text-emerald-700",
  },
  explicit_no: {
    label: "No sponsorship",
    title: "This listing explicitly does not offer visa sponsorship",
    classes: "bg-rose-100 text-rose-700",
  },
  employer_eligible: {
    label: "Licensed sponsor",
    title: "Employer appears on an official sponsor / recognised-employer register",
    classes: "bg-sky-100 text-sky-800",
  },
};

const ELIGIBLE_BY_COUNTRY: Record<string, string> = {
  GB: "Licensed sponsor",
  UK: "Licensed sponsor",
  NL: "Recognised sponsor",
};

export function sponsorshipFromJob(job: HubJob | null | undefined): SponsorshipInfo | null {
  const raw = job?.sponsorship;
  if (!raw || typeof raw !== "object") return null;
  return raw;
}

export function sponsorshipStatusChip(info: SponsorshipInfo | null | undefined): SponsorshipChip | null {
  if (!info) return null;
  const status = info.status;
  if (status === "explicit_yes" || status === "explicit_no") {
    return STATUS_CHIP[status];
  }
  if (status === "employer_eligible") {
    const country = (info.country || "").toUpperCase();
    return {
      ...STATUS_CHIP.employer_eligible,
      label: ELIGIBLE_BY_COUNTRY[country] || "Licensed sponsor",
    };
  }
  return null;
}

export function extraSponsorshipFacts(info: SponsorshipInfo | null | undefined): string[] {
  if (!info) return [];
  const bits: string[] = [];
  if (info.country) bits.push(info.country);
  if (info.visa_route) bits.push(info.visa_route);
  if (info.relocation_support === true) bits.push("Relocation");
  return bits;
}
