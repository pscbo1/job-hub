"use client";

import { EllipsisVertical } from "lucide-react";

import { SourceActionLink } from "@/components/SourceActionLink";
import { PopoverMenu, PopoverMenuItem } from "@/components/ui/popover-menu";
import { APPLICATION_ROW_MORE_LABEL } from "@/lib/applicationUi";
import { applicationWasSubmitted } from "@/lib/applicationLifecycle";
import type { Application } from "@/lib/api";

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
  const source = (
    <SourceActionLink apply_url={app.apply_url} url={app.url} job_url={app.job_url} className="whitespace-nowrap" />
  );

  return (
    <div
      className="flex flex-nowrap items-center justify-end gap-2"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {draft && <span className="hidden sm:inline-flex min-w-0">{source}</span>}
      {draft && (
        <button
          type="button"
          onClick={() => onSubmit(app.id)}
          className="shrink-0 whitespace-nowrap text-xs font-medium text-ink hover:underline"
        >
          Mark submitted
        </button>
      )}
      <PopoverMenu
        align="end"
        ariaLabel={APPLICATION_ROW_MORE_LABEL}
        title={APPLICATION_ROW_MORE_LABEL}
        triggerClassName="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        trigger={<EllipsisVertical className="h-4 w-4" aria-hidden="true" />}
      >
        {({ close }) => (
          <>
            {draft ? <div className="px-3 py-2 sm:hidden">{source}</div> : <div className="px-3 py-2">{source}</div>}
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
