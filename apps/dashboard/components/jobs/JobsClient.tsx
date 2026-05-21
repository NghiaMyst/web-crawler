'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { JobsTable } from './JobsTable';
import { JobsEmptyState } from './JobsEmptyState';
import { retryJobAction } from '@/actions/job.actions';
import type { CrawlJob, JobStatus } from '@/types/api';

const STATUS_TABS: { label: string; value: JobStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Running', value: 'running' },
  { label: 'Done', value: 'done' },
  { label: 'Failed', value: 'failed' },
  { label: 'Skipped', value: 'skipped' },
];

export function JobsClient({
  initialJobs,
  sourceMap,
  activeStatus,
}: {
  initialJobs: CrawlJob[];
  sourceMap: Record<string, string>;
  activeStatus: JobStatus | undefined;
}): React.JSX.Element {
  const router = useRouter();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [router]);

  function handleStatusChange(value: JobStatus | 'all'): void {
    if (value === 'all') {
      router.push('/jobs');
    } else {
      router.push(`/jobs?status=${value}`);
    }
  }

  function handleRetry(id: string): void {
    setRetryingId(id);
    setErrorMsg(null);
    startTransition(async () => {
      const result = await retryJobAction(id);
      if (!result.ok) {
        setErrorMsg(result.error);
      }
      setRetryingId(null);
    });
  }

  const activeTab = activeStatus ?? 'all';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
          {STATUS_TABS.map(({ label, value }) => (
            <Button
              key={value}
              variant={activeTab === value ? 'default' : 'outline'}
              size="sm"
              role="tab"
              aria-selected={activeTab === value}
              onClick={() => handleStatusChange(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <span className="text-sm text-zinc-500">
          {initialJobs.length} job{initialJobs.length === 1 ? '' : 's'}
          {' · '}auto-refreshes every 30s
        </span>
      </div>

      {initialJobs.length === 0 ? (
        <JobsEmptyState />
      ) : (
        <JobsTable
          jobs={initialJobs}
          sourceMap={sourceMap}
          retryingId={retryingId}
          onRetry={handleRetry}
        />
      )}

      {errorMsg && (
        <div
          className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-md shadow-lg"
          role="alert"
        >
          {errorMsg}
          <button
            onClick={() => setErrorMsg(null)}
            className="ml-3 font-semibold"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
