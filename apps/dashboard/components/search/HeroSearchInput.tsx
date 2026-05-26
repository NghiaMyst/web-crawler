'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

function HeroSearchInputInner(): React.JSX.Element {
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

  void pathname;

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <Search
        size={18}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="search"
        placeholder="Search by title, source, tag…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search entries"
        aria-busy={isPending}
        className={cn(
          'w-full h-12 pl-11 pr-24 rounded-xl border border-zinc-200 bg-white',
          'text-sm text-zinc-900 placeholder:text-zinc-400',
          'shadow-sm transition-shadow',
          'focus:outline-none focus:ring-2 focus:ring-[#d8553a]/40 focus:border-[#d8553a]',
          isPending && 'opacity-70',
        )}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-mono bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200 select-none">
        ↵ search
      </span>
    </div>
  );
}

/**
 * Large hero-style search bar for the Entries page.
 * Navigates to /entries?q=<query> on Enter, preserving other filters.
 */
export function HeroSearchInput(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="relative w-full max-w-2xl mx-auto">
          <div className="w-full h-12 rounded-xl border border-zinc-200 bg-zinc-100 animate-pulse" />
        </div>
      }
    >
      <HeroSearchInputInner />
    </Suspense>
  );
}
