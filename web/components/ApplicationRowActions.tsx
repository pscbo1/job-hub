"use client";

import { EllipsisVertical } from "lucide-react";

import { SourceActionLink } from "@/components/SourceActionLink";
import { PopoverMenu, PopoverMenuItem } from "@/components/ui/popover-menu";
import { applicationRowMoreLabel } from "@/lib/applicationUi";
import { applicationWasSubmitted } from "@/lib/applicationLifecycle";
import type { Application } from "@/lib/api";
import { cn } from "@/lib/utils";

import styles from "./ApplicationRowActions.module.css";

export function ApplicationRowActions({
  app,
  onSubmit,
  onCancelDraft,
}: {
  app: Application;
  onSubmit: (id: string) => void;
  onCancelDraft: (id: string) => void;
}) {
  const draft = app.stage === "draft";
  const moreLabel = applicationRowMoreLabel(app.title);
  const source = (
    <SourceActionLink apply_url={app.apply_url} url={app.url} job_url={app.job_url} className="whitespace-nowrap" />
  );

  return (
    <div
      className="flex flex-nowrap items-center justify-end gap-2"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className={cn("min-w-0", styles.wideOnly)}>{source}</span>
      {draft && (
        <button
          type="button"
          onClick={() => onSubmit(app.id)}
          className={cn(
            "shrink-0 whitespace-nowrap text-xs font-medium text-ink hover:underline",
            styles.wideOnly,
          )}
        >
          Mark submitted
        </button>
      )}
      <PopoverMenu
        align="end"
        ariaLabel={moreLabel}
        title={moreLabel}
        triggerClassName={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
          styles.trigger,
        )}
        trigger={<EllipsisVertical className="h-4 w-4" aria-hidden="true" />}
      >
        {({ close }) => (
          <>
            <div className={cn("px-3 py-2", styles.compactOnly)}>{source}</div>
            {draft && (
              <div className={styles.compactOnly}>
                <PopoverMenuItem
                  onClick={() => {
                    onSubmit(app.id);
                    close();
                  }}
                >
                  Mark submitted
                </PopoverMenuItem>
              </div>
            )}
            {app.stage !== "draft" && app.stage !== "closed" && (
              <PopoverMenuItem
                onClick={() => {
                  onSubmit(app.id);
                  close();
                }}
              >
                Record another submission
              </PopoverMenuItem>
            )}
            {app.stage === "closed" && (
              <PopoverMenuItem
                onClick={() => {
                  onSubmit(app.id);
                  close();
                }}
              >
                Reopen (mark submitted)
              </PopoverMenuItem>
            )}
            {!applicationWasSubmitted(app) && (
              <PopoverMenuItem
                danger
                onClick={() => {
                  close();
                  onCancelDraft(app.id);
                }}
              >
                Cancel draft
              </PopoverMenuItem>
            )}
          </>
        )}
      </PopoverMenu>
    </div>
  );
}
