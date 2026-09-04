import { cn } from "@/lib/utils";

import { COMMUNICATION_COPY } from "./copy";
import type { CommunicationView } from "./types";

export function CommunicationTabs({
  view,
  onView,
}: {
  view: CommunicationView;
  onView: (view: CommunicationView) => void;
}) {
  return (
    <div className="flex gap-6 border-b border-line">
      <button
        type="button"
        title="Messages that need your next action"
        className={cn(
          "border-b-2 px-1 pb-2 text-sm",
          view === "pending" ? "border-brand font-medium text-ink" : "border-transparent text-muted",
        )}
        onClick={() => onView("pending")}
      >
        {COMMUNICATION_COPY.pendingTab}
      </button>
      <button
        type="button"
        title="Messages you saved without a current action"
        className={cn(
          "border-b-2 px-1 pb-2 text-sm",
          view === "retained" ? "border-brand font-medium text-ink" : "border-transparent text-muted",
        )}
        onClick={() => onView("retained")}
      >
        {COMMUNICATION_COPY.retainedTab}
      </button>
    </div>
  );
}
