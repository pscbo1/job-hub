"use client";

import { Button } from "@/components/ui/button";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { COMMUNICATION_COPY, type CommunicationView, type Conversation } from "./types";

export function CommunicationList({
  items,
  selectedId,
  loading,
  view,
  onSelect,
  onManualRecord,
}: {
  items: Conversation[];
  selectedId: string | null;
  loading: boolean;
  view: CommunicationView;
  onSelect: (item: Conversation) => void;
  onManualRecord: () => void;
}) {
  if (loading) {
    return <p className="p-5 text-sm text-muted">Loading...</p>;
  }

  if (items.length === 0) {
    const title =
      view === "pending" ? COMMUNICATION_COPY.emptyPendingTitle : COMMUNICATION_COPY.emptySavedTitle;
    const body =
      view === "pending" ? COMMUNICATION_COPY.emptyPendingBody : COMMUNICATION_COPY.emptySavedBody;
    return (
      <div className="grid min-h-[16rem] place-items-center p-5">
        <Card className="max-w-xs space-y-1 text-center shadow-none">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardSub>{body}</CardSub>
          <Button type="button" variant="dark" size="sm" className="mt-3" onClick={onManualRecord}>
            {COMMUNICATION_COPY.manualRecord}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className={cn(
            "block w-full border-b border-line p-4 text-left",
            selectedId === item.id ? "bg-brand/10" : "hover:bg-ink/[0.03]",
          )}
        >
          <p className="font-medium text-ink">{item.company || "Unknown company"}</p>
          <p className="text-sm text-muted">{item.role || "Conversation"}</p>
          <p className="mt-2 line-clamp-2 text-xs text-muted">{item.messages[0]?.summary}</p>
          <span className="mt-2 inline-block rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">
            {item.source}
          </span>
        </button>
      ))}
    </>
  );
}
