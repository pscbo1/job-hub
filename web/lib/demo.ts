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
  MaterialUseItem,
  MaterialUsePreset,
  MaterialUsePresetItem,
  MaterialRevisionResult,
  SubmissionMaterialHistoryEntry,
  MaterialVersion,
  OpsStatus,
  PacketItem,
  Profile,
  ReminderInbox,
  SearchResponse,
  TaskReminder,
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
      name: "Job Hub",
      description: "Local-first, open-source job-search & résumé platform.",
      url: "https://github.com/pscbo1/job-hub",
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
    market: "cn",
    country: "CN",
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
    market: "cn",
    country: "CN",
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
    market: "en",
    country: "US",
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
    tags: ["英文岗位"],
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
    tags: ["用户研究"],
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
    tags: ["产品"],
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
    tags: opts.tags ?? [],
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
  material("mat-en-resume", "English resume", "resume", ["research"], [
    version("ver-en-2", "mat-en-resume", 2, "Research track", "en-resume-v2.pdf", ["research"]),
    version("ver-en-1", "mat-en-resume", 1, "", "en-resume-v1.pdf", []),
  ]),
  material("mat-cn-resume", "Chinese resume", "resume", ["campus"], [
    version("ver-cn-1", "mat-cn-resume", 1, "", "cn-resume.pdf", []),
  ]),
  material("mat-portfolio", "Portfolio", "portfolio", ["backend"], [
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
  [demoApplications[2].id]: ["ver-en-1", "ver-ans-1", "ver-tpl-1"],
};

const demoPresets: MaterialUsePreset[] = [
  {
    id: "demo-preset-research",
    name: "Research application",
    items: [
      { material_version_id: "ver-en-2", block_key: null },
      { material_version_id: "ver-port-1", block_key: null },
      { material_version_id: "ver-ans-1", block_key: null },
    ],
    revision: 1,
    created_at: "2026-06-04T10:00:00Z",
    updated_at: "2026-06-12T10:00:00Z",
  },
];

export function startDemoApplication(jobId: string): { job: HubJob; application: Application } | null {
  const job = demoHubJobs.find((row) => row.id === jobId);
  if (!job) return null;
  const existing = demoApplications.find((row) => row.job_id === jobId);
  if (existing) return { job: { ...job, application_id: existing.id }, application: { ...existing } };
  const application = app(job.title, job.company, job.location, job.source, "draft", {
    job_id: job.id,
    url: job.job_url,
    job_url: job.job_url,
    apply_url: job.job_url,
    next_step: job.next_step ?? "",
    job_deadline: job.deadline ?? "",
    job_description: job.description ?? "",
    job_comment: job.comment ?? "",
  });
  demoApplications.unshift(application);
  job.application_id = application.id;
  return { job: { ...job }, application: { ...application } };
}

export function createDemoManualApplication(body: {
  title: string;
  company: string;
  job_url?: string;
  location?: string;
  source_note?: string;
  market?: "cn" | "en";
  create_separately?: boolean;
}): { job: HubJob; application: Application; replayed: boolean } | null {
  const title = body.title.trim();
  const company = body.company.trim();
  const jobUrl = (body.job_url ?? "").trim();
  const existing = !body.create_separately && jobUrl
    ? demoHubJobs.find((row) => row.job_url === jobUrl && row.application_id)
    : null;
  if (existing?.application_id) {
    const application = demoApplications.find((row) => row.id === existing.application_id);
    if (application) return { job: { ...existing }, application: { ...application }, replayed: true };
  }

  const now = new Date().toISOString();
  const jobId = uid();
  const job: HubJob = {
    id: jobId,
    title,
    company,
    location: (body.location ?? "").trim(),
    source: "manual",
    market: body.market ?? "en",
    country: body.market === "cn" ? "CN" : "US",
    job_url: jobUrl,
    published_at: null,
    discovered_at: now,
    engagement: null,
    status: null,
    favorite: false,
    reference: false,
    match_score: null,
    description: "",
    comment: (body.source_note ?? "").trim(),
  };
  const application = app(title, company, job.location, "manual", "draft", {
    job_id: jobId,
    url: jobUrl,
    job_url: jobUrl,
    apply_url: jobUrl,
    job_comment: job.comment ?? "",
  });
  job.application_id = application.id;
  demoHubJobs.unshift(job);
  demoApplications.unshift(application);
  return { job: { ...job }, application: { ...application }, replayed: false };
}

const demoSubmissionRevisions: Record<string, SubmissionMaterialHistoryEntry[]> = {};

let demoReminderRead = false;

export function listDemoReminders(view: "unread" | "all" = "unread"): ReminderInbox {
  const job = demoHubJobs.find((row) => row.id === "demo-hub-2");
  const task = job?.tasks?.find((row) => row.id === "demo-task-oa");
  const item = job && task ? {
    id: "demo-reminder-oa",
    task_id: task.id,
    job_id: job.id,
    task_title: task.title,
    job_title: job.title,
    company: job.company,
    reminder_on: "2026-09-03",
    due_date: "2026-09-05",
    kind: "advance" as const,
    due_status: "upcoming" as const,
    read_at: demoReminderRead ? new Date().toISOString() : null,
    in_app_triggered_at: null,
    market: job.market,
  } : null;
  const items = item && (view === "all" || !demoReminderRead) ? [item] : [];
  return {
    items,
    unread_count: item && !demoReminderRead ? 1 : 0,
    total: item ? 1 : 0,
    today: "2026-09-02",
    tz: "Asia/Shanghai",
  };
}

export function markDemoReminderRead(id: string): TaskReminder | null {
  if (id !== "demo-reminder-oa") return null;
  demoReminderRead = true;
  return {
    id,
    task_id: "demo-task-oa",
    due_date: "2026-09-05",
    reminder_on: "2026-09-03",
    kind: "advance",
    enabled: true,
    created_at: "2026-09-01T10:00:00Z",
    read_at: new Date().toISOString(),
  };
}

export function demoMaterialUseItems(options: {
  query?: string;
  purpose?: string;
  application_id?: string;
  preset_id?: string;
} = {}): { items: MaterialUseItem[]; total: number; has_more: boolean } {
  const bound = options.application_id ? new Set(demoPacketFor(options.application_id).map((item) => item.binding.material_id)) : null;
  const preset = options.preset_id ? demoPresets.find((row) => row.id === options.preset_id) : null;
  const refs = preset?.items ?? null;
  const rows: MaterialUseItem[] = [];
  for (const material of demoMaterials) {
    if (material.archived_at) continue;
    const version = refs
      ? material.versions.find((candidate) => refs.some((item) => item.material_version_id === candidate.id))
      : bound?.has(material.id)
        ? demoPacketFor(options.application_id || "").find((item) => item.binding.material_id === material.id)?.version
        : material.versions.find((candidate) => !candidate.archived_at);
    if (!version || version.archived_at) continue;
    if (!refs && material.kind !== "message_template" && material.kind !== "application_answer") continue;
    const text = version.text?.trim() || version.url || version.original_filename || "";
    const purpose = [...material.purpose, ...version.purpose];
    rows.push({
      material_id: material.id,
      material_version_id: version.id,
      material_title: material.title,
      kind: material.kind,
      version_label: version.display_label || `v${version.version_number}`,
      version_date: null,
      block_key: null,
      block_title: null,
      heading_path: [],
      purpose,
      original_filename: version.original_filename,
      has_file: Boolean(version.file_ref),
      url: version.url || null,
      copy_text: version.text?.trim() || null,
      preview_text: text.slice(0, 500),
      is_pinned: Boolean(material.is_pinned),
      archived: false,
      unavailable_reason: null,
    });
  }
  const terms = (options.query || "").normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const purpose = (options.purpose || "").normalize("NFKC").toLocaleLowerCase().trim();
  const filtered = rows.filter((row) => {
    if (purpose && !row.purpose.some((value) => value.normalize("NFKC").toLocaleLowerCase() === purpose)) return false;
    const haystack = [row.material_title, row.version_label, row.preview_text, ...row.purpose].join(" ").normalize("NFKC").toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  if (refs) {
    const order = new Map(refs.map((item, index) => [item.material_version_id, index]));
    filtered.sort((a, b) => (order.get(a.material_version_id) ?? 0) - (order.get(b.material_version_id) ?? 0));
  } else {
    filtered.sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || a.material_title.localeCompare(b.material_title));
  }
  return { items: filtered, total: filtered.length, has_more: false };
}

export function listDemoMaterialUsePresets(): MaterialUsePreset[] {
  return demoPresets.map((row) => ({ ...row, items: row.items.map((item) => ({ ...item })) }));
}

export function createDemoMaterialUsePreset(name: string, items: MaterialUsePresetItem[]): MaterialUsePreset {
  const preset: MaterialUsePreset = {
    id: uid(), name: name.trim(), items: items.map((item) => ({ ...item })), revision: 1,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  demoPresets.unshift(preset);
  return preset;
}

export function updateDemoMaterialUsePreset(
  id: string,
  body: { name: string; items: MaterialUsePresetItem[]; expected_revision: number },
): MaterialUsePreset | null {
  const preset = demoPresets.find((row) => row.id === id);
  if (!preset || preset.revision !== body.expected_revision) return null;
  preset.name = body.name.trim();
  preset.items = body.items.map((item) => ({ ...item }));
  preset.revision += 1;
  preset.updated_at = new Date().toISOString();
  return { ...preset, items: preset.items.map((item) => ({ ...item })) };
}

export function deleteDemoMaterialUsePreset(id: string, expectedRevision: number): boolean {
  const index = demoPresets.findIndex((row) => row.id === id);
  if (index < 0 || demoPresets[index].revision !== expectedRevision) return false;
  demoPresets.splice(index, 1);
  return true;
}

export function listDemoSubmissionMaterialRevisions(submissionId: string): SubmissionMaterialHistoryEntry[] {
  const submission = demoApplications.flatMap((app) => app.submissions ?? []).find((row) => row.id === submissionId);
  const original: SubmissionMaterialHistoryEntry = submission ? {
    revision: 0,
    packet_snapshot: submission.packet_snapshot ?? { binding_ids: [], material_version_ids: [], items: [], note: "" },
    created_at: submission.submitted_at,
    note: submission.notes,
  } : { revision: 0, packet_snapshot: { binding_ids: [], material_version_ids: [], items: [], note: "" }, created_at: new Date().toISOString(), note: "" };
  return [original, ...(demoSubmissionRevisions[submissionId] ?? [])];
}

export function createDemoSubmissionMaterialRevision(
  submissionId: string,
  expectedRevision: number,
  items: Array<{ retain_item_index?: number; material_version_id?: string }>,
  confirmEmpty: boolean,
  note: string,
): { ok: true; result: MaterialRevisionResult } | { ok: false; code: string; message: string } {
  const history = listDemoSubmissionMaterialRevisions(submissionId);
  const current = history[history.length - 1];
  if (current.revision !== expectedRevision) return { ok: false, code: "revision_conflict", message: "Materials were corrected in another window." };
  if (!items.length && !confirmEmpty) return { ok: false, code: "empty_materials", message: "Confirm empty materials to save." };
  const rows = items.flatMap((item) => {
    if (item.retain_item_index !== undefined) return current.packet_snapshot.items?.[item.retain_item_index] ? [current.packet_snapshot.items[item.retain_item_index]] : [];
    const found = demoMaterialUseItems({}).items.find((row) => row.material_version_id === item.material_version_id);
    const material = demoMaterials.find((row) => row.id === found?.material_id);
    const version = material?.versions.find((row) => row.id === item.material_version_id);
    return material && version ? [{ binding_id: "", material_id: material.id, material_version_id: version.id, title: material.title, kind: material.kind, version_number: version.version_number, version_label: version.version_label, original_filename: version.original_filename, file_ref: version.file_ref, url: version.url, material_purpose: material.purpose, version_purpose: version.purpose, material_notes: material.notes, version_notes: version.notes }] : [];
  });
  const next = { revision: expectedRevision + 1, packet_snapshot: { binding_ids: [], material_version_ids: rows.map((row) => row.material_version_id), items: rows, note }, created_at: new Date().toISOString(), note } as SubmissionMaterialHistoryEntry;
  demoSubmissionRevisions[submissionId] = [...(demoSubmissionRevisions[submissionId] ?? []), next];
  return { ok: true, result: { submission_id: submissionId, material_revision: next.revision, packet_snapshot: next.packet_snapshot, created_at: next.created_at, note } };
}

demoApplications[0].current_material_count = 2;
demoApplications[2].current_material_count = 3;

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

type DemoCompanySource = {
  id: string;
  company: string;
  name?: string;
  kind: "company" | "wechat" | "community" | "other";
  channel_type?: string;
  handle?: string;
  collect_cn: boolean;
  collect_en: boolean;
  enabled: boolean;
  include_in_run: boolean;
  tags: string[];
  note: string;
  careers_url: string;
  runnable: boolean;
};

type DemoVerticalChannel = {
  id: string;
  name: string;
  company?: string;
  kind: "wechat" | "community" | "other";
  channel_type: string;
  handle: string;
  enabled: boolean;
  include_in_run?: boolean;
  tags: string[];
  note: string;
};

type DemoNotebookPage = {
  id: string;
  title: string;
  markdown_body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  topics: string[];
};

let demoCompanySources: DemoCompanySource[] = [
  {
    id: "dimagi",
    company: "Dimagi",
    kind: "company",
    collect_cn: false,
    collect_en: true,
    enabled: true,
    include_in_run: false,
    tags: ["health"],
    note: "CommCare / global health software",
    careers_url: "https://job-boards.greenhouse.io/dimagi",
    runnable: true,
  },
  {
    id: "tencent",
    company: "Tencent",
    kind: "company",
    collect_cn: true,
    collect_en: false,
    enabled: true,
    include_in_run: false,
    tags: ["tech"],
    note: "CN careers board",
    careers_url: "",
    runnable: true,
  },
  {
    id: "research-circle",
    company: "Research Circle",
    name: "Research Circle",
    kind: "wechat",
    channel_type: "wechat",
    handle: "research_jobs",
    collect_cn: false,
    collect_en: false,
    enabled: true,
    include_in_run: false,
    tags: ["research"],
    note: "WeChat job posts — directory only. Auto Collect does not scrape this.",
    careers_url: "",
    runnable: false,
  },
  {
    id: "civic-discord",
    company: "Civic Discord",
    name: "Civic Discord",
    kind: "community",
    channel_type: "community",
    handle: "https://discord.gg/example",
    collect_cn: false,
    collect_en: false,
    enabled: true,
    include_in_run: false,
    tags: ["civic"],
    note: "Community referrals",
    careers_url: "",
    runnable: false,
  },
];

let demoNotebookPages: DemoNotebookPage[] = [
  {
    id: "nb-1",
    title: "Interview stories",
    markdown_body: "Keep a bank of #research stories. Not a template.",
    sort_order: 0,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-02T12:00:00Z",
    topics: ["research"],
  },
];

function demoTopicsFrom(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(/(?<![#\w])#([^\s#]{1,40})/g)) {
    const topic = match[1]?.trim().replace(/[.,;:!?]+$/, "");
    if (!topic || seen.has(topic.toLowerCase())) continue;
    seen.add(topic.toLowerCase());
    out.push(topic);
  }
  return out;
}

export function listDemoCompanySources(
  tag?: string,
  kind?: string,
): { sources: DemoCompanySource[]; tags: string[] } {
  const tags = [...new Set(demoCompanySources.flatMap((row) => row.tags))];
  const wanted = tag?.trim().toLowerCase() ?? "";
  const wantedKind = kind?.trim().toLowerCase() ?? "";
  const sources = demoCompanySources.filter((row) => {
    if (wanted && !row.tags.some((item) => item.toLowerCase() === wanted)) return false;
    if (wantedKind === "vertical" && row.kind === "company") return false;
    if (wantedKind && wantedKind !== "vertical" && row.kind !== wantedKind) return false;
    return true;
  });
  return { sources: sources.map((row) => ({ ...row, name: row.company })), tags };
}

export function createDemoCompanySource(body: {
  company: string;
  kind?: string;
  handle?: string;
  collect_cn?: boolean;
  collect_en?: boolean;
  enabled?: boolean;
  include_in_run?: boolean;
  tags?: string[];
  note?: string;
  careers_url?: string;
}): DemoCompanySource {
  const kind = (
    body.kind === "wechat" || body.kind === "community" || body.kind === "other" ? body.kind : "company"
  ) as DemoCompanySource["kind"];
  const id = body.company.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || `company-${Date.now()}`;
  const vertical = kind !== "company";
  const row: DemoCompanySource = {
    id,
    company: body.company.trim(),
    name: body.company.trim(),
    kind,
    channel_type: vertical ? kind : "",
    handle: body.handle ?? "",
    collect_cn: vertical ? false : Boolean(body.collect_cn),
    collect_en: vertical ? false : body.collect_en !== false || Boolean(body.collect_cn) ? Boolean(body.collect_en) : true,
    enabled: body.enabled !== false,
    include_in_run: Boolean(body.include_in_run),
    tags: body.tags ?? [],
    note: body.note ?? "",
    careers_url: vertical ? "" : (body.careers_url ?? ""),
    runnable: vertical ? false : Boolean(body.careers_url?.trim()),
  };
  if (!vertical && !row.collect_cn && !row.collect_en) row.collect_en = true;
  demoCompanySources = [...demoCompanySources, row];
  return { ...row };
}

export function patchDemoCompanySource(
  id: string,
  body: Partial<{
    company: string;
    kind: string;
    handle: string;
    collect_cn: boolean;
    collect_en: boolean;
    enabled: boolean;
    include_in_run: boolean;
    tags: string[];
    note: string;
    careers_url: string;
  }>,
): DemoCompanySource | null {
  const current = demoCompanySources.find((row) => row.id === id);
  if (!current) return null;
  const next: DemoCompanySource = { ...current };
  if (body.company !== undefined) {
    next.company = body.company;
    next.name = body.company;
  }
  if (body.kind === "wechat" || body.kind === "community" || body.kind === "other" || body.kind === "company") {
    next.kind = body.kind;
    next.channel_type = body.kind === "company" ? "" : body.kind;
    if (body.kind !== "company") {
      next.collect_cn = false;
      next.collect_en = false;
      next.runnable = false;
    }
  }
  if (body.handle !== undefined) next.handle = body.handle;
  if (body.collect_cn !== undefined && next.kind === "company") next.collect_cn = body.collect_cn;
  if (body.collect_en !== undefined && next.kind === "company") next.collect_en = body.collect_en;
  if (body.enabled !== undefined) next.enabled = body.enabled;
  if (body.include_in_run !== undefined) next.include_in_run = body.include_in_run;
  if (body.tags !== undefined) next.tags = body.tags;
  if (body.note !== undefined) next.note = body.note;
  if (body.careers_url !== undefined && next.kind === "company") {
    next.careers_url = body.careers_url;
    next.runnable = Boolean(body.careers_url.trim());
  }
  demoCompanySources = demoCompanySources.map((row) => (row.id === id ? next : row));
  return { ...next };
}

function asDemoVertical(row: DemoCompanySource): DemoVerticalChannel {
  const kind = row.kind === "company" ? "other" : row.kind;
  return {
    id: row.id,
    name: row.company,
    company: row.company,
    kind,
    channel_type: kind,
    handle: row.handle ?? "",
    enabled: row.enabled,
    include_in_run: row.include_in_run,
    tags: row.tags,
    note: row.note,
  };
}

export function listDemoVerticalChannels(opts?: {
  tag?: string;
  channel_type?: string;
}): { channels: DemoVerticalChannel[]; tags: string[] } {
  const listed = listDemoCompanySources(opts?.tag, opts?.channel_type || "vertical");
  return { channels: listed.sources.map(asDemoVertical), tags: listed.tags };
}

export function createDemoVerticalChannel(body: {
  name: string;
  channel_type?: string;
  handle?: string;
  enabled?: boolean;
  include_in_run?: boolean;
  tags?: string[];
  note?: string;
}): DemoVerticalChannel {
  const created = createDemoCompanySource({
    company: body.name,
    kind: body.channel_type ?? "other",
    handle: body.handle,
    enabled: body.enabled,
    include_in_run: body.include_in_run,
    tags: body.tags,
    note: body.note,
  });
  return asDemoVertical(created);
}

export function patchDemoVerticalChannel(
  id: string,
  body: Partial<{
    name: string;
    channel_type: string;
    handle: string;
    enabled: boolean;
    include_in_run: boolean;
    tags: string[];
    note: string;
  }>,
): DemoVerticalChannel | null {
  const updated = patchDemoCompanySource(id, {
    company: body.name,
    kind: body.channel_type,
    handle: body.handle,
    enabled: body.enabled,
    include_in_run: body.include_in_run,
    tags: body.tags,
    note: body.note,
  });
  return updated ? asDemoVertical(updated) : null;
}

export function listDemoNotebookPages(opts?: {
  q?: string;
  topic?: string;
  sort?: "updated" | "title";
}): { pages: DemoNotebookPage[]; topics: string[] } {
  let pages = [...demoNotebookPages];
  const needle = opts?.q?.trim().toLowerCase() ?? "";
  if (needle) {
    pages = pages.filter(
      (page) =>
        page.title.toLowerCase().includes(needle) || page.markdown_body.toLowerCase().includes(needle),
    );
  }
  const topic = opts?.topic?.trim().replace(/^#/, "").toLowerCase() ?? "";
  if (topic) {
    pages = pages.filter((page) => page.topics.some((item) => item.toLowerCase() === topic));
  }
  if (opts?.sort === "title") {
    pages.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    pages.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  const topics = [...new Set(demoNotebookPages.flatMap((page) => page.topics))];
  return { pages, topics };
}

export function createDemoNotebookPage(body?: {
  title?: string;
  markdown_body?: string;
}): DemoNotebookPage {
  const now = new Date().toISOString();
  const title = body?.title?.trim() || "Untitled";
  const markdown_body = body?.markdown_body ?? "";
  const page: DemoNotebookPage = {
    id: `nb-${Date.now()}`,
    title,
    markdown_body,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    topics: demoTopicsFrom(`${title}\n${markdown_body}`),
  };
  demoNotebookPages = [page, ...demoNotebookPages];
  return { ...page };
}

export function patchDemoNotebookPage(
  id: string,
  body: { title?: string; markdown_body?: string; sort_order?: number },
): DemoNotebookPage | null {
  const current = demoNotebookPages.find((page) => page.id === id);
  if (!current) return null;
  const next = {
    ...current,
    ...body,
    title: body.title?.trim() || current.title,
    updated_at: new Date().toISOString(),
  };
  next.topics = demoTopicsFrom(`${next.title}\n${next.markdown_body}`);
  demoNotebookPages = demoNotebookPages.map((page) => (page.id === id ? next : page));
  return { ...next };
}

export function deleteDemoNotebookPage(id: string): boolean {
  const before = demoNotebookPages.length;
  demoNotebookPages = demoNotebookPages.filter((page) => page.id !== id);
  return demoNotebookPages.length < before;
}
