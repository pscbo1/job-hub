import { JobsExplorer } from "@/components/JobsExplorer";
import { getJobs } from "@/lib/api";
import { type PoolView, resolveDiscoveredFilter } from "@/lib/discoveredRange";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ since?: string; range?: string; pool?: string }>;
}) {
  const params = await searchParams;
  const filter = resolveDiscoveredFilter({
    range: params.range,
    since: params.since,
  });
  const pool: PoolView = params.pool === "excluded" ? "excluded" : "included";
  const [jobs, otherPool] = await Promise.all([
    getJobs(200, filter.since, pool),
    getJobs(200, filter.since, pool === "excluded" ? "included" : "excluded"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-5 py-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Job Pool</h1>
        <p className="mt-1 text-sm text-muted">
          Normalized jobs from collectors. Filter by discovered date and set status.
        </p>
      </div>

      <JobsExplorer
        jobs={jobs}
        range={filter.range}
        customSince={filter.customSince}
        pool={pool}
        otherCount={otherPool.length}
      />
    </div>
  );
}
