"use client";

import type { CollectToastContent } from "@/lib/collectCopy";

export function CollectToast({ title, lines }: CollectToastContent) {
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-50 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-line bg-ink px-4 py-2.5 text-white shadow-lift"
    >
      <p className="text-sm font-medium">{title}</p>
      {lines.map((line) => (
        <p key={line} className="mt-0.5 text-xs leading-snug text-white/80">
          {line}
        </p>
      ))}
    </div>
  );
}
