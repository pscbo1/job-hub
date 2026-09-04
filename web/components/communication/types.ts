export type CommunicationView = "pending" | "retained";

export type Message = {
  id: string;
  summary: string;
  body: string;
  occurred_at: string;
  channel: string;
};

export type Conversation = {
  id: string;
  company: string;
  role: string;
  contact: string;
  source: string;
  external_thread_id?: string | null;
  market: string;
  stage: string;
  retained: boolean;
  version: number;
  job_id?: string | null;
  messages: Message[];
  tasks: Array<{ id: string; title: string; done: boolean }>;
};

export type Platform = {
  id: string;
  label: string;
  url: string;
  mode: string;
  requires_login: boolean;
  chat_configured: boolean;
};

export type JobOption = {
  id: string;
  company: string;
  title: string;
  location: string;
};

export type FilterSettings = {
  keep_words: string;
  skip_words: string;
  stale_days: string;
  skip_companies: string;
  label_linkedin_noise: string;
  hide_gig_noise: string;
};

export type CaptureDraft = {
  source: string;
  entries: Array<{ label: string; preview: string; date: string }>;
  external_thread_id: string;
};

export type ManualDraft = {
  summary: string;
  company: string;
  role: string;
  source: string;
  external_thread_id: string;
  job_id: string;
  application_id: string;
  channel: string;
  needs_action: boolean;
};

export type NewJobDraft = {
  company: string;
  role: string;
  location: string;
  job_url: string;
  market: string;
};

export const EMPTY_FILTER_SETTINGS: FilterSettings = {
  keep_words: "",
  skip_words: "",
  stale_days: "30",
  skip_companies: "",
  label_linkedin_noise: "true",
  hide_gig_noise: "true",
};

export const EMPTY_MANUAL: ManualDraft = {
  summary: "",
  company: "",
  role: "",
  source: "manual",
  external_thread_id: "",
  job_id: "",
  application_id: "",
  channel: "wechat",
  needs_action: false,
};

export const EMPTY_NEW_JOB: NewJobDraft = {
  company: "",
  role: "",
  location: "",
  job_url: "",
  market: "unclassified",
};

export const STAGE_LABELS: Record<string, string> = {
  contact: "Application update",
  assessment: "Assessment",
  materials: "Materials requested",
  intent: "Intent confirmation",
  role: "New role",
  interview: "Interview",
  offer: "Offer",
};

export const SOURCE_OPTIONS = [
  { id: "email", label: "Email" },
  { id: "boss", label: "BOSS" },
  { id: "manual", label: "Manual" },
] as const;
