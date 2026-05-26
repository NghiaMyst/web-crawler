'use client';

import { Loader2, RotateCcw } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CrawlJob } from '@/types/api';
import { JOB_STATUS_STYLES } from '@/lib/badge-styles';

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
    <div className="rounded-md border border-border bg-card overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-muted-foreground">Status</TableHead>
            <TableHead className="text-muted-foreground">URL</TableHead>
            <TableHead className="text-muted-foreground">Source</TableHead>
            <TableHead className="text-muted-foreground text-center">Attempts</TableHead>
            <TableHead className="text-muted-foreground">Created</TableHead>
            <TableHead className="text-muted-foreground text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const isRetrying = retryingId === job.id;
            return (
              <TableRow key={job.id} className="hover:bg-muted/30">
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge
                      variant="outline"
                      className={JOB_STATUS_STYLES[job.status]}
                    >
                      {job.status}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="max-w-[320px]">
                  <span
                    className="text-xs text-muted-foreground block overflow-hidden text-ellipsis whitespace-nowrap"
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
                <TableCell className="text-sm text-foreground">
                  {sourceMap[job.sourceId] ?? job.sourceId.slice(0, 8)}
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">
                  {job.attemptCount}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatDate(job.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  {job.status === 'failed' && (
                    <Button
                      variant="default"
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
