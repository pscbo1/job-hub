import { API_BASE } from "@/lib/api";

import type {
  CaptureDraft,
  Conversation,
  FilterSettings,
  JobOption,
  ManualDraft,
  NewJobDraft,
  Platform,
} from "./types";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

export async function listConversations(query: {
  view: string;
  sources: string;
  market: string;
  q: string;
}): Promise<Conversation[]> {
  const res = await fetch(
    `${API_BASE}/api/communication/conversations?view=${query.view}&sources=${encodeURIComponent(query.sources)}&market=${query.market}&q=${encodeURIComponent(query.q)}`,
  );
  const data = await readJson(res);
  return (data.items as Conversation[] | undefined) ?? [];
}

export async function loadSettings(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/api/communication/settings`);
  return (await readJson(res)) as Record<string, string>;
}

export async function patchSettings(body: Record<string, string>): Promise<void> {
  await fetch(`${API_BASE}/api/communication/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function loadGmailAccount(): Promise<{ ready: boolean; connected: boolean }> {
  const res = await fetch(`${API_BASE}/api/communication/accounts`);
  const data = await readJson(res);
  const items = (data.items as Array<{ id: string; ready?: boolean; connected?: boolean }>) ?? [];
  const gmail = items.find((item) => item.id === "gmail-primary");
  return { ready: Boolean(gmail?.ready), connected: Boolean(gmail?.connected) };
}

export async function loadPlatforms(): Promise<Platform[]> {
  const res = await fetch(`${API_BASE}/api/communication/platforms`);
  const data = await readJson(res);
  const items = (data.items as Platform[] | undefined) ?? [];
  return items.filter((item) => item.mode !== "manual_only");
}

export async function connectGmail(): Promise<{ authorization_url?: string; detail?: string }> {
  const response = await fetch(`${API_BASE}/api/communication/accounts/gmail-primary/connect`, {
    method: "POST",
  });
  return (await readJson(response)) as { authorization_url?: string; detail?: string };
}

export async function syncGmail(): Promise<{ ok: boolean; ingested?: number; detail?: string }> {
  const response = await fetch(`${API_BASE}/api/communication/accounts/gmail-primary/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await readJson(response);
  return {
    ok: response.ok,
    ingested: data.ingested as number | undefined,
    detail: data.detail as string | undefined,
  };
}

export async function disconnectGmail(): Promise<void> {
  await fetch(`${API_BASE}/api/communication/accounts/gmail-primary/disconnect`, { method: "POST" });
}

export async function startPlatformBrowser(
  platformId: string,
): Promise<{ ok: boolean; detail?: string }> {
  const started = await fetch(
    `${API_BASE}/api/communication/platforms/${platformId}/browser/start`,
    { method: "POST" },
  );
  if (!started.ok) {
    const detail = await readJson(started);
    return { ok: false, detail: (detail.detail as string | undefined) ?? "Unable to start the browser" };
  }
  return { ok: true };
}

export async function capturePlatformPage(platformId: string): Promise<{
  ok: boolean;
  status: number;
  entries: CaptureDraft["entries"];
  url?: string;
  message?: string;
}> {
  const response = await fetch(
    `${API_BASE}/api/communication/platforms/${platformId}/browser/capture`,
    { method: "POST" },
  );
  const data = await readJson(response);
  const detail = data.detail;
  const message =
    typeof detail === "string"
      ? detail
      : ((detail as { message?: string } | undefined)?.message ?? undefined);
  return {
    ok: response.ok,
    status: response.status,
    entries: (data.entries as CaptureDraft["entries"] | undefined) ?? [],
    url: data.url as string | undefined,
    message,
  };
}

export async function createConversation(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${API_BASE}/api/communication/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function saveCaptureEntries(draft: CaptureDraft): Promise<void> {
  await Promise.all(
    draft.entries.map((entry, index) =>
      createConversation({
        summary: `${entry.label}: ${entry.preview}`,
        source: draft.source,
        channel: draft.source.toUpperCase(),
        external_thread_id: `${draft.external_thread_id}#${index + 1}`,
        request_id: crypto.randomUUID(),
      }),
    ),
  );
}

export async function postConversationAction(
  conversation: Conversation,
  actionName: string,
): Promise<string | null> {
  const response = await fetch(
    `${API_BASE}/api/communication/conversations/${conversation.id}/actions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: actionName,
        expected_version: conversation.version,
        visible_message_ids: conversation.messages.map((message) => message.id),
      }),
    },
  );
  const result = await readJson(response);
  return (result.undo_token as string | undefined) ?? null;
}

export async function undoConversationAction(token: string): Promise<void> {
  await fetch(`${API_BASE}/api/communication/actions/${token}/undo`, { method: "POST" });
}

export async function createConversationTask(
  conversationId: string,
  title: string,
): Promise<void> {
  await fetch(`${API_BASE}/api/communication/conversations/${conversationId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function searchJobs(value = ""): Promise<JobOption[]> {
  const response = await fetch(
    `${API_BASE}/api/communication/jobs?q=${encodeURIComponent(value)}`,
  );
  if (!response.ok) return [];
  const data = await readJson(response);
  return (data.items as JobOption[] | undefined) ?? [];
}

export async function createJob(newJob: NewJobDraft): Promise<{ id: string } | null> {
  const response = await fetch(`${API_BASE}/api/communication/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newJob),
  });
  if (!response.ok) return null;
  return (await readJson(response)) as { id: string };
}

export async function patchConversation(
  conversation: Conversation,
  body: Record<string, unknown>,
): Promise<boolean> {
  const response = await fetch(`${API_BASE}/api/communication/conversations/${conversation.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, expected_version: conversation.version }),
  });
  return response.ok;
}

export async function appendManualRecord(
  conversationId: string,
  summary: string,
): Promise<boolean> {
  const response = await fetch(
    `${API_BASE}/api/communication/conversations/${conversationId}/records`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary,
        channel: "manual",
        request_id: crypto.randomUUID(),
      }),
    },
  );
  return response.ok;
}

export async function createManualConversation(
  manual: ManualDraft,
  channel: string,
): Promise<void> {
  await createConversation({
    ...manual,
    source: "manual",
    channel,
    request_id: crypto.randomUUID(),
  });
}

export function settingsPayload(
  source: string,
  market: string,
  retentionMode: string,
  filterSettings: FilterSettings,
): Record<string, string> {
  return {
    default_sources: source,
    default_market: market,
    retention_mode: retentionMode,
    ...filterSettings,
  };
}
