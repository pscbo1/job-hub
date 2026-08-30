"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { jobsPoolHref } from "@/lib/discoveredRange";
import { MARKETS, MARKET_ORDER, searchPath, type MarketId } from "@/lib/markets";
import { readPoolPrefs, writeLastMarket } from "@/lib/marketPrefs";
import { cn } from "@/lib/utils";

export function MarketSwitch({
  current,
  page,
}: {
  current: MarketId;
  page: "jobs" | "search";
}) {
  const [hrefs, setHrefs] = useState<Record<MarketId, string>>({
    cn: page === "search" ? searchPath("cn") : jobsPoolHref({ market: "cn", range: "7d" }),
    en: page === "search" ? searchPath("en") : jobsPoolHref({ market: "en", range: "7d" }),
  });

  useEffect(() => {
    writeLastMarket(current);
    const next = { ...hrefs };
    for (const id of MARKET_ORDER) {
      if (page === "search") {
        next[id] = searchPath(id);
      } else {
        const prefs = readPoolPrefs(id);
        next[id] = jobsPoolHref({
          market: id,
          range: "7d",
          country: prefs.country,
          remote: prefs.remote,
          postedDays: prefs.postedDays,
          sources: prefs.sources,
        });
      }
    }
    setHrefs(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, page]);

  return (
    <div
      role="tablist"
      aria-label="Market"
      className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm"
    >
      {MARKET_ORDER.map((id) => {
        const active = id === current;
        return (
          <Link
            key={id}
            href={hrefs[id]}
            role="tab"
            aria-selected={active}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              active ? "bg-ink text-white" : "text-muted hover:text-ink",
            )}
          >
            {MARKETS[id].label}
          </Link>
        );
      })}
    </div>
  );
}
