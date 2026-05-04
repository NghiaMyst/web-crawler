'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import type { Source } from '@/types/api';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

const CATEGORIES = ['football', 'games', 'anime', 'manga', 'music'] as const;

interface EntriesFiltersProps {
  sources: Source[];
}

export function EntriesFilters({ sources }: EntriesFiltersProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const createQueryString = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      // Reset cursor when filters change
      params.delete('cursor');
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value === '' || value === 'all') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      return params.toString();
    },
    [searchParams]
  );

  const handleChange = (key: string, value: string | null | undefined) => {
    startTransition(() => {
      const qs = createQueryString({ [key]: value });
      router.push(`${pathname}${qs ? `?${qs}` : ''}`);
    });
  };

  const handleReset = () => {
    startTransition(() => {
      router.push(pathname);
    });
  };

  const currentCategory = searchParams.get('category') ?? 'all';
  const currentSourceId = searchParams.get('sourceId') ?? 'all';
  const currentFrom = searchParams.get('from') ?? '';
  const currentTo = searchParams.get('to') ?? '';

  const hasFilters =
    searchParams.has('category') ||
    searchParams.has('sourceId') ||
    searchParams.has('from') ||
    searchParams.has('to');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Category filter */}
      <Select
        value={currentCategory}
        onValueChange={(value) => handleChange('category', value)}
      >
        <SelectTrigger className="w-[140px]" aria-label="Filter by category">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {CATEGORIES.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Source filter */}
      <Select
        value={currentSourceId}
        onValueChange={(value) => handleChange('sourceId', value)}
      >
        <SelectTrigger className="w-[180px]" aria-label="Filter by source">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          {sources.map((src) => (
            <SelectItem key={src.id} value={src.id}>
              {src.displayName || src.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Date range: from */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="date-from" className="text-xs text-muted-foreground whitespace-nowrap">
          From
        </label>
        <Input
          id="date-from"
          type="date"
          className="w-[140px]"
          value={currentFrom}
          onChange={(e) => handleChange('from', e.target.value)}
        />
      </div>

      {/* Date range: to */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="date-to" className="text-xs text-muted-foreground whitespace-nowrap">
          To
        </label>
        <Input
          id="date-to"
          type="date"
          className="w-[140px]"
          value={currentTo}
          onChange={(e) => handleChange('to', e.target.value)}
        />
      </div>

      {/* Reset */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={isPending}
          aria-label="Reset filters"
        >
          Reset
        </Button>
      )}

      {isPending && (
        <span className="text-xs text-muted-foreground" aria-live="polite">
          Loading...
        </span>
      )}
    </div>
  );
}
