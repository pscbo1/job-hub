"use client";

import { useEffect, useRef, useState } from "react";

import {
  SOURCE_GROUP_LABELS,
  bucketCollectSources,
  groupCheckState,
  toggleGroupSelection,
  toggleSourceSelection,
  type SourceGroupId,
} from "@/lib/collectSourceGroups";
import type { CollectSource } from "@/lib/api";
import { cn } from "@/lib/utils";

export function CollectSourceGroups({
  catalog,
  selected,
  onChange,
}: {
  catalog: CollectSource[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const buckets = bucketCollectSources(catalog);
  const [open, setOpen] = useState<Partial<Record<SourceGroupId, boolean>>>({});

  return (
    <div className="flex flex-col gap-1.5">
      {buckets.map((bucket) => {
        const ids = bucket.sources.map((s) => s.id);
        const state = groupCheckState(ids, selected);
        const n = ids.filter((id) => selected.has(id)).length;
        const expanded = Boolean(open[bucket.id]);
        return (
          <div key={bucket.id} className="rounded-lg border border-line">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <IndeterminateCheckbox
                checked={state === "all"}
                indeterminate={state === "partial"}
                aria-label={`${SOURCE_GROUP_LABELS[bucket.id]}, ${n} of ${ids.length} selected`}
                onChange={() => onChange(toggleGroupSelection(ids, selected))}
              />
              <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                {bucket.label}
              </span>
              <span className="shrink-0 tabular-nums text-[11px] text-muted">
                {n}/{ids.length}
              </span>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen((prev) => ({ ...prev, [bucket.id]: !expanded }))}
                className="shrink-0 text-[11px] font-medium text-brand hover:underline"
              >
                {expanded ? "Hide" : "Customize"}
              </button>
            </div>
            {expanded ? (
              <div className="space-y-1 border-t border-line px-2.5 py-2">
                {bucket.sources.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm text-ink"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selected.has(s.id)}
                      onChange={() => onChange(toggleSourceSelection(s.id, selected))}
                    />
                    <span>
                      <span className="font-medium">{s.label}</span>
                      {s.notes ? (
                        <span className="block text-[11px] text-muted">{s.notes}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  "aria-label": string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn("mt-0.5")}
      checked={checked}
      aria-label={ariaLabel}
      onChange={onChange}
    />
  );
}
