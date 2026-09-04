"use client";

import { useCallback, useEffect, useState } from "react";

import { API_BASE } from "@/lib/api";

import { CommunicationDetail } from "./CommunicationDetail";
import { CommunicationFilters, CommunicationTabs } from "./CommunicationFilters";
import { CommunicationHeader } from "./CommunicationHeader";
import { CommunicationList } from "./CommunicationList";
import { CommunicationSettings } from "./CommunicationSettings";
import { ManualRecordForm } from "./ManualRecordForm";
import {
  DEFAULT_FILTER_SETTINGS,
  EMPTY_MANUAL,
  EMPTY_NEW_JOB,
  type CaptureDraft,
  type CommunicationView,
  type Conversation,
  type FilterSettings,
  type JobOption,
  type ManualRecord,
  type NewJobDraft,
  type Platform,
} from "./types";

export function CommunicationWorkspace() {
  const [view, setView] = useState<CommunicationView>("pending");
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
  const [filterSettings, setFilterSettings] = useState<FilterSettings>(DEFAULT_FILTER_SETTINGS);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [browserMessage, setBrowserMessage] = useState<string | null>(null);
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJob, setNewJob] = useState<NewJobDraft>(EMPTY_NEW_JOB);
  const [recordSummary, setRecordSummary] = useState("");
  const [associateJobId, setAssociateJobId] = useState("");
  const [captureDraft, setCaptureDraft] = useState<CaptureDraft | null>(null);
  const [manual, setManual] = useState<ManualRecord>(EMPTY_MANUAL);
  const [manualChannel, setManualChannel] = useState("wechat");
  const [manualOtherChannel, setManualOtherChannel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/communication/conversations?view=${view}&sources=${encodeURIComponent(source)}&market=${market}&q=${encodeURIComponent(query)}`,
      );
      const data = await res.json();
      setItems(data.items ?? []);
      setSelected((current) =>
        current && (data.items ?? []).find((x: Conversation) => x.id === current.id)
          ? (data.items ?? []).find((x: Conversation) => x.id === current.id)
          : ((data.items ?? [])[0] ?? null),
      );
    } catch {
      setItems([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [market, query, source, view]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetch(`${API_BASE}/api/communication/settings`)
      .then((res) => res.json())
      .then((data) => {
        if (data.default_sources) setSource(data.default_sources);
        if (data.default_market) setMarket(data.default_market);
        if (data.retention_mode) setRetentionMode(data.retention_mode);
        setFilterSettings((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.keys(current).map((key) => [key, data[key] ?? current[key as keyof typeof current]]),
          ),
        }));
      })
      .catch(() => undefined);
    void fetch(`${API_BASE}/api/communication/accounts`)
      .then((res) => res.json())
      .then((data) => {
        const gmail = (data.items ?? []).find((item: { id: string }) => item.id === "gmail-primary");
        if (gmail) {
          setGmailReady(Boolean(gmail.ready));
          setGmailConnected(Boolean(gmail.connected));
        }
      })
      .catch(() => undefined);
    void fetch(`${API_BASE}/api/communication/platforms`)
      .then((res) => res.json())
      .then((data) =>
        setPlatforms((data.items ?? []).filter((item: Platform) => item.mode !== "manual_only")),
      )
      .catch(() => undefined);
  }, []);

  async function saveSettings() {
    await fetch(`${API_BASE}/api/communication/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        default_sources: source,
        default_market: market,
        retention_mode: retentionMode,
        ...filterSettings,
      }),
    });
    setSettingsOpen(false);
  }

  async function connectGmail() {
    const response = await fetch(`${API_BASE}/api/communication/accounts/gmail-primary/connect`, {
      method: "POST",
    });
    const data = await response.json();
    if (data.authorization_url) window.open(data.authorization_url, "_blank", "noopener,noreferrer");
    else setSyncMessage(data.detail ?? "Gmail is not configured");
  }

  async function syncGmail() {
    setSyncing(true);
    try {
      const response = await fetch(`${API_BASE}/api/communication/accounts/gmail-primary/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      setSyncMessage(response.ok ? `${data.ingested ?? 0} new messages synced` : (data.detail ?? "Gmail sync failed"));
      if (response.ok) await load();
    } finally {
      setSyncing(false);
    }
  }

  async function disconnectGmail() {
    await fetch(`${API_BASE}/api/communication/accounts/gmail-primary/disconnect`, { method: "POST" });
    setGmailConnected(false);
    setSyncMessage("Gmail disconnected on this device");
  }

  async function capturePlatform(platform: Platform) {
    setBrowserMessage(`Reading ${platform.label}...`);
    const response = await fetch(`${API_BASE}/api/communication/platforms/${platform.id}/browser/capture`, {
      method: "POST",
    });
    const data = await response.json();
    if (!response.ok && response.status === 409) {
      const started = await fetch(`${API_BASE}/api/communication/platforms/${platform.id}/browser/start`, {
        method: "POST",
      });
      if (!started.ok) {
        const detail = await started.json();
        setBrowserMessage(detail.detail ?? "Unable to start the browser");
        return;
      }
      setBrowserMessage(`${platform.label} opened in the background. Log in there once, then click Read page again.`);
      return;
    }
    if (!response.ok) {
      setBrowserMessage(data.detail?.message ?? data.detail ?? "Open and log in to the platform first");
      return;
    }
    setCaptureDraft({ source: platform.id, entries: data.entries ?? [], external_thread_id: data.url ?? "" });
    setBrowserMessage(`${platform.label}: ${data.entries?.length ?? 0} conversations ready. Review and save if useful.`);
  }

  async function saveCapture() {
    if (!captureDraft?.entries.length) return;
    await Promise.all(
      captureDraft.entries.map((entry, index) =>
        fetch(`${API_BASE}/api/communication/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: `${entry.label}: ${entry.preview}`,
            source: captureDraft.source,
            channel: captureDraft.source.toUpperCase(),
            external_thread_id: `${captureDraft.external_thread_id}#${index + 1}`,
            request_id: crypto.randomUUID(),
          }),
        }),
      ),
    );
    setCaptureDraft(null);
    setBrowserMessage("Capture saved");
    await load();
  }

  async function action(actionName: string) {
    if (!selected) return;
    const response = await fetch(`${API_BASE}/api/communication/conversations/${selected.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: actionName,
        expected_version: selected.version,
        visible_message_ids: selected.messages.map((message) => message.id),
      }),
    });
    const result = await response.json();
    setUndoToken(result.undo_token ?? null);
    await load();
  }

  async function undo() {
    if (!undoToken) return;
    await fetch(`${API_BASE}/api/communication/actions/${undoToken}/undo`, { method: "POST" });
    setUndoToken(null);
    await load();
  }

  async function createTask() {
    if (!selected?.job_id || !taskTitle.trim()) return;
    await fetch(`${API_BASE}/api/communication/conversations/${selected.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: taskTitle.trim() }),
    });
    setTaskTitle("");
    await load();
  }

  async function loadJobs(value = "") {
    const response = await fetch(`${API_BASE}/api/communication/jobs?q=${encodeURIComponent(value)}`);
    if (response.ok) setJobOptions((await response.json()).items ?? []);
  }

  async function createJob() {
    if (!newJob.company.trim() && !newJob.role.trim()) return;
    const response = await fetch(`${API_BASE}/api/communication/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newJob),
    });
    if (!response.ok) return;
    const job = await response.json();
    if (selected) {
      await fetch(`${API_BASE}/api/communication/conversations/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id, expected_version: selected.version }),
      });
      await load();
    } else {
      setManual((current) => ({ ...current, job_id: job.id }));
    }
    setNewJobOpen(false);
  }

  async function appendRecord() {
    if (!selected || !recordSummary.trim()) return;
    const response = await fetch(`${API_BASE}/api/communication/conversations/${selected.id}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: recordSummary.trim(),
        channel: "manual",
        request_id: crypto.randomUUID(),
      }),
    });
    if (response.ok) {
      setRecordSummary("");
      await load();
    }
  }

  async function associateJob() {
    if (!selected || !associateJobId) return;
    const response = await fetch(`${API_BASE}/api/communication/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: associateJobId, expected_version: selected.version }),
    });
    if (response.ok) {
      setAssociateJobId("");
      await load();
    }
  }

  async function createManual() {
    if (!manual.summary.trim()) return;
    const channel = manualChannel === "other" ? manualOtherChannel.trim() || "other" : manualChannel;
    await fetch(`${API_BASE}/api/communication/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...manual, source: "manual", channel, request_id: crypto.randomUUID() }),
    });
    setManual(EMPTY_MANUAL);
    setManualOpen(false);
    setView(manual.needs_action ? "pending" : "retained");
    await load();
  }

  function toggleSource(id: string, checked: boolean) {
    setSource((current) =>
      checked
        ? [...new Set([...current.split(",").filter(Boolean), id])].join(",")
        : current.split(",").filter((item) => item !== id).join(","),
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-5 py-12">
      <CommunicationHeader
        onManualRecord={() => setManualOpen(true)}
        onRefresh={() => void load()}
        onToggleSettings={() => setSettingsOpen((value) => !value)}
        settingsOpen={settingsOpen}
      />

      {settingsOpen ? (
        <CommunicationSettings
          market={market}
          source={source}
          retentionMode={retentionMode}
          filterSettings={filterSettings}
          gmailReady={gmailReady}
          gmailConnected={gmailConnected}
          syncing={syncing}
          syncMessage={syncMessage}
          platforms={platforms}
          browserMessage={browserMessage}
          captureDraft={captureDraft}
          onMarketChange={setMarket}
          onSourceChange={setSource}
          onRetentionChange={setRetentionMode}
          onFilterChange={setFilterSettings}
          onSave={() => void saveSettings()}
          onConnectGmail={() => void connectGmail()}
          onSyncGmail={() => void syncGmail()}
          onDisconnectGmail={() => void disconnectGmail()}
          onCapturePlatform={(platform) => void capturePlatform(platform)}
          onSaveCapture={() => void saveCapture()}
          onDiscardCapture={() => setCaptureDraft(null)}
        />
      ) : null}

      {manualOpen ? (
        <ManualRecordForm
          manual={manual}
          manualChannel={manualChannel}
          manualOtherChannel={manualOtherChannel}
          jobOptions={jobOptions}
          newJobOpen={newJobOpen}
          newJob={newJob}
          onManualChange={setManual}
          onChannelChange={(value) => {
            setManualChannel(value);
            setManual({ ...manual, channel: value });
          }}
          onOtherChannelChange={setManualOtherChannel}
          onLoadJobs={() => void loadJobs()}
          onToggleNewJob={() => setNewJobOpen((value) => !value)}
          onNewJobChange={setNewJob}
          onCreateJob={() => void createJob()}
          onSave={() => void createManual()}
          onCancel={() => setManualOpen(false)}
        />
      ) : null}

      <CommunicationFilters
        query={query}
        source={source}
        market={market}
        onQueryChange={setQuery}
        onSourceToggle={toggleSource}
        onMarketChange={setMarket}
      />
      <CommunicationTabs view={view} onChange={setView} />

      <div className="grid min-h-[32rem] overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-[minmax(220px,32%)_1fr]">
        <section className="border-b border-line md:border-b-0 md:border-r md:border-line">
          <CommunicationList
            items={items}
            selectedId={selected?.id ?? null}
            loading={loading}
            view={view}
            onSelect={setSelected}
            onManualRecord={() => setManualOpen(true)}
          />
        </section>
        <section className="p-5">
          <CommunicationDetail
            selected={selected}
            taskTitle={taskTitle}
            recordSummary={recordSummary}
            associateJobId={associateJobId}
            jobOptions={jobOptions}
            undoToken={undoToken}
            onTaskTitleChange={setTaskTitle}
            onRecordSummaryChange={setRecordSummary}
            onAssociateJobIdChange={setAssociateJobId}
            onLoadJobs={() => void loadJobs()}
            onCreateTask={() => void createTask()}
            onAppendRecord={() => void appendRecord()}
            onAssociateJob={() => void associateJob()}
            onNewJob={() => {
              setManualOpen(true);
              setNewJobOpen(true);
            }}
            onAction={(actionName) => void action(actionName)}
            onUndo={() => void undo()}
          />
        </section>
      </div>
    </div>
  );
}
