import { notFound } from "next/navigation";

import { JobsExplorer } from "@/components/JobsExplorer";
import { MarketSwitch } from "@/components/MarketSwitch";
import { getCollectSources, getJobs } from "@/lib/api";
import {
  parseCountryParam,
  parsePostedParam,
  parseRemoteParam,
  parseSourcesParam,
  type PoolView,
  resolveDiscoveredFilter,
} from "@/lib/discoveredRange";
import { MARKET_ORDER, parseMarketId, type MarketId } from "@/lib/markets";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return MARKET_ORDER.map((market) => ({ market }));
}

export default async function MarketJobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<{
    since?: string;
    range?: string;
    pool?: string;
    country?: string;
    remote?: string;
    posted?: string;
    sources?: string;
  }>;
}) {
  const { market: raw } = await params;
  const market = parseMarketId(raw);
  if (!market) notFound();
  const q = await searchParams;
  const filter = resolveDiscoveredFilter({
    range: q.range,
    since: q.since,
  });
  const pool: PoolView = q.pool === "excluded" ? "excluded" : "included";
  const country = parseCountryParam(q.country);
  const remote = parseRemoteParam(q.remote);
  const postedDays = parsePostedParam(q.posted);
  const sources = parseSourcesParam(q.sources);
  const listQuery = {
    market,
    country: country || undefined,
    sources: sources.length ? sources : undefined,
    remote: remote || undefined,
    postedDays: postedDays || undefined,
  };
  const [jobs, otherPool, catalog] = await Promise.all([
    getJobs(200, filter.since, pool, listQuery),
    getJobs(200, filter.since, pool === "excluded" ? "included" : "excluded", listQuery),
    getCollectSources(market),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-5 py-12">
      <div className="space-y-3">
        <MarketSwitch current={market} page="jobs" />
        <h1 className="text-3xl font-bold tracking-tight text-ink">Discover</h1>
        <p className="mt-1 text-sm text-muted">
          {marketLabel(market)} jobs from collectors. Save, mark Reference, or start an application.
          New jobs have no tracking until you act.
        </p>
      </div>

      <JobsExplorer
        jobs={jobs}
        range={filter.range}
        customSince={filter.customSince}
        pool={pool}
        otherCount={otherPool.length}
        market={market}
        country={country}
        remote={remote}
        postedDays={postedDays}
        sources={sources}
        catalogSources={(catalog?.sources ?? []).map((s) => ({ id: s.id, label: s.label }))}
      />
    </div>
  );
}

function marketLabel(market: MarketId): string {
  return market === "cn" ? "CN Market" : "EN Market";
}
