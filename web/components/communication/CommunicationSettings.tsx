"use client";

import { ExternalLink, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { COMMUNICATION_COPY, type CaptureDraft, type FilterSettings, type Platform } from "./types";

export function CommunicationSettings({
  market,
  source,
  retentionMode,
  filterSettings,
  gmailReady,
  gmailConnected,
  syncing,
  syncMessage,
  platforms,
  browserMessage,
  captureDraft,
  onMarketChange,
  onSourceChange,
  onRetentionChange,
  onFilterChange,
  onSave,
  onConnectGmail,
  onSyncGmail,
  onDisconnectGmail,
  onCapturePlatform,
  onSaveCapture,
  onDiscardCapture,
}: {
  market: string;
  source: string;
  retentionMode: string;
  filterSettings: FilterSettings;
  gmailReady: boolean;
  gmailConnected: boolean;
  syncing: boolean;
  syncMessage: string | null;
  platforms: Platform[];
  browserMessage: string | null;
  captureDraft: CaptureDraft | null;
  onMarketChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onRetentionChange: (value: string) => void;
  onFilterChange: (next: FilterSettings) => void;
  onSave: () => void;
  onConnectGmail: () => void;
  onSyncGmail: () => void;
  onDisconnectGmail: () => void;
  onCapturePlatform: (platform: Platform) => void;
  onSaveCapture: () => void;
  onDiscardCapture: () => void;
}) {
  const gmailLabel = gmailConnected ? "connected" : gmailReady ? "ready" : "not configured";
  const connectVisible = gmailReady && !gmailConnected;
  const saveVariant = captureDraft || connectVisible ? "outline" : "default";

  return (
    <Card id="communication-settings" className="space-y-6 rounded-lg p-4 shadow-none">
      <div>
        <h2 className="text-sm font-medium text-ink">Communication settings</h2>
        <p className="mt-1 text-xs text-muted">
          Gmail, platform capture, and filter rules stay here so the inbox stays focused on Keep and
          Archive.
        </p>
      </div>

      <section className="space-y-3 border-t border-line pt-4">
        <h3 className="text-sm font-medium text-ink">Gmail</h3>
        <p className="text-xs text-muted">Gmail {gmailLabel}</p>
        {syncMessage ? <p className="text-xs text-muted">{syncMessage}</p> : null}
        <div className="flex flex-wrap gap-2">
          {connectVisible ? (
            <Button type="button" variant={captureDraft ? "outline" : "default"} onClick={onConnectGmail}>
              Connect Gmail
            </Button>
          ) : null}
          {gmailConnected ? (
            <Button type="button" variant="outline" size="sm" disabled={syncing} onClick={onSyncGmail}>
              {syncing ? "Syncing..." : "Sync Gmail"}
            </Button>
          ) : null}
          {gmailConnected ? (
            <Button type="button" variant="ghost" size="sm" onClick={onDisconnectGmail}>
              Disconnect Gmail
            </Button>
          ) : null}
        </div>
      </section>

      {platforms.length ? (
        <section className="space-y-3 border-t border-line pt-4">
          <h3 className="text-sm font-medium text-ink">Domestic platforms</h3>
          <div className="flex flex-wrap items-center gap-2">
            {platforms.map((platform) => (
              <span key={platform.id} className="inline-flex items-center gap-1.5">
                {platform.mode === "manual_only" ? (
                  <span className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink">
                    {platform.label}
                  </span>
                ) : (
                  <a
                    href={platform.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {platform.label}
                  </a>
                )}
                {platform.mode !== "manual_only" ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => onCapturePlatform(platform)}>
                    Read page
                  </Button>
                ) : null}
              </span>
            ))}
          </div>
          {browserMessage ? <p className="text-xs text-muted">{browserMessage}</p> : null}
          {captureDraft ? (
            <div className="rounded-lg border border-line bg-bg p-3">
              <p className="text-sm font-medium text-ink">Capture preview ({captureDraft.entries.length})</p>
              <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                {captureDraft.entries.map((entry) => (
                  <div key={`${entry.date}-${entry.label}`} className="border-b border-line pb-2 text-xs">
                    <p className="font-medium text-ink">
                      {entry.label} <span className="font-normal text-muted">{entry.date}</span>
                    </p>
                    <p className="text-muted">{entry.preview}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button type="button" size="sm" onClick={onSaveCapture}>
                  Save captures
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onDiscardCapture}>
                  Discard
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-2 border-t border-line pt-4">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
          <Info className="h-4 w-4 text-muted" aria-hidden="true" />
          {COMMUNICATION_COPY.rules}
        </h3>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          <li>Unread job-related email only.</li>
          <li>Receipts, template rejections, newsletters, and security mail are excluded.</li>
          <li>Interview, assessment, materials, intent, new role, and useful application updates are kept.</li>
          <li>Suspicious messages are quarantined and never deleted from Gmail.</li>
        </ul>
      </section>

      <section className="space-y-3 border-t border-line pt-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-muted">
            Default market
            <Select className="mt-1" value={market} onChange={(event) => onMarketChange(event.target.value)}>
              <option value="all">All</option>
              <option value="cn">CN</option>
              <option value="en">EN</option>
              <option value="unclassified">Unclassified</option>
            </Select>
          </label>
          <label className="text-sm text-muted">
            Retention
            <Select
              className="mt-1"
              value={retentionMode}
              onChange={(event) => onRetentionChange(event.target.value)}
            >
              <option value="14_days">14 days</option>
              <option value="30_days">30 days</option>
              <option value="manual">Manual</option>
            </Select>
          </label>
          <label className="text-sm text-muted">
            Default sources
            <Input className="mt-1" value={source} onChange={(event) => onSourceChange(event.target.value)} />
          </label>
          <label className="text-sm text-muted">
            Keep words
            <Input
              className="mt-1"
              placeholder="comma separated"
              value={filterSettings.keep_words}
              onChange={(event) => onFilterChange({ ...filterSettings, keep_words: event.target.value })}
            />
          </label>
          <label className="text-sm text-muted">
            Skip words
            <Input
              className="mt-1"
              placeholder="comma separated"
              value={filterSettings.skip_words}
              onChange={(event) => onFilterChange({ ...filterSettings, skip_words: event.target.value })}
            />
          </label>
          <label className="text-sm text-muted">
            Stale days
            <Input
              type="number"
              min={1}
              max={3650}
              className="mt-1"
              value={filterSettings.stale_days}
              onChange={(event) => onFilterChange({ ...filterSettings, stale_days: event.target.value })}
            />
          </label>
          <label className="text-sm text-muted">
            Skip companies
            <Input
              className="mt-1"
              placeholder="comma separated"
              value={filterSettings.skip_companies}
              onChange={(event) => onFilterChange({ ...filterSettings, skip_companies: event.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={filterSettings.label_linkedin_noise === "true"}
              onChange={(event) =>
                onFilterChange({ ...filterSettings, label_linkedin_noise: String(event.target.checked) })
              }
            />
            Hide LinkedIn data-labeling noise
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={filterSettings.hide_gig_noise === "true"}
              onChange={(event) =>
                onFilterChange({ ...filterSettings, hide_gig_noise: String(event.target.checked) })
              }
            />
            Hide intern / gig noise
          </label>
        </div>
        <Button type="button" variant={saveVariant} onClick={onSave}>
          Save settings
        </Button>
      </section>
    </Card>
  );
}
