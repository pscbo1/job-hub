"use client";

import { Input } from "@/components/ui/input";
import { PopoverSelect } from "@/components/ui/popover-select";
import { cn } from "@/lib/utils";

import { COMMUNICATION_COPY, SOURCE_OPTIONS, type CommunicationView } from "./types";

export function CommunicationFilters({
  query,
  source,
  market,
  onQueryChange,
  onSourceToggle,
  onMarketChange,
}: {
  query: string;
  source: string;
  market: string;
  onQueryChange: (value: string) => void;
  onSourceToggle: (id: string, checked: boolean) => void;
  onMarketChange: (value: string) => void;
}) {
  const selected = source.split(",").filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-[16rem] flex-1">
        <Input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search company or role"
          aria-label="Search company or role"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {SOURCE_OPTIONS.map((option) => (
          <label key={option.id} className="inline-flex items-center gap-1.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={(event) => onSourceToggle(option.id, event.target.checked)}
            />
            {option.label}
          </label>
        ))}
      </div>
      <PopoverSelect
        value={market}
        onChange={onMarketChange}
        aria-label="Market"
        className="h-10 w-36"
        options={[
          { value: "all", label: "All" },
          { value: "cn", label: "CN" },
          { value: "en", label: "EN" },
          { value: "unclassified", label: "Unclassified" },
        ]}
      />
    </div>
  );
}

export function CommunicationTabs({
  view,
  onChange,
}: {
  view: CommunicationView;
  onChange: (view: CommunicationView) => void;
}) {
  return (
    <div className="flex gap-6 border-b border-line" role="tablist" aria-label="Conversation lists">
      <button
        type="button"
        role="tab"
        aria-selected={view === "pending"}
        title={COMMUNICATION_COPY.needsActionHint}
        className={cn(
          "border-b-2 px-1 pb-2 text-sm",
          view === "pending" ? "border-brand font-medium text-ink" : "border-transparent text-muted",
        )}
        onClick={() => onChange("pending")}
      >
        {COMMUNICATION_COPY.needsAction}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "retained"}
        title={COMMUNICATION_COPY.savedHint}
        className={cn(
          "border-b-2 px-1 pb-2 text-sm",
          view === "retained" ? "border-brand font-medium text-ink" : "border-transparent text-muted",
        )}
        onClick={() => onChange("retained")}
      >
        {COMMUNICATION_COPY.savedConversations}
      </button>
    </div>
  );
}
