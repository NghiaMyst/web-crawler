---
phase: 13
plan: 01
subsystem: dashboard-ui
tags: [css-tokens, tailwind, design-system, semantic-tokens, coral-palette]
dependency_graph:
  requires: []
  provides: [sidebar-css-tokens, semantic-token-components]
  affects: [apps/dashboard/app/globals.css, apps/dashboard/components/layout, apps/dashboard/components/entries, apps/dashboard/components/search]
tech_stack:
  added: []
  patterns: [tailwind-v4-semantic-tokens, css-custom-properties, oklch-color-space]
key_files:
  created: []
  modified:
    - apps/dashboard/app/globals.css
    - apps/dashboard/components/layout/Sidebar.tsx
    - apps/dashboard/components/layout/MobileNav.tsx
    - apps/dashboard/components/layout/NavLinks.tsx
    - apps/dashboard/components/layout/PageHeader.tsx
    - apps/dashboard/components/entries/HeroSection.tsx
    - apps/dashboard/components/entries/CategoryFilterTiles.tsx
    - apps/dashboard/components/search/HeroSearchInput.tsx
decisions:
  - "Replaced border-white/8 with border-sidebar-border throughout layout components for token consistency"
  - "NavLinks inactive state uses text-sidebar-foreground/70 and hover:bg-sidebar-accent — leverages new sidebar-accent white/6 token from globals.css"
  - "HeroSearchInput uses border-input (not border-border) for the input field — matches the CSS variable semantics for form inputs"
metrics:
  duration: 177s
  completed: "2026-05-26"
  tasks_completed: 2
  files_changed: 8
---

# Phase 13 Plan 01: CSS Token Formalization Summary

**One-liner:** Formalized Variant B coral + warm-dark palette into semantic CSS variable tokens, replacing all hardcoded hex literals across 7 dashboard components with `bg-sidebar`, `bg-primary`, `text-foreground`, `text-muted-foreground`, `border-border`, `ring-primary` Tailwind utilities.

## What Was Done

### Task 1: globals.css sidebar token update

Updated the `:root {}` block's sidebar-related variables from light/default values to warm-dark sidebar values matching the Variant B design:

| Token | Before | After |
|-------|--------|-------|
| `--sidebar` | `oklch(0.985 0 0)` (near-white) | `oklch(0.20 0.015 65)` (#252017 warm-dark) |
| `--sidebar-foreground` | `oklch(0.145 0 0)` (near-black) | `oklch(0.85 0.005 80)` (warm off-white) |
| `--sidebar-accent` | `oklch(0.97 0 0)` (light gray) | `oklch(1 0 0 / 6%)` (white/6 for dark bg nav hover) |
| `--sidebar-accent-foreground` | `oklch(0.205 0 0)` (dark) | `oklch(0.985 0 0)` (white) |
| `--sidebar-border` | `oklch(0.922 0 0)` (light gray) | `oklch(1 0 0 / 8%)` (white/8 dividers on dark) |

The `.dark` block and `@theme inline` block were left untouched as specified.

### Task 2: Component token replacement

**Sidebar.tsx** (26 lines):
- `bg-[#1c1814]` → `bg-sidebar`
- `border-white/8` × 2 → `border-sidebar-border`
- `text-white` (brand "web") → `text-sidebar-foreground`
- `text-[#d8553a]` (brand "crawler") → `text-primary`

**MobileNav.tsx** (42 lines):
- `bg-[#1c1814]` × 2 (header + SheetContent) → `bg-sidebar`
- `border-white/8` × 2 → `border-sidebar-border`
- `text-white` (brand "web") × 2 → `text-sidebar-foreground`
- `text-[#d8553a]` (brand "crawler") × 2 → `text-primary`

**NavLinks.tsx** (43 lines):
- Active: `bg-[#d8553a] text-white` → `bg-primary text-primary-foreground`
- Inactive: `text-zinc-400 hover:bg-white/6 hover:text-zinc-100` → `text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground`
- Icon active: `text-white` → `text-primary-foreground`
- Icon inactive: `text-zinc-500` → `text-sidebar-foreground/50`

**PageHeader.tsx** (19 lines):
- `text-zinc-900` → `text-foreground`
- `text-zinc-500` → `text-muted-foreground`

**HeroSection.tsx** (41 lines):
- `border-zinc-200 bg-white` → `border-border bg-card`
- `text-zinc-900` → `text-foreground`
- `text-[#d8553a]` (accent "crawled?") → `text-primary`
- `text-zinc-500` → `text-muted-foreground`

**CategoryFilterTiles.tsx** (98 lines):
- All 5 category `colorActive` strings: `bg-[#d8553a] border-[#d8553a] text-white` → `bg-primary border-primary text-primary-foreground`
- `colorInactive` strings left unchanged (deliberate per-category pastel palettes)

**HeroSearchInput.tsx** (90 lines):
- Search icon: `text-zinc-400` → `text-muted-foreground`
- Input: `border-zinc-200 bg-white` → `border-input bg-card`
- Input text: `text-zinc-900 placeholder:text-zinc-400` → `text-foreground placeholder:text-muted-foreground`
- Focus ring: `focus:ring-[#d8553a]/40 focus:border-[#d8553a]` → `focus:ring-primary/40 focus:border-primary`
- kbd hint: `text-zinc-400 bg-zinc-100 border-zinc-200` → `text-muted-foreground bg-muted border-border`
- Suspense fallback: `border-zinc-200 bg-zinc-100` → `border-border bg-muted`

## Visual Notes

The sidebar renders slightly lighter than before — `#252017` is visibly warmer and slightly less dark than the previous `#1c1814`, but both are warm-brown dark tones consistent with Variant B. The coral accent (#d8553a via `--primary`) is unchanged across all active states (nav item, category tiles, brand text, hero accent word, search focus ring). This plan unblocks Plan 02's `<mark>` element (which uses `bg-primary/10`) and Plan 04's Playwright visual baselines.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `98a096b` | feat(13-01): update sidebar CSS variable tokens to warm-dark palette (D-02) |
| Task 2 | `bc9c3b5` | feat(13-01): replace hardcoded hex classes with semantic Tailwind tokens (D-02) |

## Verification Results

- `pnpm --filter @web-crawler/dashboard type-check` — 0 TypeScript errors
- `pnpm --filter @web-crawler/dashboard test` — 55 passed, 4 todo (8 test files)
- `grep -RE "bg-\[#1c1814\]|text-\[#d8553a\]|bg-\[#d8553a\]|focus:ring-\[#d8553a\]|focus:border-\[#d8553a\]" apps/dashboard/components/layout apps/dashboard/components/entries apps/dashboard/components/search` — zero matches

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all token replacements are fully wired to CSS variables defined in globals.css.

## Threat Flags

None — purely CSS/TSX visual token changes, no new data flows, auth, or external integrations.

## Self-Check: PASSED

Files exist:
- apps/dashboard/app/globals.css — FOUND (contains `--sidebar: oklch(0.20 0.015 65)`)
- apps/dashboard/components/layout/Sidebar.tsx — FOUND (contains `bg-sidebar`)
- apps/dashboard/components/layout/MobileNav.tsx — FOUND (contains `bg-sidebar` x2)
- apps/dashboard/components/layout/NavLinks.tsx — FOUND (contains `bg-primary text-primary-foreground`)
- apps/dashboard/components/layout/PageHeader.tsx — FOUND (contains `text-foreground`)
- apps/dashboard/components/entries/HeroSection.tsx — FOUND (contains `border-border bg-card`)
- apps/dashboard/components/entries/CategoryFilterTiles.tsx — FOUND (contains `bg-primary border-primary text-primary-foreground` x5)
- apps/dashboard/components/search/HeroSearchInput.tsx — FOUND (contains `focus:ring-primary/40 focus:border-primary`)

Commits exist:
- 98a096b — FOUND
- bc9c3b5 — FOUND
