'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';

/**
 * Inner component that uses useSearchParams — must be wrapped in Suspense
 * to satisfy Next.js static generation requirements.
 */
function SearchInputInner(): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState<string>(searchParams.get('q') ?? '');
  const [isPending, startTransition] = useTransition();

  const navigateWithQ = (next: string): void => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('cursor');
    const trimmed = next.trim();
    if (trimmed) {
      params.set('q', trimmed);
    } else {
      params.delete('q');
    }
    // Always land on /entries — search is global regardless of source page.
    const target = `/entries${params.toString() ? `?${params.toString()}` : ''}`;
    startTransition(() => {
      router.push(target);
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateWithQ(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setValue('');
    }
  };

  // Reference pathname so the eslint no-unused-vars rule is satisfied if linted strictly.
  void pathname;

  return (
    <Input
      type="search"
      placeholder="Search entries..."
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className="h-8 text-sm bg-white/10 border-white/15 text-white placeholder:text-zinc-400 focus-visible:border-[#d8553a] focus-visible:ring-[#d8553a]/30"
      aria-label="Search entries"
      aria-busy={isPending}
    />
  );
}

/**
 * Phase 11 global nav search.
 * On Enter: navigates to /entries?q=<query> preserving existing category/sourceId/from/to params.
 * On Escape: clears local input (does not navigate).
 * Pre-fills from URL ?q= on mount.
 *
 * Wraps SearchInputInner in Suspense to satisfy Next.js useSearchParams requirements
 * during static generation.
 */
export function SearchInput(): React.JSX.Element {
  return (
    <Suspense fallback={<Input type="search" placeholder="Search entries..." className="h-8 text-sm bg-white/10 border-white/15 text-white placeholder:text-zinc-400" aria-label="Search entries" disabled />}>
      <SearchInputInner />
    </Suspense>
  );
}
