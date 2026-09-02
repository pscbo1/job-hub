"use client";

import { sourceAction } from "@/lib/sourceAction";
import { cn } from "@/lib/utils";

export function SourceActionLink({
  apply_url,
  url,
  job_url,
  className,
}: {
  apply_url?: string | null;
  url?: string | null;
  job_url?: string | null;
  className?: string;
}) {
  const action = sourceAction({ apply_url, url, job_url });
  if (action.kind === "missing") {
    return <span className={cn("text-xs text-muted", className)}>{action.label}</span>;
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
