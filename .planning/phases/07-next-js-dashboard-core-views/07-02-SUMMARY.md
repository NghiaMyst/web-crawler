---
phase: 07-next-js-dashboard-core-views
plan: 02
subsystem: dashboard-layout
tags: [nextjs, layout, sidebar, mobile-nav, error-boundary, skeleton]
dependency_graph:
  requires: [07-01]
  provides: [DashboardLayout, Sidebar, MobileNav, NavLinks, TableSkeleton, error-boundary, loading-skeleton]
  affects: [07-03, 07-04, 07-05]
tech_stack:
  added: []
  patterns: [next-app-router-layout, base-ui-dialog-sheet, usePathname-active-link]
key_files:
  created:
    - apps/dashboard/components/layout/NavLinks.tsx
    - apps/dashboard/components/layout/Sidebar.tsx
    - apps/dashboard/components/layout/MobileNav.tsx
    - apps/dashboard/components/layout/DashboardLayout.tsx
    - apps/dashboard/components/skeletons/TableSkeleton.tsx
    - apps/dashboard/app/error.tsx
    - apps/dashboard/app/loading.tsx
  modified:
    - apps/dashboard/app/layout.tsx
    - apps/dashboard/app/page.tsx
decisions:
  - "Preserved Geist font variable setup from plan 07-01 when replacing layout.tsx"
  - "Used base-ui Dialog.Trigger render prop pattern instead of asChild (Radix pattern not applicable)"
  - "Used font-semibold (weight 600) for active nav links per UI-SPEC — plan template had font-medium (500) but plan notes self-corrected this"
metrics:
  duration: 175
  completed_date: "2026-05-04"
  tasks_completed: 2
  files_changed: 9
---

# Phase 7 Plan 02: Layout Shell Summary

**One-liner:** Persistent 240px sidebar + mobile hamburger Sheet drawer wrapping all routes via DashboardLayout, with active nav highlighting, error boundary, and skeleton loading states.

## What Was Built

### Component Boundaries: Server vs Client

| Component | Boundary | Reason |
|-----------|----------|--------|
| `DashboardLayout` | Server | Composes server-compatible children; no interactivity needed |
| `Sidebar` | Server | Static markup; delegates link interactivity to NavLinks |
| `NavLinks` | Client (`'use client'`) | Requires `usePathname()` from `next/navigation` for active link detection |
| `MobileNav` | Client (`'use client'`) | Requires `useState` for Sheet open/close state |
| `TableSkeleton` | Server | Pure presentational — no hooks |
| `error.tsx` | Client (required by Next.js) | Error boundaries must be client components per App Router contract |
| `loading.tsx` | Server | Next.js renders this file automatically during navigation |

### How NavLinks Serves Both Sidebar and MobileNav

NavLinks is a standalone client component that accepts an optional `onNavigate` callback.

- **Sidebar** (desktop): imports `NavLinks` with no `onNavigate` — links navigate without closing anything.
- **MobileNav** (mobile): imports `NavLinks` with `onNavigate={() => setOpen(false)}` — clicking a nav link closes the Sheet drawer via the parent's state setter.

This allows the same link list (with active highlighting via `usePathname`) to be reused in both contexts without duplication, while keeping the Sheet open/close state owned by `MobileNav`.

### How error.tsx + loading.tsx Integrate with App Router

- **`error.tsx`**: Next.js App Router automatically wraps each route segment in an error boundary if `error.tsx` is present. It must export a default client component receiving `{ error, reset }` props. The `reset()` function re-renders the route segment. Error message is logged to `console.error` only — never rendered into the DOM (T-07-07 mitigation).

- **`loading.tsx`**: Next.js wraps route segments in a `<Suspense>` boundary using `loading.tsx` as the fallback during navigation and initial load. Since `DashboardLayout` wraps children in `<main>`, the skeleton renders inside the layout shell (sidebar/top bar remain visible during loading).

### Root Layout Integration

`app/layout.tsx` now wraps all children with `DashboardLayout`. The Geist font variable (`--font-sans`) from the original layout is preserved so typography styles remain consistent.

### Root Redirect

`app/page.tsx` uses `redirect('/entries')` from `next/navigation`. This is a server-side redirect — Next.js throws a `NEXT_REDIRECT` error internally which it catches and converts to a 307/308 HTTP redirect. The TypeScript return type `never` is correct because the function never returns a value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing zod package in node_modules**
- **Found during:** Task 1 build verification (first build attempt)
- **Issue:** `lib/schemas/source.ts` (created by plan 07-04) imports `zod` which was in `package.json` but not installed in `node_modules`
- **Fix:** Ran `pnpm install --filter @web-crawler/dashboard` to install missing dependency
- **Files modified:** None (dependency install only)
- **Commit:** N/A (install, not a code change)

**2. [Rule 2 - Self-correction] font-semibold instead of font-medium for active nav links**
- **Found during:** Task 1 — plan template noted this self-correction explicitly
- **Issue:** Plan template code showed `font-medium` (weight 500) but UI-SPEC only permits weights 400 and 600
- **Fix:** Used `font-semibold` (weight 600) in NavLinks.tsx active state
- **Files modified:** `apps/dashboard/components/layout/NavLinks.tsx`
- **Commit:** c087593

**3. [Rule 1 - Adaptation] base-ui SheetTrigger uses render prop, not asChild**
- **Found during:** Task 1 — examining `components/ui/sheet.tsx` which uses `@base-ui/react/dialog`
- **Issue:** Plan template used `<SheetTrigger asChild>` which is the Radix UI pattern; base-ui uses a `render` prop pattern
- **Fix:** Used `<SheetTrigger render={<Button ... />}>` in MobileNav.tsx
- **Files modified:** `apps/dashboard/components/layout/MobileNav.tsx`
- **Commit:** c087593

**4. [Rule 2 - Preservation] Preserved Geist font setup in layout.tsx**
- **Found during:** Task 2 — plan said to replace layout.tsx with a simpler version without Geist
- **Issue:** Plan 07-01 had set up Geist font with CSS variable `--font-sans`; dropping it would break typography
- **Fix:** Kept Geist import and `className={cn('font-sans', geist.variable)}` on `<html>` element
- **Files modified:** `apps/dashboard/app/layout.tsx`
- **Commit:** 8fb8ff3

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | c087593 | feat(07-02): build NavLinks, Sidebar, MobileNav, DashboardLayout components |
| 2 | 8fb8ff3 | feat(07-02): wire root layout, redirect home, add error boundary and loading skeleton |

## Known Stubs

None. All components render actual content or proper skeleton states.

## Threat Flags

None. No new security-relevant surface introduced beyond what is documented in the plan's threat model.

## Self-Check: PASSED
