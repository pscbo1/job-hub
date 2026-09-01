/**
 * Demo dataset for the hosted (no-backend) preview.
 *
 * When NEXT_PUBLIC_DEMO=1, the typed client (lib/api.ts) returns this data
 * instead of calling the local API, so every screen is fully alive for a
 * first-time visitor on the public demo. It's a realistic but fictional
 * candidate — nothing here is real personal data.
 */

import type {
  Application,
  AuthStatus,
  GeneratedDocument,
  HubJob,
  JobPosting,
  JobSourceStatus,
  LlmStatus,
  MatchResult,
  Material,
  MaterialVersion,
  OpsStatus,
  PacketItem,
  Profile,
  SearchResponse,
  TailorResult,
} from "@/lib/api";

export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

export const demoProfile: Profile = {
  basics: {
    name: "Alex Rivera",
    headline: "Software Engineer — backend & ML · open to new grad / intern roles",
    email: "alex.rivera@example.com",
    phone: "+1 (555) 014-2273",
    location: "Austin, TX",
    links: [
      { label: "GitHub", url: "https://github.com/example" },
      { label: "LinkedIn", url: "https://linkedin.com/in/example" },
    ],
    summary:
      "Backend-leaning software engineer with 3 internships shipping production services at scale. " +
      "Strong in Python, Go, and distributed systems; comfortable across the stack and with applied ML.",
  },
  experience: [
    {
      company: "Cloudscale",
      role: "Software Engineer Intern",
      location: "Remote",
      start: "May 2025",
      end: "Aug 2025",
      bullets: [
        "Built a rate-limiting service in Go handling 40k req/s, cutting p99 latency 38%.",
        "Designed the Postgres schema and migration path for a new billing pipeline.",
      ],
      tags: ["Go", "Postgres", "Distributed systems"],
    },
    {
      company: "Northwind Labs",
      role: "ML Engineering Intern",
      location: "Austin, TX",
      start: "May 2024",
      end: "Aug 2024",
      bullets: [
        "Trained and deployed a document-classification model (PyTorch) reaching 94% F1.",
        "Cut inference cost 60% by quantizing and batching on a single GPU node.",
      ],
      tags: ["Python", "PyTorch", "ML"],
    },
  ],
  projects: [
    {
      name: "Job Sentinel",
      description: "Local-first, open-source job-search & résumé platform.",
      url: "https://github.com/harshitwandhare/job-sentinel",
      bullets: [
        "Pluggable job sources, BYO-LLM tailoring, ATS scoring, and an application tracker.",
      ],
      tags: ["Python", "FastAPI", "Next.js"],
    },
  ],
  education: [
    {
      institution: "University of Texas at Dallas",
      degree: "B.S. Computer Science",
      location: "Richardson, TX",
      start: "2022",
      end: "2026",
      gpa: "3.9",
      highlights: ["Coursework: Distributed Systems, ML, Databases, Algorithms"],
    },
  ],
  skills: [
    { category: "Languages", skills: ["Python", "Go", "TypeScript", "SQL"] },
    { category: "Systems", skills: ["FastAPI", "Postgres", "Docker", "gRPC", "Redis"] },
    { category: "ML", skills: ["PyTorch", "scikit-learn", "embeddings"] },
  ],
  certifications: [],
  awards: [{ title: "Hackathon Winner — UTD HackAI", issuer: "UTD", date: "2025", description: "" }],
  publications: [],
};

function job(
  id: string,
  source: string,
  title: string,
  employer: string,
  location: string,
  opts: Partial<JobPosting> & { salary_text?: string; remote?: boolean } = {},
): JobPosting {
  const { salary_text, remote, ...rest } = opts;
  return {
    posting_id: `${source}:${id}`,
    title,
    employer,
    location,
    job_type: opts.job_type ?? "Full-time",
    posted_date: opts.posted_date ?? "2026-06-10",
    deadline: opts.deadline ?? "",
    description_snippet:
      opts.description_snippet ??
      "Join our team to build reliable, scalable services. Python, SQL, and cloud experience valued.",
    status: opts.status ?? "new",
    portal_url: opts.portal_url ?? "https://example.com/job",
    source_adapter: source,
    raw_data: { ...(salary_text ? { salary_text } : {}), ...(remote ? { is_remote: true } : {}) },
    ...rest,
  };
}

export const demoJobs: JobPosting[] = [
  job("1", "remoteok", "Backend Engineer (Python)", "Stripe", "Remote", {
    salary_text: "$120k–$160k",
    remote: true,
    deadline: "2026-06-20",
  }),
  job("2", "12twenty", "Software Engineer Intern — Summer 2026", "UT Dallas Career Center", "Richardson, TX", {
    job_type: "Internship",
    deadline: "2026-06-18",
  }),
  job("3", "himalayas", "ML Engineer", "Hugging Face", "Remote", {
    salary_text: "$140k–$180k",
    remote: true,
  }),
  job("4", "adzuna", "Platform Engineer", "Datadog", "New York, NY", { salary_text: "$130k–$170k" }),
  job("5", "arbeitnow", "Full-Stack Engineer", "Supabase", "Remote (EU)", { remote: true }),
];

export const demoHubJobs: HubJob[] = [
  {
    id: "demo-hub-1",
    title: "用户研究专家（骑手生态）",
    company: "北京三快在线科技有限公司",
    location: "北京",
    source: "zhaopin",
    job_url: "http://www.zhaopin.com/jobdetail/CC383625320J40878294709.htm",
    published_at: null,
    discovered_at: "2026-08-25T00:00:00Z",
    engagement: null,
    status: null,
    favorite: false,
    match_score: null,
    salary: "面议",
  },
  {
    id: "demo-hub-2",
    title: "用户产品经理",
    company: "美团",
    location: "北京-望京",
    source: "liepin",
    job_url: "https://www.liepin.com/job/1985138523.shtml",
    published_at: null,
    discovered_at: "2026-08-25T00:00:00Z",
    status: null,
    engagement: null,
    favorite: true,
    reference: true,
    match_score: null,
    salary: "23-50k·15薪",
    deadline: "2026-09-12",
    next_step: "Prep OA",
    tasks: [
      {
        id: "demo-task-oa",
        job_id: "demo-hub-2",
        title: "OA",
        due_at: "2026-09-05",
        done: false,
        sort_order: 0,
        created_at: "2026-08-25T00:00:00Z",
      },
    ],
  },
];

let counter = 1000;
function uid(): string {
  counter += 1;
  return `demo-${counter}`;
}

export const demoApplications: Application[] = [
  app("Backend Engineer (Python)", "Stripe", "Remote", "remoteok", "applied", {
    applied_date: "2026-06-09",
    salary: "$120k–$160k",
    stale_applied: true,
  }),
  app("ML Engineer", "Hugging Face", "Remote", "himalayas", "interview", { applied_date: "2026-06-05" }),
  app("Platform Engineer", "Datadog", "New York, NY", "adzuna", "draft", {}),
  app("SWE Intern — Summer 2026", "Google", "Mountain View, CA", "manual", "applied", {
    applied_date: "2026-06-01",
    exclude_from_idle: true,
  }),
  app("Backend Intern", "Cloudflare", "Remote", "remoteok", "offer", { applied_date: "2026-05-20" }),
  app("Data Engineer", "Snowflake", "Austin, TX", "adzuna", "closed", { applied_date: "2026-05-15", close_reason: "not_selected" }),
];

function app(
  title: string,
  employer: string,
  location: string,
  source: string,
  stage: Application["stage"],
  opts: Partial<Application>,
): Application {
  const now = "2026-06-12T10:00:00Z";
  return {
    id: uid(),
    title,
    employer,
    location,
    url: "https://example.com/job",
    source,
    stage,
    salary: opts.salary ?? "",
    applied_date: opts.applied_date ?? "",
    deadline: "",
    notes: "",
    posting_id: null,
    resume_document_id: null,
    close_reason: opts.close_reason ?? null,
    close_note: opts.close_note ?? "",
    exclude_from_idle: opts.exclude_from_idle ?? false,
    stale_applied: opts.stale_applied ?? false,
    submissions: opts.submissions ?? [],
    created_at: now,
    updated_at: now,
    raw_data: {},
  };
}

export const demoStats: Record<string, number> = {
  draft: 1,
  applied: 2,
  interview: 1,
  offer: 1,
  closed: 1,
  total: 6,
};

function doc(
  kind: GeneratedDocument["kind"],
  title: string,
  employer: string,
  ats: number | null,
  tailored: boolean,
  created: string,
): GeneratedDocument {
  return {
    id: uid(),
    kind,
    label: "",
    title,
    employer,
    file_path: "",
    tex_path: null,
    ats_score: ats,
    provider: tailored ? "ollama/llama3.2" : "deterministic",
    tailored,
    job_snippet: "",
    application_id: null,
    posting_id: null,
    created_at: created,
    raw_data: {},
  };
}

export const demoDocuments: GeneratedDocument[] = [
  doc("resume", "Backend Engineer — Stripe", "Stripe", 0.82, true, "2026-06-09"),
  doc("cover_letter", "Backend Engineer — Stripe", "Stripe", null, true, "2026-06-09"),
  doc("resume", "ML Engineer — Hugging Face", "Hugging Face", 0.74, true, "2026-06-05"),
  doc("resume", "Base résumé", "", 0.61, false, "2026-06-01"),
];

export const demoSources: JobSourceStatus[] = [
  { id: "remoteok", label: "Remote OK", enabled: true, requires_key: false, is_scraper: false, configured: true, homepage: "https://remoteok.com" },
  { id: "themuse", label: "The Muse", enabled: true, requires_key: false, is_scraper: false, configured: true, homepage: "https://www.themuse.com/jobs" },
  { id: "arbeitnow", label: "Arbeitnow", enabled: true, requires_key: false, is_scraper: false, configured: true, homepage: "https://www.arbeitnow.com" },
  { id: "himalayas", label: "Himalayas", enabled: true, requires_key: false, is_scraper: false, configured: true, homepage: "https://himalayas.app" },
  { id: "adzuna", label: "Adzuna", enabled: false, requires_key: true, is_scraper: false, configured: false, homepage: "https://developer.adzuna.com" },
  { id: "usajobs", label: "USAJobs", enabled: false, requires_key: true, is_scraper: false, configured: false, homepage: "https://developer.usajobs.gov" },
  { id: "jobspy", label: "JobSpy (scraper)", enabled: false, requires_key: false, is_scraper: true, configured: true, homepage: "https://github.com/speedyapply/JobSpy" },
];

export const demoSearch: SearchResponse = {
  results: demoJobs,
  errors: [],
  counts: { remoteok: 2, himalayas: 1, adzuna: 1, arbeitnow: 1 },
};

export const demoMatch: MatchResult = {
  score: 0.78,
  coverage: 0.71,
  semantic: 0.85,
  matched_keywords: ["python", "go", "postgres", "docker", "distributed", "backend", "api"],
  missing_keywords: ["kubernetes", "terraform", "kafka"],
  verdict: "strong",
  rationale:
    "Strong fit: your backend and distributed-systems experience (Go rate limiter, Postgres billing pipeline) " +
    "maps directly to the role. Adding Kubernetes/Kafka exposure would close the remaining gap.",
  strengths: ["Production Go + Postgres", "Distributed systems at scale", "Applied ML background"],
  gaps: ["No Kubernetes keyword", "No Kafka/streaming experience listed"],
};

export const demoTailor: TailorResult = {
  score: 0.71,
  matched_keywords: demoMatch.matched_keywords,
  missing_keywords: demoMatch.missing_keywords,
  profile: demoProfile,
};

export const demoLlmStatus: LlmStatus = {
  base_url: "demo",
  reachable: true,
  chat_model: "llama3.2 (demo)",
  chat_ready: true,
  embed_model: "nomic-embed-text (demo)",
  embed_ready: true,
};

export const demoAuth: AuthStatus = { mode: "off", users_exist: false, user: null };

function material(
  id: string,
  title: string,
  kind: string,
  purpose: string[],
  versions: MaterialVersion[],
): Material {
  return {
    id,
    title,
    kind,
    purpose,
    notes: "",
    archived_at: null,
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-06-12T10:00:00Z",
    versions,
  };
}

function version(
  id: string,
  materialId: string,
  n: number,
  label: string,
  filename: string,
  purpose: string[],
  url = "",
): MaterialVersion {
  return {
    id,
    material_id: materialId,
    version_number: n,
    version_label: label,
    purpose,
    file_ref: filename ? `demo/${id}/${filename}` : "",
    original_filename: filename,
    content_type: filename.endsWith(".pdf") ? "application/pdf" : "",
    byte_size: 12000,
    url,
    notes: "",
    archived_at: null,
    created_at: "2026-06-01T10:00:00Z",
    display_label: label ? `v${n} · ${label}` : `v${n}`,
  };
}

export const demoMaterials: Material[] = [
  material("mat-en-resume", "英文简历", "resume", ["research"], [
    version("ver-en-2", "mat-en-resume", 2, "研究岗版", "en-resume-v2.pdf", ["研究岗"]),
    version("ver-en-1", "mat-en-resume", 1, "", "en-resume-v1.pdf", []),
  ]),
  material("mat-cn-resume", "中文简历", "resume", ["校招"], [
    version("ver-cn-1", "mat-cn-resume", 1, "", "cn-resume.pdf", []),
  ]),
  material("mat-portfolio", "作品集", "portfolio", ["backend"], [
    version("ver-port-1", "mat-portfolio", 1, "", "", [], "https://example.com/portfolio"),
  ]),
];

const demoPacketIds: Record<string, string[]> = {
  [demoApplications[0].id]: ["ver-en-2", "ver-port-1"],
  [demoApplications[2].id]: ["ver-en-1"],
};

{
  const first = demoApplications[0];
  const packet = demoPacketFor(first.id);
  first.submissions = [
    {
      id: "demo-sub-1",
      application_id: first.id,
      submitted_at: "2026-06-09T12:00:00Z",
      channel: "",
      notes: "",
      packet_snapshot: {
        binding_ids: packet.map((item) => item.binding.id),
        material_version_ids: packet.map((item) => item.binding.material_version_id),
        items: packet.map((item) => ({
          binding_id: item.binding.id,
          material_id: item.material?.id ?? "",
          material_version_id: item.version?.id ?? "",
          title: item.material?.title ?? "",
          kind: item.material?.kind ?? "other",
          version_number: item.version?.version_number ?? 1,
          version_label: item.version?.version_label ?? "",
          original_filename: item.version?.original_filename ?? "",
          file_ref: item.version?.file_ref ?? "",
          url: item.version?.url ?? "",
          material_purpose: item.material?.purpose ?? [],
          version_purpose: item.version?.purpose ?? [],
          material_notes: item.material?.notes ?? "",
          version_notes: item.version?.notes ?? "",
        })),
        note: "",
      },
    },
  ];
}

export function makeDemoMaterial(body: {
  title: string;
  kind?: string;
  purpose?: string[];
  notes?: string;
  url?: string;
  version_label?: string;
}): Material {
  const id = uid();
  const v = makeDemoVersion(
    { id, versions: [] } as unknown as Material,
    { url: body.url, version_label: body.version_label, purpose: body.purpose },
  );
  return {
    id,
    title: body.title || "Untitled material",
    kind: body.kind || "other",
    purpose: body.purpose ?? [],
    notes: body.notes ?? "",
    archived_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    versions: [v],
  };
}

export function makeDemoVersion(
  materialRow: Material,
  body: { url?: string; version_label?: string; purpose?: string[]; notes?: string },
): MaterialVersion {
  const n = (materialRow.versions[0]?.version_number ?? 0) + 1;
  const id = uid();
  const label = body.version_label ?? "";
  return {
    id,
    material_id: materialRow.id,
    version_number: n,
    version_label: label,
    purpose: body.purpose ?? [],
    file_ref: body.url ? "" : `demo/${id}/file.pdf`,
    original_filename: body.url ? "" : "file.pdf",
    content_type: body.url ? "" : "application/pdf",
    byte_size: 1,
    url: body.url ?? "",
    notes: body.notes ?? "",
    archived_at: null,
    created_at: new Date().toISOString(),
    display_label: label ? `v${n} · ${label}` : `v${n}`,
  };
}

export function demoPacketFor(appId: string): PacketItem[] {
  const ids = demoPacketIds[appId] ?? [];
  return ids
    .map((versionId, index) => {
      const materialRow = demoMaterials.find((m) => m.versions.some((v) => v.id === versionId));
      const versionRow = materialRow?.versions.find((v) => v.id === versionId) ?? null;
      if (!materialRow || !versionRow) return null;
      return {
        binding: {
          id: `bind-${appId}-${versionId}`,
          application_id: appId,
          material_id: materialRow.id,
          material_version_id: versionRow.id,
          sort_order: index,
          created_at: "2026-06-12T10:00:00Z",
        },
        material: materialRow,
        version: versionRow,
      };
    })
    .filter((row): row is PacketItem => row !== null);
}

export function setDemoPacket(appId: string, versionIds: string[]): void {
  demoPacketIds[appId] = [...versionIds];
}

export function changeDemoPacketVersion(appId: string, bindingId: string, versionId: string): void {
  const items = demoPacketFor(appId);
  const next = items.map((item) =>
    item.binding.id === bindingId ? versionId : item.binding.material_version_id,
  );
  demoPacketIds[appId] = next;
}

export function removeDemoPacketBinding(appId: string, bindingId: string): void {
  const items = demoPacketFor(appId).filter((item) => item.binding.id !== bindingId);
  demoPacketIds[appId] = items.map((item) => item.binding.material_version_id);
}

export function recordDemoSubmission(appId: string, notes = ""): Application | null {
  const found = demoApplications.find((a) => a.id === appId);
  if (!found) return null;
  const packet = demoPacketFor(appId);
  const submission = {
    id: uid(),
    application_id: appId,
    submitted_at: new Date().toISOString(),
    channel: "",
    notes,
    packet_snapshot: {
      binding_ids: packet.map((item) => item.binding.id),
      material_version_ids: packet.map((item) => item.binding.material_version_id),
      items: packet.map((item) => ({
        binding_id: item.binding.id,
        material_id: item.material?.id ?? "",
        material_version_id: item.version?.id ?? "",
        title: item.material?.title ?? "",
        kind: item.material?.kind ?? "other",
        version_number: item.version?.version_number ?? 1,
        version_label: item.version?.version_label ?? "",
        original_filename: item.version?.original_filename ?? "",
        file_ref: item.version?.file_ref ?? "",
        url: item.version?.url ?? "",
        material_purpose: item.material?.purpose ?? [],
        version_purpose: item.version?.purpose ?? [],
        material_notes: item.material?.notes ?? "",
        version_notes: item.version?.notes ?? "",
      })),
      note: "",
    },
  };
  found.stage = "applied";
  found.close_reason = null;
  found.close_note = "";
  found.applied_date = found.applied_date || new Date().toISOString().slice(0, 10);
  found.submissions = [...(found.submissions ?? []), submission];
  return { ...found };
}

export const demoOps: OpsStatus = {
  config_ok: true,
  config_error: "",
  session: { exists: true, saved_at: "2026-06-12T09:00:00Z" },
  login: { state: "ok", message: "", started_at: null, finished_at: null, detail: {} },
  scrape: { state: "ok", message: "", started_at: null, finished_at: null, detail: {} },
  watcher: { running: false, interval_seconds: null },
  adapter: "12twenty",
  adapters: ["12twenty", "handshake"],
};

/** Canned assistant replies for the demo chat. */
export function demoChatReply(): { reply: string; source: "rules" } {
  return {
    source: "rules",
    reply:
      "This is the live demo, so I'm answering from sample data. Running locally, I answer from " +
      "**your** tracked jobs, profile, and a local model — nothing leaves your machine.\n" +
      "• You have **2 deadlines** this week\n" +
      "• **1 offer** in your pipeline\n" +
      "Try the **Search**, **Applications**, or **Studio** tabs to see it all.",
  };
}
