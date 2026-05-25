'use client';

import { useState, useTransition } from 'react';
import type { DataEntry, EntryFilters } from '@/types/api';
import { fetchEntriesClient } from '@/lib/api.client';
import { Button } from '@/components/ui/button';
import { EntriesTable } from './entries-table';

interface LoadMoreButtonProps {
  initialCursor: string | null;
  filters: Omit<EntryFilters, 'cursor'>;
}

export function LoadMoreButton({
  initialCursor,
  filters,
}: LoadMoreButtonProps): React.JSX.Element | null {
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [extraEntries, setExtraEntries] = useState<DataEntry[]>([]);
  const [isPending, startTransition] = useTransition();

  if (!cursor) return null;

  const handleLoadMore = () => {
    startTransition(async () => {
      try {
        const result = await fetchEntriesClient({ ...filters, cursor });
        setExtraEntries((prev) => [...prev, ...result.items]);
        setCursor(result.nextCursor);
      } catch (err) {
        console.error('Failed to load more entries:', err);
      }
    });
  };

  return (
    <div className="mt-4 space-y-4">
      {extraEntries.length > 0 && <EntriesTable entries={extraEntries} q={filters.q} />}
      {cursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isPending}
            aria-label="Load more entries"
          >
            {isPending ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
