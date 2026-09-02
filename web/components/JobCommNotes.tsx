"use client";

import type { ApplicationCommNote } from "@/lib/api";
import { hasJobCommNotes } from "@/lib/commNotesUi";
import { formatDateTimeInAppTz } from "@/lib/timezone";

export function JobCommNotes({ notes }: { notes: ApplicationCommNote[] }) {
  if (!hasJobCommNotes(notes)) return null;
  return (
    <details className="border-t border-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-xs font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        Communication notes
        <span className="tabular-nums font-normal">{notes.length}</span>
        <span aria-hidden="true" className="ml-auto">
          ▾
        </span>
      </summary>
      <div className="space-y-2 pb-2">
        <p className="text-xs text-muted">
          Kept after a cancelled draft. Dates are when the note was written. This is not a timeline.
        </p>
        <ul className="space-y-1 text-sm">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-bg px-2 py-1">
              <span className="text-xs text-muted">{formatDateTimeInAppTz(note.created_at)} · </span>
              {note.body}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
