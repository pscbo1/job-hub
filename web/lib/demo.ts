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
    description: "负责骑手生态相关用户研究，独立设计研究方案并产出可落地的产品建议。",
    comment: "Team is research-heavy; ask about mixed methods.",
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
    description:
      "ToB 用户产品，负责需求拆解、方案评审与上线效果跟踪。Full posting is saved on this record.",
    comment: "OA likely this week. Recruiter asked for a product case.",
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
  {
    id: "demo-hub-stripe",
    title: "Backend Engineer (Python)",
    company: "Stripe",
    location: "Remote",
    source: "remoteok",
    job_url: "https://example.com/job/stripe-backend",
    published_at: null,
    discovered_at: "2026-06-01T00:00:00Z",
    engagement: null,
    status: null,
    favorite: true,
    match_score: null,
    salary: "$120k–$160k",
    deadline: "2026-06-20",
    next_step: "Follow up recruiter",
    description:
      "Build payments APIs in Python. Experience with distributed systems and Postgres preferred.",
    comment: "Referral via intern cohort. Ask about on-call.",
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
    job_id: "demo-hub-stripe",
    url: "https://example.com/job/stripe-backend",
    apply_url: "https://boards.example.com/apply/stripe-backend",
    job_url: "https://example.com/job/stripe-backend",
    next_step: "Follow up recruiter",
    job_deadline: "2026-06-20",
    job_description:
      "Build payments APIs in Python. Experience with distributed systems and Postgres preferred.",
    job_comment: "Referral via intern cohort. Ask about on-call.",
    notes: "Sent résumé v2. Waiting on recruiter ping.",
  }),
  app("ML Engineer", "Hugging Face", "Remote", "himalayas", "interview", {
    applied_date: "2026-06-05",
    job_id: "demo-hub-1",
    url: "http://www.zhaopin.com/jobdetail/CC383625320J40878294709.htm",
    job_url: "http://www.zhaopin.com/jobdetail/CC383625320J40878294709.htm",
    next_step: "Prep research case",
    job_description:
      "负责骑手生态相关用户研究，独立设计研究方案并产出可落地的产品建议。",
    job_comment: "Team is research-heavy; ask about mixed methods.",
    notes: "Screening call went well.",
  }),
  app("Platform Engineer", "Datadog", "New York, NY", "adzuna", "draft", {
    job_id: "demo-hub-2",
    url: "https://www.liepin.com/job/1985138523.shtml",
    apply_url: "https://careers.example.com/datadog/platform",
    job_url: "https://www.liepin.com/job/1985138523.shtml",
    next_step: "Prep OA",
    job_deadline: "2026-09-12",
    job_description:
      "ToB 用户产品，负责需求拆解、方案评审与上线效果跟踪。Full posting is saved on this record.",
    job_comment: "OA likely this week. Recruiter asked for a product case.",
  }),
  app("SWE Intern — Summer 2026", "Google", "Mountain View, CA", "manual", "applied", {
    applied_date: "2026-06-01",
    exclude_from_idle: true,
    url: "https://example.com/job/google-intern",
    job_url: "https://example.com/job/google-intern",
    next_step: "Host matching form",
    notes: "Applied via university portal.",
  }),
  app("Backend Intern", "Cloudflare", "Remote", "remoteok", "offer", {
    applied_date: "2026-05-20",
    url: "",
    job_url: "",
    apply_url: "",
    next_step: "Decide by Friday",
    notes: "Verbal offer; written pending.",
  }),
  app("Data Engineer", "Snowflake", "Austin, TX", "adzuna", "closed", {
    applied_date: "2026-05-15",
    close_reason: "not_selected",
    url: "https://example.com/job/snowflake-de",
    job_url: "https://example.com/job/snowflake-de",
    job_description: "Warehouse internals and streaming ingestion.",
    notes: "Closed after onsite.",
  }),
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
    job_id: opts.job_id ?? null,
    title,
    employer,
    location,
    url: opts.url ?? "https://example.com/job",
    source,
    stage,
    salary: opts.salary ?? "",
    applied_date: opts.applied_date ?? "",
    deadline: "",
    notes: opts.notes ?? "",
    contact: opts.contact ?? "",
    next_step: opts.next_step ?? "",
    job_deadline: opts.job_deadline ?? "",
    job_description: opts.job_description ?? "",
    job_comment: opts.job_comment ?? "",
    apply_url: opts.apply_url ?? "",
    job_url: opts.job_url ?? "",
    posting_id: null,
    resume_document_id: null,
    close_reason: opts.close_reason ?? null,
    close_note: opts.close_note ?? "",
    exclude_from_idle: opts.exclude_from_idle ?? false,
    stale_applied: opts.stale_applied ?? false,
    submissions: opts.submissions ?? [],
    current_material_count: opts.current_material_count ?? 0,
    comm_notes: opts.comm_notes ?? [],
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
  material("mat-template", "Boss greeting", "message_template", ["outreach"], [
    version("ver-tpl-1", "mat-template", 1, "", "content.md", []),
  ]),
  material("mat-answer", "Why this role", "application_answer", ["screening"], [
    version("ver-ans-1", "mat-answer", 1, "", "content.md", []),
  ]),
];

{
  const tpl = demoMaterials.find((m) => m.id === "mat-template");
  if (tpl?.versions[0]) tpl.versions[0].text = "Hi, thanks for the chat about the role.";
  const ans = demoMaterials.find((m) => m.id === "mat-answer");
  if (ans?.versions[0]) ans.versions[0].text = "I want to work on rider-experience research.";
}

const demoPacketIds: Record<string, string[]> = {
  [demoApplications[0].id]: ["ver-en-2", "ver-port-1"],
  [demoApplications[2].id]: ["ver-en-1"],
};

demoApplications[0].current_material_count = 2;
demoApplications[2].current_material_count = 1;

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
  content?: string;
}): Material {
  const id = uid();
  const v = makeDemoVersion(
    { id, versions: [] } as unknown as Material,
    { url: body.url, version_label: body.version_label, purpose: body.purpose, content: body.content },
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
  body: { url?: string; version_label?: string; purpose?: string[]; notes?: string; content?: string },
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
    file_ref: body.url ? "" : `demo/${id}/${body.content ? "content.md" : "file.pdf"}`,
    original_filename: body.url ? "" : body.content ? "content.md" : "file.pdf",
    content_type: body.url ? "" : body.content ? "text/markdown" : "application/pdf",
    byte_size: 1,
    url: body.url ?? "",
    notes: body.notes ?? "",
    text: body.content ?? "",
    archived_at: null,
    created_at: new Date().toISOString(),
    display_label: label ? `v${n} · ${label}` : `v${n}`,
  };
}

export function demoPacketFor(appId: string): PacketItem[] {
  const ids = demoPacketIds[appId] ?? [];
  const items: PacketItem[] = [];
  ids.forEach((versionId, index) => {
    const materialRow = demoMaterials.find((m) => m.versions.some((v) => v.id === versionId));
    const versionRow = materialRow?.versions.find((v) => v.id === versionId);
    if (!materialRow || !versionRow) return;
    items.push({
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
    });
  });
  return items;
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

const demoCommNotes: Record<string, import("@/lib/api").ApplicationCommNote[]> = {};
const demoJobCommNotes: import("@/lib/api").ApplicationCommNote[] = [];
const DEMO_JOB_COMM_KEY = "job-hub.demo.jobCommNotes";
const DEMO_JOB_CONTACT_KEY = "job-hub.demo.jobContact";
const demoJobContact: Record<string, string> = {};
let demoJobContactHydrated = false;

function hydrateDemoJobCommNotes(): void {
  if (typeof window === "undefined" || demoJobCommNotes.length > 0) return;
  try {
    const raw = sessionStorage.getItem(DEMO_JOB_COMM_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as import("@/lib/api").ApplicationCommNote[];
    if (Array.isArray(parsed)) demoJobCommNotes.push(...parsed);
  } catch {
    /* ignore bad demo cache */
  }
}

function persistDemoJobCommNotes(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(DEMO_JOB_COMM_KEY, JSON.stringify(demoJobCommNotes));
}

function hydrateDemoJobContact(): void {
  if (demoJobContactHydrated || typeof window === "undefined") return;
  demoJobContactHydrated = true;
  try {
    const raw = sessionStorage.getItem(DEMO_JOB_CONTACT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [jobId, text] of Object.entries(parsed)) {
        if (typeof text === "string" && text.trim()) demoJobContact[jobId] = text;
      }
    }
  } catch {
    /* ignore bad demo cache */
  }
}

function persistDemoJobContact(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(DEMO_JOB_CONTACT_KEY, JSON.stringify(demoJobContact));
}

export function leftoverDemoJobContact(jobId: string): string {
  hydrateDemoJobContact();
  const stored = (demoJobContact[jobId] ?? "").trim();
  if (stored) return stored;
  const job = demoHubJobs.find((row) => row.id === jobId);
  return (job?.contact ?? "").trim();
}
const demoIdempotency: Record<string, string> = {};

export function recordDemoSubmission(appId: string, notes = ""): Application | null {
  const result = recordDemoSubmissionResult(appId, { notes, confirm_empty: true });
  return result.ok ? result.application : null;
}

export function recordDemoSubmissionResult(
  appId: string,
  body: { notes?: string; confirm_empty?: boolean; expected_version_ids?: string[] | null; idempotency_key?: string } = {},
): { ok: true; application: Application } | { ok: false; code: string; message: string } {
  const found = demoApplications.find((a) => a.id === appId);
  if (!found) return { ok: false, code: "error", message: "Application not found" };
  if (body.idempotency_key && demoIdempotency[body.idempotency_key]) {
    return { ok: true, application: { ...found } };
  }
  const packet = demoPacketFor(appId);
  const ids = packet.map((item) => item.binding.material_version_id);
  if (body.expected_version_ids != null) {
    const expected = body.expected_version_ids;
    const sameLength = expected.length === ids.length;
    const sameMembers = sameLength && expected.every((id) => ids.includes(id));
    if (!sameMembers) {
      return { ok: false, code: "materials_changed", message: "Materials changed while confirming." };
    }
  }
  if (packet.length === 0 && !body.confirm_empty) {
    return { ok: false, code: "empty_materials", message: "本次未记录材料" };
  }
  const submission = {
    id: uid(),
    application_id: appId,
    submitted_at: new Date().toISOString(),
    channel: "",
    notes: body.notes ?? "",
    idempotency_key: body.idempotency_key ?? "",
    packet_snapshot: {
      binding_ids: packet.map((item) => item.binding.id),
      material_version_ids: ids,
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
        snapshot_file_ref: item.version?.file_ref ?? "",
        url: item.version?.url ?? "",
        material_purpose: item.material?.purpose ?? [],
        version_purpose: item.version?.purpose ?? [],
        material_notes: item.material?.notes ?? "",
        version_notes: item.version?.notes ?? "",
      })),
      note: "",
    },
  };
  if (found.stage === "draft" || found.stage === "closed") {
    found.stage = "applied";
    found.close_reason = null;
    found.close_note = "";
    found.applied_date = found.applied_date || new Date().toISOString().slice(0, 10);
  }
  found.submissions = [...(found.submissions ?? []), submission];
  found.current_material_count = packet.length;
  if (body.idempotency_key) demoIdempotency[body.idempotency_key] = submission.id;
  return { ok: true, application: { ...found } };
}

export function listDemoCommNotes(appId: string): import("@/lib/api").ApplicationCommNote[] {
  return (demoCommNotes[appId] ?? []).map((note) => ({ ...note }));
}

export function listDemoCommNotesForJob(jobId: string): import("@/lib/api").ApplicationCommNote[] {
  hydrateDemoJobCommNotes();
  const fromIndex = Object.values(demoCommNotes)
    .flat()
    .filter((note) => note.job_id === jobId);
  const leftover = demoJobCommNotes.filter((note) => note.job_id === jobId);
  const seen = new Set<string>();
  const rows: import("@/lib/api").ApplicationCommNote[] = [];
  for (const note of [...fromIndex, ...leftover]) {
    if (seen.has(note.id)) continue;
    seen.add(note.id);
    rows.push(note);
  }
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function addDemoCommNote(appId: string, body: string): import("@/lib/api").ApplicationCommNote {
  const app = demoApplications.find((row) => row.id === appId);
  const note = {
    id: uid(),
    application_id: appId,
    job_id: app?.job_id ?? null,
    body,
    created_at: new Date().toISOString(),
  };
  demoCommNotes[appId] = [note, ...(demoCommNotes[appId] ?? [])];
  return note;
}

export function deleteDemoCommNote(appId: string, noteId: string): boolean {
  demoCommNotes[appId] = (demoCommNotes[appId] ?? []).filter((n) => n.id !== noteId);
  return true;
}

export function abandonDemoApplication(id: string): boolean {
  const index = demoApplications.findIndex((row) => row.id === id);
  if (index < 0) return false;
  const app = demoApplications[index];
  if (app.stage !== "draft" || (app.submissions?.length ?? 0) > 0) return false;
  const notes = demoCommNotes[id] ?? [];
  if (app.job_id) {
    for (const note of notes) {
      demoJobCommNotes.push({ ...note, job_id: note.job_id ?? app.job_id });
    }
    persistDemoJobCommNotes();
    const contact = (app.contact ?? "").trim();
    if (contact) {
      hydrateDemoJobContact();
      demoJobContact[app.job_id] = contact;
      persistDemoJobContact();
      const job = demoHubJobs.find((row) => row.id === app.job_id);
      if (job) job.contact = contact;
    }
  }
  delete demoCommNotes[id];
  delete demoPacketIds[id];
  demoApplications.splice(index, 1);
  return true;
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
