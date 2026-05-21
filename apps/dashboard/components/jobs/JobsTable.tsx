'use client';

import { Loader2, RotateCcw } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CrawlJob, JobStatus } from '@/types/api';

const STATUS_STYLES: Record<JobStatus, string> = {
  pending: 'border-amber-500 text-amber-600',
  running: 'border-blue-500 text-blue-600',
  done: 'border-green-600 text-green-600',
  failed: 'border-red-500 text-red-500',
  skipped: 'border-zinc-400 text-zinc-500',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function truncateUrl(url: string, maxLen = 60): string {
  return url.length > maxLen ? `${url.slice(0, maxLen)}…` : url;
}

export function JobsTable({
  jobs,
  sourceMap,
  retryingId,
  onRetry,
}: {
  jobs: CrawlJob[];
  sourceMap: Record<string, string>;
  retryingId: string | null;
  onRetry: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className="rounded-md border border-zinc-200 bg-white overflow-x-auto">
      <Table>
        <TableHeader className="bg-zinc-100">
          <TableRow>
            <TableHead className="text-zinc-700">Status</TableHead>
            <TableHead className="text-zinc-700">URL</TableHead>
            <TableHead className="text-zinc-700">Source</TableHead>
            <TableHead className="text-zinc-700 text-center">Attempts</TableHead>
            <TableHead className="text-zinc-700">Created</TableHead>
            <TableHead className="text-zinc-700 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const isRetrying = retryingId === job.id;
            return (
              <TableRow key={job.id} className="hover:bg-zinc-50">
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge
                      variant="outline"
                      className={STATUS_STYLES[job.status]}
                    >
                      {job.status}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="max-w-[320px]">
                  <span
                    className="text-xs text-zinc-600 block overflow-hidden text-ellipsis whitespace-nowrap"
                    title={job.url}
                  >
                    {truncateUrl(job.url)}
                  </span>
                  {job.errorMessage && (
                    <span className="text-xs text-red-500 block mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap" title={job.errorMessage}>
                      {job.errorMessage}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-zinc-700">
                  {sourceMap[job.sourceId] ?? job.sourceId.slice(0, 8)}
                </TableCell>
                <TableCell className="text-center text-sm text-zinc-600">
                  {job.attemptCount}
                </TableCell>
                <TableCell className="text-sm text-zinc-600 whitespace-nowrap">
                  {formatDate(job.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  {job.status === 'failed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isRetrying}
                      aria-label={`Retry job ${job.id}`}
                      onClick={() => onRetry(job.id)}
                    >
                      {isRetrying ? (
                        <Loader2 size={14} className="animate-spin mr-1.5" />
                      ) : (
                        <RotateCcw size={14} className="mr-1.5" />
                      )}
                      {isRetrying ? 'Retrying…' : 'Retry'}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
