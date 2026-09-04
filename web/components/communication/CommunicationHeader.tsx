import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

import { COMMUNICATION_COPY } from "./copy";

export function CommunicationHeader({
  settingsOpen,
  onToggleSettings,
  onManual,
}: {
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onManual: () => void;
}) {
  return (
    <PageHeader
      title={COMMUNICATION_COPY.title}
      subtitle={COMMUNICATION_COPY.subtitle}
      actions={
        <>
          <Button type="button" variant="dark" onClick={onManual}>
            {COMMUNICATION_COPY.manualRecord}
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
        </>
      }
    />
  );
}
