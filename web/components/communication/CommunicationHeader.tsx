"use client";

import { RefreshCw, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";

import { COMMUNICATION_COPY } from "./types";

export function CommunicationHeader({
  onManualRecord,
  onRefresh,
  onToggleSettings,
  settingsOpen,
}: {
  onManualRecord: () => void;
  onRefresh: () => void;
  onToggleSettings: () => void;
  settingsOpen: boolean;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{COMMUNICATION_COPY.title}</h1>
        <p className="mt-1 text-sm text-muted">{COMMUNICATION_COPY.subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="dark" onClick={onManualRecord}>
          {COMMUNICATION_COPY.manualRecord}
        </Button>
        <Button type="button" variant="ghost" onClick={onRefresh} aria-label={COMMUNICATION_COPY.refresh}>
          <RefreshCw className="h-4 w-4" />
          {COMMUNICATION_COPY.refresh}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onToggleSettings}
          aria-expanded={settingsOpen}
          aria-controls="communication-settings"
        >
          <Settings className="h-4 w-4" />
          {COMMUNICATION_COPY.settings}
        </Button>
      </div>
    </header>
  );
}
