"use client";

import { Archive, Check, ExternalLink, RefreshCw, Settings, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Message = { id: string; summary: string; body: string; occurred_at: string; channel: string };
type Conversation = { id: string; company: string; role: string; contact: string; source: string; external_thread_id?: string | null; market: string; stage: string; retained: boolean; version: number; job_id?: string | null; messages: Message[]; tasks: Array<{ id: string; title: string; done: boolean }> };
type Platform = { id: string; label: string; url: string; mode: string; requires_login: boolean; chat_configured: boolean };
type JobOption = { id: string; company: string; title: string; location: string };

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export default function CommunicationPage() {
  const [view, setView] = useState<"pending" | "retained">("pending");
  const [source, setSource] = useState("email");
  const [market, setMarket] = useState("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [retentionMode, setRetentionMode] = useState("14_days");
  const [gmailReady, setGmailReady] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [filterSettings, setFilterSettings] = useState({ keep_words: "", skip_words: "", stale_days: "30", skip_companies: "", label_linkedin_noise: "true", hide_gig_noise: "true" });
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [browserMessage, setBrowserMessage] = useState<string | null>(null);
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJob, setNewJob] = useState({ company: "", role: "", location: "", job_url: "", market: "unclassified" });
  const [recordSummary, setRecordSummary] = useState("");
  const [associateJobId, setAssociateJobId] = useState("");
  const [captureDraft, setCaptureDraft] = useState<{ source: string; entries: Array<{ label: string; preview: string; date: string }>; external_thread_id: string } | null>(null);
  const [manual, setManual] = useState({ summary: "", company: "", role: "", source: "manual", external_thread_id: "", job_id: "", application_id: "", channel: "wechat", needs_action: false });
  const [manualChannel, setManualChannel] = useState("wechat");
  const [manualOtherChannel, setManualOtherChannel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/communication/conversations?view=${view}&sources=${encodeURIComponent(source)}&market=${market}&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setSelected((current) => current && (data.items ?? []).find((x: Conversation) => x.id === current.id) ? (data.items ?? []).find((x: Conversation) => x.id === current.id) : (data.items ?? [])[0] ?? null);
    } finally { setLoading(false); }
  }, [market, query, source, view]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void fetch(`${API}/api/communication/settings`).then((res) => res.json()).then((data) => {
      if (data.default_sources) setSource(data.default_sources);
      if (data.default_market) setMarket(data.default_market);
      if (data.retention_mode) setRetentionMode(data.retention_mode);
      setFilterSettings((current) => ({ ...current, ...Object.fromEntries(Object.keys(current).map((key) => [key, data[key] ?? current[key as keyof typeof current]])) }));
    });
    void fetch(`${API}/api/communication/accounts`).then((res) => res.json()).then((data) => {
      const gmail = (data.items ?? []).find((item: { id: string }) => item.id === "gmail-primary");
      if (gmail) { setGmailReady(Boolean(gmail.ready)); setGmailConnected(Boolean(gmail.connected)); }
    });
    void fetch(`${API}/api/communication/platforms`).then((res) => res.json()).then((data) => setPlatforms((data.items ?? []).filter((item: Platform) => item.mode !== "manual_only")));
  }, []);

  async function saveSettings() {
    await fetch(`${API}/api/communication/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ default_sources: source, default_market: market, retention_mode: retentionMode, ...filterSettings }) });
    setSettingsOpen(false);
  }

  async function connectGmail() {
    const response = await fetch(`${API}/api/communication/accounts/gmail-primary/connect`, { method: "POST" });
    const data = await response.json();
    if (data.authorization_url) window.open(data.authorization_url, "_blank", "noopener,noreferrer");
    else setSyncMessage(data.detail ?? "Gmail is not configured");
  }

  async function syncGmail() {
    setSyncing(true);
    try {
      const response = await fetch(`${API}/api/communication/accounts/gmail-primary/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await response.json();
      setSyncMessage(response.ok ? `${data.ingested ?? 0} new messages synced` : (data.detail ?? "Gmail sync failed"));
      if (response.ok) await load();
    }
    finally { setSyncing(false); }
  }

  async function disconnectGmail() {
    await fetch(`${API}/api/communication/accounts/gmail-primary/disconnect`, { method: "POST" });
    setGmailConnected(false);
    setSyncMessage("Gmail disconnected on this device");
  }

  async function capturePlatform(platform: Platform) {
    setBrowserMessage(`Reading ${platform.label}...`);
    const response = await fetch(`${API}/api/communication/platforms/${platform.id}/browser/capture`, { method: "POST" });
    const data = await response.json();
    if (!response.ok && response.status === 409) {
      const started = await fetch(`${API}/api/communication/platforms/${platform.id}/browser/start`, { method: "POST" });
      if (!started.ok) { const detail = await started.json(); setBrowserMessage(detail.detail ?? "Unable to start the browser"); return; }
      setBrowserMessage(`${platform.label} opened in the background. Log in there once, then click Read page again.`);
      return;
    }
    if (!response.ok) { setBrowserMessage(data.detail?.message ?? data.detail ?? "Open and log in to the platform first"); return; }
    setCaptureDraft({ source: platform.id, entries: data.entries ?? [], external_thread_id: data.url ?? "" });
    setBrowserMessage(`${platform.label}: ${data.entries?.length ?? 0} conversations ready. Review and save if useful.`);
  }

  async function saveCapture() {
    if (!captureDraft?.entries.length) return;
    await Promise.all(captureDraft.entries.map((entry, index) => fetch(`${API}/api/communication/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: `${entry.label}: ${entry.preview}`, source: captureDraft.source, channel: captureDraft.source.toUpperCase(), external_thread_id: `${captureDraft.external_thread_id}#${index + 1}`, request_id: crypto.randomUUID() }) })));
    setCaptureDraft(null);
    setBrowserMessage("Capture saved");
    await load();
  }

  async function action(actionName: string) {
    if (!selected) return;
    const response = await fetch(`${API}/api/communication/conversations/${selected.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, expected_version: selected.version, visible_message_ids: selected.messages.map((m) => m.id) }) });
    const result = await response.json();
    setUndoToken(result.undo_token ?? null);
    await load();
  }

  async function undo() {
    if (!undoToken) return;
    await fetch(`${API}/api/communication/actions/${undoToken}/undo`, { method: "POST" });
    setUndoToken(null);
    await load();
  }

  async function createTask() {
    if (!selected?.job_id || !taskTitle.trim()) return;
    await fetch(`${API}/api/communication/conversations/${selected.id}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: taskTitle.trim() }) });
    setTaskTitle("");
    await load();
  }

  async function loadJobs(value = "") {
    const response = await fetch(`${API}/api/communication/jobs?q=${encodeURIComponent(value)}`);
    if (response.ok) setJobOptions((await response.json()).items ?? []);
  }

  async function createJob() {
    if (!newJob.company.trim() && !newJob.role.trim()) return;
    const response = await fetch(`${API}/api/communication/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newJob) });
    if (!response.ok) return;
    const job = await response.json();
    if (selected) {
      await fetch(`${API}/api/communication/conversations/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_id: job.id, expected_version: selected.version }) });
      await load();
    } else {
      setManual((current) => ({ ...current, job_id: job.id }));
    }
    setNewJobOpen(false);
  }

  async function appendRecord() {
    if (!selected || !recordSummary.trim()) return;
    const response = await fetch(`${API}/api/communication/conversations/${selected.id}/records`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: recordSummary.trim(), channel: "manual", request_id: crypto.randomUUID() }) });
    if (response.ok) { setRecordSummary(""); await load(); }
  }

  async function associateJob() {
    if (!selected || !associateJobId) return;
    const response = await fetch(`${API}/api/communication/conversations/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_id: associateJobId, expected_version: selected.version }) });
    if (response.ok) { setAssociateJobId(""); await load(); }
  }

  async function createManual() {
    if (!manual.summary.trim()) return;
    const channel = manualChannel === "other" ? (manualOtherChannel.trim() || "other") : manualChannel;
    await fetch(`${API}/api/communication/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...manual, source: "manual", channel, request_id: crypto.randomUUID() }) });
    setManual({ summary: "", company: "", role: "", source: "manual", external_thread_id: "", job_id: "", application_id: "", channel: "wechat", needs_action: false });
    setManualOpen(false);
    setView(manual.needs_action ? "pending" : "retained");
    await load();
  }

  return <main className="mx-auto max-w-6xl space-y-5 px-5 py-8">
    <input className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" placeholder="Search company or role" value={query} onChange={(e) => setQuery(e.target.value)} />
    {gmailConnected ? <button className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => void disconnectGmail()}>Disconnect Gmail</button> : null}
    {selected?.external_thread_id?.match(/^https?:\/\//i) ? <a className="inline-flex items-center gap-1.5 text-sm text-brand" href={selected.external_thread_id} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open chat</a> : null}
    {manualOpen && newJobOpen ? <div className="flex flex-wrap gap-3 rounded-lg border border-line bg-surface p-4"><input className="rounded-md border border-line bg-bg px-3 py-2 text-sm" placeholder="Company" value={newJob.company} onChange={(e) => setNewJob({ ...newJob, company: e.target.value })} /><input className="rounded-md border border-line bg-bg px-3 py-2 text-sm" placeholder="Role" value={newJob.role} onChange={(e) => setNewJob({ ...newJob, role: e.target.value })} /><input className="rounded-md border border-line bg-bg px-3 py-2 text-sm" placeholder="Location" value={newJob.location} onChange={(e) => setNewJob({ ...newJob, location: e.target.value })} /><button className="rounded-md bg-brand px-3 py-2 text-sm text-white" onClick={() => void createJob()}>Create Job</button></div> : null}
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold text-ink">Communication</h1>{syncMessage ? <p className="mt-1 text-xs text-muted">{syncMessage}</p> : null}</div><div className="flex flex-wrap gap-2"><span className="self-center text-xs text-muted">Gmail {gmailConnected ? "connected" : gmailReady ? "ready" : "not configured"}</span>{gmailReady && !gmailConnected ? <button className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => void connectGmail()}>Connect Gmail</button> : null}{gmailConnected ? <button className="rounded-md bg-brand px-3 py-2 text-sm text-white" disabled={syncing} onClick={() => void syncGmail()}>{syncing ? "Syncing..." : "Sync Gmail"}</button> : null}<button className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => setManualOpen(true)}>Manual record</button><button className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</button><button className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm" onClick={() => setSettingsOpen((v) => !v)}><Settings className="h-4 w-4" /> Settings</button><details className="relative"><summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full border border-line text-sm font-semibold text-muted" title="View communication rules">i</summary><div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-line bg-surface p-3 text-left shadow-lg"><p className="text-sm font-medium text-ink">Current rules</p><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted"><li>Unread job-related email only.</li><li>Receipts, template rejections, newsletters, and security mail are excluded.</li><li>Interview, assessment, materials, intent, new role, and useful application updates are kept.</li><li>Suspicious messages are quarantined and never deleted from Gmail.</li></ul></div></details></div></header>
    {settingsOpen ? <div className="rounded-lg border border-line bg-surface p-4"><h2 className="text-sm font-medium text-ink">Communication settings</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-sm text-muted">Default market<select className="mt-1 block w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink" value={market} onChange={(e) => setMarket(e.target.value)}><option value="all">All</option><option value="cn">CN</option><option value="en">EN</option><option value="unclassified">Unclassified</option></select></label><label className="text-sm text-muted">Retention<select className="mt-1 block w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink" value={retentionMode} onChange={(e) => setRetentionMode(e.target.value)}><option value="14_days">14 days</option><option value="30_days">30 days</option><option value="manual">Manual</option></select></label><label className="text-sm text-muted">Default sources<input className="mt-1 block w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink" value={source} onChange={(e) => setSource(e.target.value)} /></label><label className="text-sm text-muted">Keep words<input className="mt-1 block w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink" placeholder="comma separated" value={filterSettings.keep_words} onChange={(e) => setFilterSettings({ ...filterSettings, keep_words: e.target.value })} /></label><label className="text-sm text-muted">Skip words<input className="mt-1 block w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink" placeholder="comma separated" value={filterSettings.skip_words} onChange={(e) => setFilterSettings({ ...filterSettings, skip_words: e.target.value })} /></label><label className="text-sm text-muted">Stale days<input type="number" min={1} max={3650} className="mt-1 block w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink" value={filterSettings.stale_days} onChange={(e) => setFilterSettings({ ...filterSettings, stale_days: e.target.value })} /></label><label className="text-sm text-muted">Skip companies<input className="mt-1 block w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink" placeholder="comma separated" value={filterSettings.skip_companies} onChange={(e) => setFilterSettings({ ...filterSettings, skip_companies: e.target.value })} /></label><label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={filterSettings.label_linkedin_noise === "true"} onChange={(e) => setFilterSettings({ ...filterSettings, label_linkedin_noise: String(e.target.checked) })} /> Hide LinkedIn data-labeling noise</label><label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={filterSettings.hide_gig_noise === "true"} onChange={(e) => setFilterSettings({ ...filterSettings, hide_gig_noise: String(e.target.checked) })} /> Hide intern / gig noise</label></div><button className="mt-3 rounded-md bg-brand px-3 py-2 text-sm text-white" onClick={() => void saveSettings()}>Save settings</button></div> : null}
    {platforms.length ? <section className="flex flex-wrap items-center gap-2 border-b border-line pb-4"><span className="mr-1 text-sm text-muted">Platforms</span>{platforms.map((platform) => <span key={platform.id} className="inline-flex items-center gap-1.5">{platform.mode === "manual_only" ? <span className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink">{platform.label}</span> : <a href={platform.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink"><ExternalLink className="h-3.5 w-3.5" />{platform.label}</a>}{platform.mode === "manual_only" ? <button className="rounded-md border border-line px-2 py-1.5 text-xs text-muted" onClick={() => setManualOpen(true)}>Manual record</button> : <button className="rounded-md border border-line px-2 py-1.5 text-xs text-muted" onClick={() => void capturePlatform(platform)}>Read page</button>}</span>)}</section> : null}
    {browserMessage ? <p className="text-xs text-muted">{browserMessage}</p> : null}
    {captureDraft ? <div className="rounded-lg border border-line bg-surface p-4"><p className="text-sm font-medium text-ink">Capture preview ({captureDraft.entries.length})</p><div className="mt-2 max-h-48 overflow-auto space-y-2">{captureDraft.entries.map((entry) => <div key={`${entry.date}-${entry.label}`} className="border-b border-line pb-2 text-xs"><p className="font-medium text-ink">{entry.label} <span className="font-normal text-muted">{entry.date}</span></p><p className="text-muted">{entry.preview}</p></div>)}</div><div className="mt-3 flex gap-2"><button className="rounded-md bg-brand px-3 py-2 text-sm text-white" onClick={() => void saveCapture()}>Save captures</button><button className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => setCaptureDraft(null)}>Discard</button></div></div> : null}
    {manualOpen ? <div className="rounded-lg border border-line bg-surface p-4"><p className="mb-3 text-sm font-medium text-ink">Manual communication record</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-muted">Channel<select className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink" value={manualChannel} onChange={(e) => { setManualChannel(e.target.value); setManual({ ...manual, channel: e.target.value }); }}><option value="wechat">WeChat</option><option value="phone">Phone</option><option value="liepin">Liepin</option><option value="zhilian">Zhaopin</option><option value="boss">BOSS</option><option value="other">Other</option></select></label>{manualChannel === "other" ? <label className="text-sm text-muted">Channel name<input className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm" placeholder="Enter channel name" value={manualOtherChannel} onChange={(e) => setManualOtherChannel(e.target.value)} /></label> : null}<input className="rounded-md border border-line bg-bg px-3 py-2 text-sm" placeholder="Company (optional)" value={manual.company} onChange={(e) => setManual({ ...manual, company: e.target.value })} /><input className="rounded-md border border-line bg-bg px-3 py-2 text-sm" placeholder="Role (optional)" value={manual.role} onChange={(e) => setManual({ ...manual, role: e.target.value })} /><label className="text-sm text-muted">Related Job<select className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm" value={manual.job_id} onFocus={() => void loadJobs()} onChange={(e) => setManual({ ...manual, job_id: e.target.value })}><option value="">No linked Job</option>{jobOptions.map((job) => <option key={job.id} value={job.id}>{job.company || "Unknown"} · {job.title || "Untitled"}</option>)}</select></label><button className="self-end rounded-md border border-line px-3 py-2 text-sm" onClick={() => setNewJobOpen((value) => !value)}>New Job</button><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={manual.needs_action} onChange={(e) => setManual({ ...manual, needs_action: e.target.checked })} /> Needs action</label><textarea className="sm:col-span-2 rounded-md border border-line bg-bg px-3 py-2 text-sm" placeholder="What happened? Add a concise message or note (required)" rows={4} value={manual.summary} onChange={(e) => setManual({ ...manual, summary: e.target.value })} /></div>{newJobOpen ? <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3"><input className="rounded-md border border-line bg-bg px-3 py-2 text-sm" placeholder="New job company" value={newJob.company} onChange={(e) => setNewJob({ ...newJob, company: e.target.value })} /><input className="rounded-md border border-line bg-bg px-3 py-2 text-sm" placeholder="New job role" value={newJob.role} onChange={(e) => setNewJob({ ...newJob, role: e.target.value })} /><input className="rounded-md border border-line bg-bg px-3 py-2 text-sm" placeholder="Location (optional)" value={newJob.location} onChange={(e) => setNewJob({ ...newJob, location: e.target.value })} /><button className="rounded-md bg-brand px-3 py-2 text-sm text-white" onClick={() => void createJob()}>Create Job</button></div> : null}<div className="mt-3 flex gap-2"><button className="rounded-md bg-brand px-3 py-2 text-sm text-white" onClick={() => void createManual()}>Save record</button><button className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => setManualOpen(false)}>Cancel</button></div></div> : null}
    <section className="flex flex-wrap items-center gap-3 border-b border-line pb-4"><span className="text-sm text-muted">Sources</span>{["email", "boss", "manual"].map((s) => <label key={s} className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={source.split(",").includes(s)} onChange={(e) => setSource((v) => e.target.checked ? [...new Set([...v.split(",").filter(Boolean), s])].join(",") : v.split(",").filter((x) => x !== s).join(","))} />{s === "email" ? "Email" : s === "boss" ? "BOSS" : "Manual"}</label>)}<select className="ml-auto rounded-md border border-line bg-surface px-2 py-1.5 text-sm" value={market} onChange={(e) => setMarket(e.target.value)}><option value="all">All</option><option value="cn">CN</option><option value="en">EN</option><option value="unclassified">Unclassified</option></select></section>
    <div className="flex gap-6 border-b border-line"><button title="Messages that need your next action" className={`border-b-2 px-1 pb-2 text-sm ${view === "pending" ? "border-brand font-medium" : "border-transparent text-muted"}`} onClick={() => setView("pending")}>Needs action</button><button title="Messages you saved without a current action" className={`border-b-2 px-1 pb-2 text-sm ${view === "retained" ? "border-brand font-medium" : "border-transparent text-muted"}`} onClick={() => setView("retained")}>Saved conversations</button></div>
    <div className="grid min-h-[32rem] overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-[minmax(220px,32%)_1fr]"> <section className="border-b border-line md:border-b-0 md:border-r md:border-line">{loading ? <p className="p-5 text-sm text-muted">Loading...</p> : items.length === 0 ? <p className="p-5 text-sm text-muted">No conversations.</p> : items.map((item) => <button key={item.id} onClick={() => setSelected(item)} className={`block w-full border-b border-line p-4 text-left ${selected?.id === item.id ? "bg-brand/10" : "hover:bg-ink/[0.03]"}`}><p className="font-medium text-ink">{item.company || "Unknown company"}</p><p className="text-sm text-muted">{item.role || "Conversation"}</p><p className="mt-2 line-clamp-2 text-xs text-muted">{item.messages[0]?.summary}</p><span className="mt-2 inline-block rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">{item.source}</span></button>)}</section>
      <section className="p-5">{selected ? <><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-ink">{selected.company || "Conversation"} {selected.role ? `· ${selected.role}` : ""}</h2><p className="text-sm text-muted">{selected.contact}</p>{selected.source === "email" && selected.external_thread_id ? <a className="mt-1 inline-flex text-xs text-brand" href={`https://mail.google.com/mail/u/0/#all/${selected.external_thread_id}`} target="_blank" rel="noreferrer">Open in Gmail</a> : selected.external_thread_id?.match(/^https?:\/\//i) ? <a className="mt-1 inline-flex text-xs text-brand" href={selected.external_thread_id} target="_blank" rel="noreferrer">Open original</a> : null}</div><span className="rounded border border-line px-2 py-1 text-xs text-muted">{({ contact: "Application update", assessment: "Assessment", materials: "Materials requested", intent: "Intent confirmation", role: "New role", interview: "Interview", offer: "Offer" } as Record<string, string>)[selected.stage] || selected.stage}</span></div><div className="mt-5 space-y-3">{selected.messages.map((message) => <article key={message.id} className="rounded-md border border-line p-4"><p className="whitespace-pre-wrap text-sm text-ink">{message.body || message.summary}</p><p className="mt-2 text-xs text-muted">{new Date(message.occurred_at).toLocaleString()} · {message.channel || selected.source}</p></article>)}</div><div className="mt-6 border-t border-line pt-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-medium text-ink">Tasks</h3><a className="text-xs text-brand" href="/tasks">Open in Tasks</a></div>{selected.tasks.length ? selected.tasks.map((task) => <div key={String(task.id)} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={Boolean(task.done)} readOnly />{String(task.title)}</div>) : <p className="text-sm text-muted">No linked tasks.</p>}{selected.job_id ? <div className="mt-3 flex gap-2"><input className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-sm" placeholder="Create task" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} /><button className="rounded-md border border-line px-2 py-1.5 text-sm" onClick={() => void createTask()}>Add</button></div> : <p className="mt-2 text-xs text-muted">Associate a Job to create a task.</p>}</div><div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4"><button onClick={() => void action("keep")} className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm text-white"><Check className="h-4 w-4" /> Keep</button><button onClick={() => void action("archive")} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm"><Archive className="h-4 w-4" /> Archive</button><button onClick={() => void action("delete")} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-red-700"><Trash2 className="h-4 w-4" /> Delete</button>{undoToken ? <button onClick={() => void undo()} className="rounded-md border border-brand px-3 py-2 text-sm text-brand">Undo</button> : null}</div></> : <p className="text-sm text-muted">Select a conversation.</p>}</section></div>
    {selected ? <div className="flex gap-2"><input className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-sm" placeholder="Add a manual record" value={recordSummary} onChange={(e) => setRecordSummary(e.target.value)} /><button className="rounded-md border border-line px-2 py-1.5 text-sm" onClick={() => void appendRecord()}>Add record</button></div> : null}
    {selected && !selected.job_id ? <div className="flex flex-wrap gap-2"><select className="min-w-[18rem] rounded-md border border-line bg-bg px-2 py-1.5 text-sm" value={associateJobId} onFocus={() => void loadJobs()} onChange={(e) => setAssociateJobId(e.target.value)}><option value="">Associate a Job</option>{jobOptions.map((job) => <option key={job.id} value={job.id}>{job.company || "Unknown"} · {job.title || "Untitled"}</option>)}</select><button className="rounded-md border border-line px-2 py-1.5 text-sm" onClick={() => void associateJob()}>Link Job</button><button className="rounded-md border border-line px-2 py-1.5 text-sm" onClick={() => { setManualOpen(true); setNewJobOpen(true); }}>New Job</button></div> : null}
  </main>;
}
