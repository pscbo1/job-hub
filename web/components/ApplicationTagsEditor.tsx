"use client";

import { useState } from "react";

import {
  MAX_APPLICATION_TAGS,
  MAX_TAG_LENGTH,
  normalizeApplicationTags,
  suggestApplicationTags,
} from "@/lib/applicationTags";

export function ApplicationTagsEditor({
  tags,
  knownTags,
  onChange,
}: {
  tags: string[];
  knownTags: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const suggestions = suggestApplicationTags(tags, knownTags);

  function add(raw: string) {
    const next = normalizeApplicationTags([...tags, raw], knownTags);
    if (next.length === tags.length && next.every((tag, i) => tag === tags[i])) return;
    onChange(next);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2 py-0.5 text-xs text-ink"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((item) => item !== tag))}
                className="text-muted hover:text-ink"
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {tags.length < MAX_APPLICATION_TAGS && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_TAG_LENGTH))}
            maxLength={MAX_TAG_LENGTH}
            aria-label="Add tag"
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 text-sm"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="h-8 rounded-lg border border-line px-2 text-xs font-medium text-ink disabled:opacity-40"
          >
            Add
          </button>
        </form>
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-muted hover:border-ink/40 hover:text-ink"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
