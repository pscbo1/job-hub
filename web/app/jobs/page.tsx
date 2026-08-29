import { JobsExplorer } from "@/components/JobsExplorer";
import { getJobs } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ since?: string }>;
}) {
  const params = await searchParams;
  const since = params.since?.trim() ?? "";
  const jobs = await getJobs(200, since || undefined);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-5 py-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Job Pool</h1>
        <p className="mt-1 text-sm text-muted">
          Normalized jobs from collectors. Filter by discovered date and set status.
        </p>
      </div>

      <JobsExplorer jobs={jobs} since={since} />
    </div>
  );
}
