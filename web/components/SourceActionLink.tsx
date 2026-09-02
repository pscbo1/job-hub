"use client";

import { ASSIST_BTN_PRIMARY, ASSIST_COPY, ASSIST_NO_APPLY_URL } from "@/lib/applicationUi";
import { sourceAction } from "@/lib/sourceAction";
import { cn } from "@/lib/utils";

export function SourceActionLink({
  apply_url,
  url,
  job_url,
  className,
  variant = "link",
}: {
  apply_url?: string | null;
  url?: string | null;
  job_url?: string | null;
  className?: string;
  variant?: "link" | "primary";
}) {
  const action = sourceAction({ apply_url, url, job_url });
  if (action.kind === "missing") {
    if (variant === "primary") {
      return <p className={cn("text-sm text-muted", className)}>{ASSIST_NO_APPLY_URL}</p>;
    }
    return <span className={cn("text-xs text-muted", className)}>{action.label}</span>;
  }
  if (variant === "primary") {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(ASSIST_BTN_PRIMARY, className)}
      >
        {ASSIST_COPY.openApply}
      </a>
    );
  }
  return (
    <a
      href={action.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("text-xs font-medium text-ink hover:underline", className)}
    >
      {action.label}
    </a>
  );
}
