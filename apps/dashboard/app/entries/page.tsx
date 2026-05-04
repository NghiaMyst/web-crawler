import { Suspense } from 'react';
import type { EntryFilters } from '@/types/api';
import { fetchEntries, fetchSources } from '@/lib/api.server';
import { EntriesFilters } from '@/components/entries/entries-filters';
import { EntriesTable } from '@/components/entries/entries-table';
import { LoadMoreButton } from '@/components/entries/load-more-button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Entries | Web Crawler Dashboard',
};

interface EntriesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getStringParam(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function FiltersSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <Skeleton className="h-8 w-[140px]" />
      <Skeleton className="h-8 w-[180px]" />
      <Skeleton className="h-8 w-[140px]" />
      <Skeleton className="h-8 w-[140px]" />
    </div>
  );
}

function TableSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

async function EntriesContent({
  filters,
}: {
  filters: EntryFilters;
}): Promise<React.JSX.Element> {
  const [result, sources] = await Promise.all([
    fetchEntries(filters),
    fetchSources(),
  ]);

  return (
    <div className="space-y-4">
      <EntriesFilters sources={sources} />
      <EntriesTable entries={result.items} />
      <LoadMoreButton
        initialCursor={result.nextCursor}
        filters={filters}
      />
    </div>
  );
}

export default async function EntriesPage({
  searchParams,
}: EntriesPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;

  const filters: EntryFilters = {
    category: getStringParam(params['category']),
    sourceId: getStringParam(params['sourceId']),
    from: getStringParam(params['from']),
    to: getStringParam(params['to']),
    limit: 20,
  };

  return (
    <main className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Data Entries</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse crawled data entries filtered by category, source, or date range.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            <FiltersSkeleton />
            <TableSkeleton />
          </div>
        }
      >
        <EntriesContent filters={filters} />
      </Suspense>
    </main>
  );
}
