"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

import {
  appendManualRecord,
  capturePlatformPage,
  connectGmail,
  createConversationTask,
  createJob,
  createManualConversation,
  disconnectGmail,
  listConversations,
  loadGmailAccount,
  loadPlatforms,
  loadSettings,
  patchConversation,
  patchSettings,
  postConversationAction,
  saveCaptureEntries,
  searchJobs,
  settingsPayload,
  startPlatformBrowser,
  syncGmail,
  undoConversationAction,
} from "./client";
import { CommunicationFilters } from "./CommunicationFilters";
import { CommunicationHeader } from "./CommunicationHeader";
import { CommunicationSettings } from "./CommunicationSettings";
import { CommunicationTabs } from "./CommunicationTabs";
import { ConversationDetail } from "./ConversationDetail";
import { ConversationList } from "./ConversationList";
import { COMMUNICATION_COPY } from "./copy";
import { ManualRecordPanel } from "./ManualRecordPanel";
import {
  EMPTY_FILTER_SETTINGS,
  EMPTY_MANUAL,
  EMPTY_NEW_JOB,
  type CaptureDraft,
  type CommunicationView,
  type Conversation,
  type JobOption,
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
  const [filterSettings, setFilterSettings] = useState(EMPTY_FILTER_SETTINGS);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [browserMessage, setBrowserMessage] = useState<string | null>(null);
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJob, setNewJob] = useState(EMPTY_NEW_JOB);
  const [recordSummary, setRecordSummary] = useState("");
  const [associateJobId, setAssociateJobId] = useState("");
  const [captureDraft, setCaptureDraft] = useState<CaptureDraft | null>(null);
  const [manual, setManual] = useState(EMPTY_MANUAL);
  const [manualChannel, setManualChannel] = useState("wechat");
  const [manualOtherChannel, setManualOtherChannel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listConversations({ view, sources: source, market, q: query });
      setItems(next);
      setSelected((current) =>
        current && next.find((item) => item.id === current.id)
          ? (next.find((item) => item.id === current.id) ?? null)
          : (next[0] ?? null),
      );
    } finally {
      setLoading(false);
    }
  }, [market, query, source, view]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSettings().then((data) => {
      if (data.default_sources) setSource(data.default_sources);
      if (data.default_market) setMarket(data.default_market);
      if (data.retention_mode) setRetentionMode(data.retention_mode);
      setFilterSettings((current) => ({
        ...current,
        ...Object.fromEntries(
          Object.keys(current).map((key) => [key, data[key] ?? current[key as keyof typeof current]]),
        ),
      }));
    });
    void loadGmailAccount().then((gmail) => {
      setGmailReady(gmail.ready);
      setGmailConnected(gmail.connected);
    });
    void loadPlatforms().then(setPlatforms);
  }, []);

  async function saveSettings() {
    await patchSettings(settingsPayload(source, market, retentionMode, filterSettings));
    setSettingsOpen(false);
  }

  async function onConnectGmail() {
    const data = await connectGmail();
    if (data.authorization_url) window.open(data.authorization_url, "_blank", "noopener,noreferrer");
    else setSyncMessage(data.detail ?? "Gmail is not configured");
  }

  async function onSyncGmail() {
    setSyncing(true);
    try {
      const data = await syncGmail();
      setSyncMessage(data.ok ? `${data.ingested ?? 0} new messages synced` : (data.detail ?? "Gmail sync failed"));
      if (data.ok) await load();
    } finally {
      setSyncing(false);
    }
  }

  async function onDisconnectGmail() {
    await disconnectGmail();
    setGmailConnected(false);
    setSyncMessage("Gmail disconnected on this device");
  }

  async function onCapturePlatform(platform: Platform) {
    setBrowserMessage(`Reading ${platform.label}...`);
    const data = await capturePlatformPage(platform.id);
    if (!data.ok && data.status === 409) {
      const started = await startPlatformBrowser(platform.id);
      if (!started.ok) {
        setBrowserMessage(started.detail ?? "Unable to start the browser");
        return;
      }
      setBrowserMessage(
        `${platform.label} opened in the background. Log in there once, then click Read page again.`,
      );
      return;
    }
    if (!data.ok) {
      setBrowserMessage(data.message ?? "Open and log in to the platform first");
      return;
    }
    setCaptureDraft({
      source: platform.id,
      entries: data.entries,
      external_thread_id: data.url ?? "",
    });
    setBrowserMessage(`${platform.label}: ${data.entries.length} conversations ready. Review and save if useful.`);
  }

  async function onSaveCapture() {
    if (!captureDraft?.entries.length) return;
    await saveCaptureEntries(captureDraft);
    setCaptureDraft(null);
    setBrowserMessage("Capture saved");
    await load();
  }

  async function action(actionName: string) {
    if (!selected) return;
    const token = await postConversationAction(selected, actionName);
    setUndoToken(token);
    await load();
  }

  async function undo() {
    if (!undoToken) return;
    await undoConversationAction(undoToken);
    setUndoToken(null);
    await load();
  }

  async function onCreateTask() {
    if (!selected?.job_id || !taskTitle.trim()) return;
    await createConversationTask(selected.id, taskTitle.trim());
    setTaskTitle("");
    await load();
  }

  async function onLoadJobs(value = "") {
    setJobOptions(await searchJobs(value));
  }

  async function onCreateJob() {
    if (!newJob.company.trim() && !newJob.role.trim()) return;
    const job = await createJob(newJob);
    if (!job) return;
    if (selected) {
      await patchConversation(selected, { job_id: job.id });
      await load();
    } else {
      setManual((current) => ({ ...current, job_id: job.id }));
    }
    setNewJobOpen(false);
  }

  async function onAppendRecord() {
    if (!selected || !recordSummary.trim()) return;
    const ok = await appendManualRecord(selected.id, recordSummary.trim());
    if (ok) {
      setRecordSummary("");
      await load();
    }
  }

  async function onAssociateJob() {
    if (!selected || !associateJobId) return;
    const ok = await patchConversation(selected, { job_id: associateJobId });
    if (ok) {
      setAssociateJobId("");
      await load();
    }
  }

  async function onCreateManual() {
    if (!manual.summary.trim()) return;
    const channel = manualChannel === "other" ? manualOtherChannel.trim() || "other" : manualChannel;
    await createManualConversation(manual, channel);
    setManual(EMPTY_MANUAL);
    setManualOpen(false);
    setView(manual.needs_action ? "pending" : "retained");
    await load();
  }

  const empty = view === "pending"
    ? { title: COMMUNICATION_COPY.pendingEmptyTitle, body: COMMUNICATION_COPY.pendingEmpty }
    : { title: COMMUNICATION_COPY.retainedEmptyTitle, body: COMMUNICATION_COPY.retainedEmpty };

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <CommunicationHeader
        syncMessage={syncMessage}
        settingsOpen={settingsOpen}
        onRefresh={() => void load()}
        onToggleSettings={() => setSettingsOpen((value) => !value)}
        onManual={() => setManualOpen(true)}
      />
      {settingsOpen ? (
        <div className="mb-5">
          <CommunicationSettings
            market={market}
            source={source}
            retentionMode={retentionMode}
            filterSettings={filterSettings}
            gmailReady={gmailReady}
            gmailConnected={gmailConnected}
            syncing={syncing}
            platforms={platforms}
            browserMessage={browserMessage}
            captureDraft={captureDraft}
            onMarket={setMarket}
            onSource={setSource}
            onRetention={setRetentionMode}
            onFilter={setFilterSettings}
            onSave={() => void saveSettings()}
            onConnectGmail={() => void onConnectGmail()}
            onSyncGmail={() => void onSyncGmail()}
            onDisconnectGmail={() => void onDisconnectGmail()}
            onCapture={(platform) => void onCapturePlatform(platform)}
            onSaveCapture={() => void onSaveCapture()}
            onDiscardCapture={() => setCaptureDraft(null)}
          />
        </div>
      ) : null}
      {manualOpen ? (
        <div className="mb-5">
          <ManualRecordPanel
            manual={manual}
            manualChannel={manualChannel}
            manualOtherChannel={manualOtherChannel}
            newJobOpen={newJobOpen}
            newJob={newJob}
            jobOptions={jobOptions}
            onManual={setManual}
            onChannel={setManualChannel}
            onOtherChannel={setManualOtherChannel}
            onToggleNewJob={() => setNewJobOpen((value) => !value)}
            onNewJob={setNewJob}
            onLoadJobs={() => void onLoadJobs()}
            onCreateJob={() => void onCreateJob()}
            onSave={() => void onCreateManual()}
            onCancel={() => setManualOpen(false)}
          />
        </div>
      ) : null}
      <div className="space-y-4">
        <CommunicationFilters
          query={query}
          source={source}
          market={market}
          onQuery={setQuery}
          onSource={setSource}
          onMarket={setMarket}
        />
        <CommunicationTabs view={view} onView={setView} />
        {!loading && items.length === 0 ? (
          <EmptyState
            title={empty.title}
            action={
              <Button type="button" variant="dark" onClick={() => setManualOpen(true)}>
                {COMMUNICATION_COPY.manualRecord}
              </Button>
            }
          >
            {empty.body}
          </EmptyState>
        ) : (
          <div className="grid min-h-[32rem] overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-[minmax(220px,32%)_1fr]">
            <section className="border-b border-line md:border-b-0 md:border-r md:border-line">
              <ConversationList
                items={items}
                selectedId={selected?.id ?? null}
                loading={loading}
                onSelect={setSelected}
              />
            </section>
            <section className="p-5">
              <ConversationDetail
                selected={selected}
                taskTitle={taskTitle}
                recordSummary={recordSummary}
                associateJobId={associateJobId}
                jobOptions={jobOptions}
                undoToken={undoToken}
                onTaskTitle={setTaskTitle}
                onRecordSummary={setRecordSummary}
                onAssociateJobId={setAssociateJobId}
                onLoadJobs={() => void onLoadJobs()}
                onCreateTask={() => void onCreateTask()}
                onAppendRecord={() => void onAppendRecord()}
                onAssociateJob={() => void onAssociateJob()}
                onNewJob={() => {
                  setManualOpen(true);
                  setNewJobOpen(true);
                }}
                onAction={(actionName) => void action(actionName)}
                onUndo={() => void undo()}
              />
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
