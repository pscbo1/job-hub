"use client";

import { useEffect, useState } from "react";

import { leftoverJobContact } from "@/lib/api";
import { hasJobContact } from "@/lib/jobContact";

export function JobContact({
  jobId,
  contact: initial = "",
}: {
  jobId: string;
  contact?: string;
}) {
  const [text, setText] = useState(() => leftoverJobContact(jobId, initial));

  useEffect(() => {
    setText(leftoverJobContact(jobId, initial));
  }, [jobId, initial]);

  if (!hasJobContact(text)) return null;
  return (
    <details className="border-t border-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-xs font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        Contact
        <span aria-hidden="true" className="ml-auto">
          ▾
        </span>
      </summary>
      <div className="space-y-1 pb-2">
        <p className="text-xs text-muted">
          Kept after a cancelled draft. Select the text to copy. This is not a contacts list.
        </p>
        <p className="select-text whitespace-pre-wrap rounded-lg bg-bg px-2 py-1 text-sm text-ink">
          {text.trim()}
        </p>
      </div>
    </details>
  );
}
