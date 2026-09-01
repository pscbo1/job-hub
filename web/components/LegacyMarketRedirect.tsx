"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { jobsPoolHref } from "@/lib/discoveredRange";
import { searchPath, type MarketId } from "@/lib/markets";
import { readLastMarket, readPoolPrefs } from "@/lib/marketPrefs";

export function LegacyMarketRedirect({ page }: { page: "jobs" | "search" | "my-jobs" }) {
  const router = useRouter();

  useEffect(() => {
    const market: MarketId = readLastMarket();
    if (page === "search") {
      router.replace(searchPath(market));
      return;
    }
    if (page === "my-jobs") {
      router.replace("/tasks");
      return;
    }
    const prefs = readPoolPrefs(market);
    const params = new URLSearchParams(window.location.search);
    router.replace(
      jobsPoolHref({
        market,
        range: (params.get("range") as "7d" | "30d" | "90d" | "all" | "custom") || "7d",
        customSince: params.get("since") ?? "",
        pool: params.get("pool") === "excluded" ? "excluded" : "included",
        country: prefs.country,
        remote: prefs.remote,
        postedDays: prefs.postedDays,
        sources: prefs.sources,
      }),
    );
  }, [page, router]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 text-sm text-muted">
      Opening {page === "search" ? "Collect Jobs" : page === "my-jobs" ? "Tasks" : "Discover"}…
    </div>
  );
}
