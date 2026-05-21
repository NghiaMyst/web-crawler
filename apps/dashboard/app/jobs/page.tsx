import type { Metadata } from 'next';
import { fetchJobs, fetchSources } from '@/lib/api.server';
import { JobsClient } from '@/components/jobs/JobsClient';
import type { JobStatus } from '@/types/api';

export const metadata: Metadata = { title: 'Jobs — Web Crawler' };
export const dynamic = 'force-dynamic';

const VALID_STATUSES: JobStatus[] = ['pending', 'running', 'done', 'failed', 'skipped'];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<React.JSX.Element> {
  const { status } = await searchParams;
  const activeStatus: JobStatus | undefined = VALID_STATUSES.includes(status as JobStatus)
    ? (status as JobStatus)
    : undefined;

  const [jobs, sources] = await Promise.all([fetchJobs(activeStatus), fetchSources()]);

  const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s.displayName]));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Jobs</h1>
      <JobsClient initialJobs={jobs} sourceMap={sourceMap} activeStatus={activeStatus} />
    </div>
  );
}
