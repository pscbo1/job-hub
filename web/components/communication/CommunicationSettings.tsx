import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import type { CaptureDraft, FilterSettings, Platform } from "./types";

export function CommunicationSettings({
  market,
  source,
  retentionMode,
  filterSettings,
  gmailReady,
  gmailConnected,
  syncing,
  platforms,
  browserMessage,
  captureDraft,
  onMarket,
  onSource,
  onRetention,
  onFilter,
  onSave,
  onConnectGmail,
  onSyncGmail,
  onDisconnectGmail,
  onCapture,
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
  platforms: Platform[];
  browserMessage: string | null;
  captureDraft: CaptureDraft | null;
  onMarket: (value: string) => void;
  onSource: (value: string) => void;
  onRetention: (value: string) => void;
  onFilter: (next: FilterSettings) => void;
  onSave: () => void;
  onConnectGmail: () => void;
  onSyncGmail: () => void;
  onDisconnectGmail: () => void;
  onCapture: (platform: Platform) => void;
  onSaveCapture: () => void;
  onDiscardCapture: () => void;
}) {
  return (
    <div className="space-y-5 rounded-lg border border-line bg-surface p-4">
      <div>
        <h2 className="text-sm font-medium text-ink">Connections</h2>
        <p className="mt-1 text-xs text-muted">
          Gmail {gmailConnected ? "connected" : gmailReady ? "ready" : "not configured"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {gmailReady && !gmailConnected ? (
            <Button type="button" onClick={onConnectGmail}>
              Connect Gmail
            </Button>
          ) : null}
          {gmailConnected ? (
            <>
              <Button type="button" variant="dark" disabled={syncing} onClick={onSyncGmail}>
                {syncing ? "Syncing..." : "Sync Gmail"}
              </Button>
              <Button type="button" variant="outline" onClick={onDisconnectGmail}>
                Disconnect Gmail
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {platforms.length ? (
        <div>
          <h2 className="text-sm font-medium text-ink">Domestic capture</h2>
          <p className="mt-1 text-xs text-muted">
            Open the platform, then read the page after you have logged in.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {platforms.map((platform) => (
              <span key={platform.id} className="inline-flex items-center gap-1.5">
                <a
                  href={platform.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {platform.label}
                </a>
                <Button type="button" variant="outline" size="sm" onClick={() => onCapture(platform)}>
                  Read page
                </Button>
              </span>
            ))}
          </div>
          {browserMessage ? <p className="mt-2 text-xs text-muted">{browserMessage}</p> : null}
          {captureDraft ? (
            <div className="mt-3 rounded-lg border border-line bg-bg p-3">
              <p className="text-sm font-medium text-ink">
                Capture preview ({captureDraft.entries.length})
              </p>
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
        </div>
      ) : null}

      <div>
        <h2 className="text-sm font-medium text-ink">Rules</h2>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">
          <li>Unread job-related email only.</li>
          <li>Receipts, template rejections, newsletters, and security mail are excluded.</li>
          <li>Interview, assessment, materials, intent, new role, and useful application updates are kept.</li>
          <li>Suspicious messages are quarantined and never deleted from Gmail.</li>
        </ul>
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink">Filters and retention</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-muted">
            Default market
            <Select className="mt-1" value={market} onChange={(event) => onMarket(event.target.value)}>
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
              onChange={(event) => onRetention(event.target.value)}
            >
              <option value="14_days">14 days</option>
              <option value="30_days">30 days</option>
              <option value="manual">Manual</option>
            </Select>
          </label>
          <label className="text-sm text-muted">
            Default sources
            <Input className="mt-1" value={source} onChange={(event) => onSource(event.target.value)} />
          </label>
          <label className="text-sm text-muted">
            Keep words
            <Input
              className="mt-1"
              placeholder="comma separated"
              value={filterSettings.keep_words}
              onChange={(event) => onFilter({ ...filterSettings, keep_words: event.target.value })}
            />
          </label>
          <label className="text-sm text-muted">
            Skip words
            <Input
              className="mt-1"
              placeholder="comma separated"
              value={filterSettings.skip_words}
              onChange={(event) => onFilter({ ...filterSettings, skip_words: event.target.value })}
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
              onChange={(event) => onFilter({ ...filterSettings, stale_days: event.target.value })}
            />
          </label>
          <label className="text-sm text-muted">
            Skip companies
            <Input
              className="mt-1"
              placeholder="comma separated"
              value={filterSettings.skip_companies}
              onChange={(event) => onFilter({ ...filterSettings, skip_companies: event.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={filterSettings.label_linkedin_noise === "true"}
              onChange={(event) =>
                onFilter({ ...filterSettings, label_linkedin_noise: String(event.target.checked) })
              }
            />
            Hide LinkedIn data-labeling noise
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={filterSettings.hide_gig_noise === "true"}
              onChange={(event) =>
                onFilter({ ...filterSettings, hide_gig_noise: String(event.target.checked) })
              }
            />
            Hide intern / gig noise
          </label>
        </div>
        <Button type="button" className="mt-3" onClick={onSave}>
          Save settings
        </Button>
      </div>
    </div>
  );
}
