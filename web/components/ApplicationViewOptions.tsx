"use client";

import { PopoverMenu } from "@/components/ui/popover-menu";
import {
  APPLICATION_VIEW_OPTIONS_GROUPS,
  APPLICATION_VIEW_OPTIONS_LABEL,
} from "@/lib/applicationUi";
import type { IdleCleanupSettings } from "@/lib/api";
import { cn } from "@/lib/utils";

type BoardView = "open" | "closed";

export function ApplicationViewOptions({
  board,
  staleOnly,
  idle,
  idleLabel,
  onOpen,
  onClosed,
  onStale,
  onIdleChange,
}: {
  board: BoardView;
  staleOnly: boolean;
  idle: IdleCleanupSettings;
  idleLabel: string;
  onOpen: () => void;
  onClosed: () => void;
  onStale: () => void;
  onIdleChange: (next: IdleCleanupSettings) => void;
}) {
  return (
    <PopoverMenu
      align="start"
      role="dialog"
      minWidth={288}
      ariaLabel={APPLICATION_VIEW_OPTIONS_LABEL}
      title={APPLICATION_VIEW_OPTIONS_LABEL}
      triggerClassName="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-muted hover:border-ink/30 hover:text-ink"
      trigger={APPLICATION_VIEW_OPTIONS_LABEL}
    >
      {({ close }) => (
        <div className="w-72 space-y-3 px-3 py-2 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {APPLICATION_VIEW_OPTIONS_GROUPS.views}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onOpen();
                  close();
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  board === "open" && !staleOnly ? "border-ink bg-ink text-white" : "border-line text-muted",
                )}
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => {
                  onClosed();
                  close();
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  board === "closed" ? "border-ink bg-ink text-white" : "border-line text-muted",
                )}
              >
                Closed
              </button>
              <button
                type="button"
                onClick={() => {
                  onStale();
                  close();
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  staleOnly ? "border-amber-700 bg-amber-50 text-amber-900" : "border-line text-muted",
                )}
              >
                {idleLabel}
              </button>
            </div>
          </div>
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {APPLICATION_VIEW_OPTIONS_GROUPS.cleanup}
            </p>
            <label className="flex items-center gap-2 text-muted">
              <input
                type="checkbox"
                checked={idle.enabled}
                onChange={(e) => onIdleChange({ ...idle, enabled: e.target.checked })}
                className="h-4 w-4 rounded border-line"
              />
              Include Applied applications with no update
            </label>
            <label className="flex items-center gap-2 text-muted">
              After
              <input
                type="number"
                min={1}
                max={365}
                value={idle.idle_days}
                onChange={(e) =>
                  onIdleChange({
                    ...idle,
                    idle_days: Math.max(1, Math.min(365, Number(e.target.value) || 14)),
                  })
                }
                className="h-9 w-20 rounded-lg border border-line bg-bg px-2 text-sm text-ink"
              />
              days. Interview and Offer never appear here. Close selected is manual.
            </label>
          </div>
        </div>
      )}
    </PopoverMenu>
  );
}
