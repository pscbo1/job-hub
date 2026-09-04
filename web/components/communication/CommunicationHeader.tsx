import { RefreshCw, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";

import { COMMUNICATION_COPY } from "./copy";

export function CommunicationHeader({
  syncMessage,
  settingsOpen,
  onRefresh,
  onToggleSettings,
  onManual,
}: {
  syncMessage: string | null;
  settingsOpen: boolean;
  onRefresh: () => void;
  onToggleSettings: () => void;
  onManual: () => void;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{COMMUNICATION_COPY.title}</h1>
        <p className="mt-1 text-sm text-muted">{COMMUNICATION_COPY.subtitle}</p>
        {syncMessage ? <p className="mt-1 text-xs text-muted">{syncMessage}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="dark" onClick={onManual}>
          {COMMUNICATION_COPY.manualRecord}
        </Button>
        <Button type="button" variant="ghost" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
          {COMMUNICATION_COPY.refresh}
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={settingsOpen}
          onClick={onToggleSettings}
        >
          <Settings className="h-4 w-4" />
          {COMMUNICATION_COPY.settings}
        </Button>
      </div>
    </header>
  );
}
