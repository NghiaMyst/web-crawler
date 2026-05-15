'use client';

import { useRouter } from 'next/navigation';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { NotificationsTable } from './NotificationsTable';
import { NotificationsEmptyState } from './NotificationsEmptyState';
import type { NotificationLog, Source } from '@/types/api';

export function NotificationsClient({
  initialLogs,
  sources,
  activeSourceId,
}: {
  initialLogs: NotificationLog[];
  sources: Source[];
  activeSourceId?: string;
}): React.JSX.Element {
  const router = useRouter();

  function handleSourceChange(value: string | null): void {
    if (!value || value === 'all') {
      router.push('/notifications');
    } else {
      router.push(`/notifications?sourceId=${encodeURIComponent(value)}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-zinc-600">
          {initialLogs.length} notification{initialLogs.length === 1 ? '' : 's'}
        </span>
        <Select
          value={activeSourceId ?? 'all'}
          onValueChange={handleSourceChange}
        >
          <SelectTrigger className="w-[200px]" aria-label="Filter by source">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {initialLogs.length === 0 ? (
        <NotificationsEmptyState />
      ) : (
        <NotificationsTable logs={initialLogs} />
      )}
    </div>
  );
}
