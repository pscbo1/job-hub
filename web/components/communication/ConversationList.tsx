import { cn } from "@/lib/utils";

import type { Conversation } from "./types";

export function ConversationList({
  items,
  selectedId,
  loading,
  onSelect,
}: {
  items: Conversation[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (item: Conversation) => void;
}) {
  if (loading) {
    return <p className="p-5 text-sm text-muted">Loading...</p>;
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
