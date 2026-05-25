---
phase: 11
plan: 04
subsystem: dashboard
tags: [search, ui, navigation, highlight, filters]
dependency_graph:
  requires: [11-03]
  provides: [SC-4, dashboard-search-ui]
  affects: [entries-page, sidebar, mobile-nav, entries-table, entries-filters]
tech_stack:
  added: []
  patterns:
    - Suspense-wrapped useSearchParams for Next.js static generation compatibility
    - Client-side ReDoS-safe regex escaping for highlight
    - react-node highlight via text.split(re).map(<mark>)
key_files:
  created:
    - apps/dashboard/components/search/SearchInput.tsx
    - apps/dashboard/__tests__/SearchInput.test.ts
  modified:
    - apps/dashboard/types/api.ts
    - apps/dashboard/lib/api.server.ts
    - apps/dashboard/lib/api.client.ts
    - apps/dashboard/app/entries/page.tsx
    - apps/dashboard/components/entries/live-entries-wrapper.tsx
    - apps/dashboard/components/entries/load-more-button.tsx
    - apps/dashboard/components/entries/entries-table.tsx
    - apps/dashboard/components/entries/entries-filters.tsx
    - apps/dashboard/components/layout/Sidebar.tsx
    - apps/dashboard/components/layout/MobileNav.tsx
decisions:
  - "SearchInput wraps useSearchParams in a Suspense boundary (inner SearchInputInner component) to satisfy Next.js 16 static generation requirements — avoids useSearchParams bailout error during pnpm build"
  - "api.client.ts also updated to forward q alongside api.server.ts — load-more-button uses fetchEntriesClient so both paths must be consistent"
metrics:
  duration: ~20 minutes
  completed: 2026-05-25
  tasks_completed: 3
  files_modified: 12
---

# Phase 11 Plan 04: Dashboard Search UI — SearchInput, Highlight, Filters Badge Summary

**One-liner:** Global nav search bar with Enter-to-navigate, client-side ReDoS-safe `<mark>` highlight in payload preview, and "Searching: {q}" badge with X clear button in entries filters.

## What Was Done

### Task 1: Type plumbing and Vitest stub

- Added `q?: string` to `EntryFilters` interface in `types/api.ts`
- Added `if (filters.q) params.set('q', filters.q)` to `fetchEntries` in `api.server.ts`
- Added the same line to `fetchEntriesClient` in `api.client.ts` (deviation: plan said to check — file exists and uses same pattern, so it was updated for consistency with load-more-button)
- Updated `entries/page.tsx` to extract `q: getStringParam(params['q'])` and pass `q={filters.q}` to `<LiveEntriesWrapper>`
- Added `q?: string` to `LiveEntriesWrapperProps` and forwarded `q={q}` to `<EntriesTable>`
- Updated `load-more-button.tsx` to pass `q={filters.q}` to its `<EntriesTable>`
- Created `__tests__/SearchInput.test.ts` Vitest stub (node env, no jsdom, asserts export exists)

### Task 2: SearchInput component

- Created `components/search/SearchInput.tsx` as `'use client'` component
- Splits into `SearchInputInner` (uses `useSearchParams`) + exported `SearchInput` (wraps inner in `<Suspense>`) — required deviation to fix Next.js build
- On Enter: builds URLSearchParams from current params, deletes `cursor`, sets/deletes `q`, navigates to `/entries?...` via `router.push` inside `startTransition`
- On Escape: clears local input value only
- Pre-fills from URL `?q=` via `useState(searchParams.get('q') ?? '')`
- Uses Shadcn `Input` at `h-8 text-sm`, `type="search"`, `aria-label="Search entries"`, `aria-busy={isPending}`
- Rendered in `Sidebar.tsx` (desktop, dark sidebar) in a `px-3 py-2 border-b border-white/10` band
- Rendered in `MobileNav.tsx` (mobile sheet) in a `px-3 py-2 border-b border-zinc-200` band

### Task 3: Highlight and filters badge

- Replaced `entries-table.tsx` with full new implementation:
  - `EntriesTableProps` gains `q?: string`
  - `escapeRegExp` function prevents ReDoS
  - `highlightMatches` splits text on regex match and returns `React.ReactNode` with `<mark className="bg-yellow-200 dark:bg-yellow-800/50 rounded-sm px-0.5">` wrapping matched tokens
  - `formatPayloadPreview` now accepts and forwards `q`
  - Empty state shows query-specific copy when `q` is non-empty
- Updated `entries-filters.tsx`:
  - Imported `Badge` from `@/components/ui/badge` and `Search, X` from `lucide-react`
  - Added `const currentQ = searchParams.get('q') ?? ''`
  - Extended `hasFilters` to include `|| searchParams.has('q')`
  - Added "Searching: {q}" badge with `<Search size={12}>`, `<span>Searching: {currentQ}</span>`, and X `<button aria-label="Clear search">` calling `handleChange('q', null)`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wrapped SearchInput in Suspense to fix Next.js build**
- **Found during:** Task 3 verification (`pnpm build`)
- **Issue:** `useSearchParams()` without a Suspense boundary causes Next.js to bail out of static generation for `/entries`, producing: "useSearchParams() should be wrapped in a suspense boundary at page '/entries'"
- **Fix:** Split `SearchInput` into `SearchInputInner` (the real component using `useSearchParams`) and exported `SearchInput` which wraps `SearchInputInner` in `<Suspense fallback={<disabled Input>}>`. This is the standard Next.js recommended pattern.
- **Files modified:** `apps/dashboard/components/search/SearchInput.tsx`
- **Commit:** 2bfbca8

**2. [Rule 2 - Missing critical functionality] Updated api.client.ts to forward q**
- **Found during:** Task 1
- **Issue:** Plan said to check if `api.client.ts` exists and update if it uses a similar pattern. It does — `fetchEntriesClient` builds URLSearchParams the same way as `fetchEntries`. `load-more-button.tsx` uses `fetchEntriesClient`, so without forwarding `q`, load-more results would not be filtered by the search term even though `q={filters.q}` is now passed to `EntriesTable`.
- **Fix:** Added `if (filters.q) params.set('q', filters.q)` to `fetchEntriesClient` in `api.client.ts`
- **Files modified:** `apps/dashboard/lib/api.client.ts`
- **Commit:** 2bfbca8

## Verification Results

```
TypeScript: pnpm exec tsc --noEmit → exit 0 (zero errors)
Build:      pnpm build → exit 0 (all 4 static + 6 dynamic pages generated)
Tests:      pnpm test --run → 8 test files, 55 passed, 4 todo — exit 0
```

All 21 acceptance criteria checks passed.

## Known Stubs

None — all wiring is live. The `q` flows from URL → `SearchInput` navigation → page `searchParams` → `fetchEntries` → API `?q=` parameter → `EntriesTable` highlight.

## Threat Flags

No new security surface beyond what was declared in the plan's threat model. All mitigations were implemented:
- T-11-04-01/02: `escapeRegExp` applied before `new RegExp()` — no ReDoS, no XSS
- T-11-04-04: `router.push` target is `/entries` + `URLSearchParams.toString()` — no open redirect

## Self-Check: PASSED

- `apps/dashboard/components/search/SearchInput.tsx` — FOUND
- `apps/dashboard/__tests__/SearchInput.test.ts` — FOUND
- `apps/dashboard/types/api.ts` (q?: string) — FOUND
- `apps/dashboard/lib/api.server.ts` (params.set('q')) — FOUND
- `apps/dashboard/components/entries/entries-table.tsx` (escapeRegExp, mark) — FOUND
- `apps/dashboard/components/entries/entries-filters.tsx` (Searching:) — FOUND
- Commit 2bfbca8 — FOUND
