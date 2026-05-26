'use client';

import { Suspense } from 'react';
import { HeroSearchInput } from '@/components/search/HeroSearchInput';
import { CategoryFilterTiles } from '@/components/entries/CategoryFilterTiles';

/**
 * Variant-B style hero for the Entries page.
 * Big heading + search + category tiles — all client-interactive.
 */
export function HeroSection(): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm px-6 py-8 mb-6">
      {/* Heading */}
      <div className="text-center mb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-zinc-900">
          What's been{' '}
          <span className="text-[#d8553a]">crawled?</span>
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          Browse and search across all crawled entries by category, source, or keyword.
        </p>
      </div>

      {/* Big search */}
      <div className="mb-5">
        <Suspense>
          <HeroSearchInput />
        </Suspense>
      </div>

      {/* Category tiles */}
      <div className="flex justify-center">
        <Suspense>
          <CategoryFilterTiles />
        </Suspense>
      </div>
    </div>
  );
}
