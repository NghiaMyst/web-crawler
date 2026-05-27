# Phase 13: Frontend Design Refresh - Research

**Researched:** 2026-05-26
**Domain:** Next.js dashboard visual redesign — Tailwind v4 CSS tokens, Shadcn/ui theming, Recharts, Playwright visual QA
**Confidence:** HIGH (all findings verified directly against source files)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Variant B confirmed — Hero + tiles + dark sidebar + coral accent is the locked direction. No structural rethinking needed.
- **D-02:** Sidebar color nudge — Change sidebar background from `#1c1814` to a slightly lighter warm dark: `#252017` or `#2a2420`. Keep the warm-brown character, reduce heaviness.
- **D-03:** Hero on Entries only — The Variant B hero card (big search + category tiles) lives only on `/entries`. All other pages use the existing `PageHeader` component — no hero block.
- **D-04:** Comfortable row density — Table rows should feel spacious (~48px height, more py padding). Easier to scan.
- **D-05:** Search highlight via `<mark>` tags — When `?q=` is active, matched tokens get a styled `<mark>` tag with coral underline or subtle coral background tint.
- **D-06:** Empty state: centered icon + message — `lucide-react` icon (e.g., `Inbox` or `SearchX`) + short message line. Consistent with Shadcn UI style.
- **D-07:** Full visual treatment on charts page — Chart cards get consistent `border`/`shadow-sm`. Chart line/bar colors updated to use coral as primary series color plus complementary palette from `--chart-*` CSS variables.
- **D-08:** Status badges + action buttons styled — Consistent badge colors per status. Action buttons (Retry, Delete, Edit) use the coral primary palette consistently.
- **D-09:** Palette consistency only for modals — inputs/labels/buttons updated to coral primary and typography. No structural changes.
- **D-10:** Playwright screenshot snapshots — Add snapshot tests that screenshot key pages (Entries, Charts, Sources, one management page) and fail on unexpected layout changes. Chrome headless only.

### Claude's Discretion

- Exact warm-dark hex value for sidebar (`#252017` vs `#2a2420` — pick whichever is visually balanced)
- Which lucide-react icon to use for empty states per-page context
- Exact `<mark>` styling (underline vs subtle bg tint)
- Nav icon assignments (if any need updating)
- Playwright snapshot threshold tolerances

### Deferred Ideas (OUT OF SCOPE)

- Dark mode support
- Variant A/C/D/E elements
- Deployment todos (deploy-phase-11-12, UAT checks)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DESIGN-01 | Wireframe audit and direction selection | Variant B confirmed in CONTEXT.md; wireframes.jsx fully audited below — D-01 locks the direction |
| DESIGN-02 | Design system tokens / Tailwind config | Full globals.css @theme audit done; token gaps and migration strategy documented in Architecture Patterns |
| DESIGN-03 | Page-level layout implementation | All 6 pages audited; component-by-component change list in Current State Audit |
| DESIGN-04 | Component polish and visual QA | Badge/status patterns, mark styling, empty state, Playwright setup — all in Standard Stack and Patterns |
</phase_requirements>

---

## Summary

Phase 13 completes and hardens the Variant B visual redesign started in commit 944bc81. The foundation is already solid: dark sidebar, coral primary, hero section, PageHeader, plus Jakarta Sans fonts are all committed. This phase has four discrete work streams:

1. **Token formalization (DESIGN-02):** The biggest gap is that the dark sidebar color is hardcoded as `bg-[#1c1814]` in three places (Sidebar.tsx, MobileNav.tsx header, MobileNav.tsx SheetContent) instead of using a CSS variable. The `--sidebar` CSS variable in globals.css still points to the near-white Shadcn default (`oklch(0.985 0 0)`), which is never actually used. Similarly, coral accent is hardcoded as `text-[#d8553a]` and `bg-[#d8553a]` in several components instead of referencing `bg-primary`. Token consolidation is the primary DESIGN-02 task.

2. **Data table and search polish (D-04, D-05, D-06):** The entries table has no explicit row height — rows inherit the default TableRow padding which is compact. Row density needs `py-3.5` on TableCell. The `<mark>` highlight already exists in entries-table.tsx but uses `bg-yellow-200`, not the coral palette. The empty state is a plain div with no icon.

3. **Chart and management page polish (D-07, D-08, D-09):** VolumeChart already reads `var(--chart-1)` through `var(--chart-5)` for colors, which are already set to coral/teal/purple/green/pink. The chart sections need card wrappers (`border`/`shadow-sm`/`rounded-lg`). Management tables use hardcoded `bg-zinc-100` headers and `border-zinc-200` wrappers that should use `bg-muted`/`border-border` CSS variables for semantic correctness. Status badge colors use explicit Tailwind color classes (amber-500, blue-500, green-600, red-500) which are fine for status semantics and should be kept.

4. **Playwright visual QA (D-10):** Playwright is not installed in the project. No playwright.config exists anywhere. The dashboard package uses Vitest (v4.1.4) for unit tests. A full Playwright setup — `@playwright/test` devDependency, `playwright.config.ts`, screenshot test files, and `webServer` config pointing at Next.js dev — must be added as a Wave 0 task.

**Primary recommendation:** Execute in four sequential plans: (1) token consolidation in globals.css + three layout components, (2) entries table density/mark/empty-state polish, (3) charts page card wrap + management page table cosmetics + modal palette consistency, (4) Playwright install + snapshot tests.

---

## Standard Stack

### Core (already installed)
[VERIFIED: apps/dashboard/package.json]

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.2 | App Router framework | Already in use |
| Tailwind CSS | 4.2.4 | CSS-first utility framework | Already in use |
| Shadcn/ui | 4.6.0 | Component primitives | Already installed; all needed components present |
| @base-ui/react | ^1.4.1 | Badge/Button primitives (Shadcn v4 uses base-ui) | Already in use |
| lucide-react | ^1.14.0 | Icon set | Already installed |
| recharts | 3.8.0 | Chart rendering | Already in use |
| class-variance-authority | ^0.7.1 | Variant class builder | Already in use |

### New (needed for D-10)
[VERIFIED: no playwright config or package anywhere in project]

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @playwright/test | ^1.48+ | Screenshot snapshot tests | D-10 Playwright visual QA |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @playwright/test snapshots | vitest + @vitest/browser | Playwright is specifically named in D-10; vitest browser mode is experimental for snapshots |
| CSS variable sidebar color | Inline style or bg-[#...] | CSS variable in globals.css is the established pattern (D-02 explicitly calls for token formalization) |

**Installation (Wave 0 for D-10):**
```bash
pnpm add -D @playwright/test --filter @web-crawler/dashboard
npx playwright install chromium
```

---

## Architecture Patterns

### Current Token Structure (VERIFIED: apps/dashboard/app/globals.css)

The Tailwind v4 CSS-first pattern uses a dual-registration system:

```css
/* Step 1: @theme inline block bridges CSS vars to Tailwind utility classes */
@theme inline {
  --color-primary: var(--primary);       /* enables bg-primary, text-primary */
  --color-sidebar: var(--sidebar);        /* enables bg-sidebar */
  --color-chart-1: var(--chart-1);        /* enables bg-chart-1 */
  /* etc. */
}

/* Step 2: :root {} defines the actual values */
:root {
  --primary: oklch(0.55 0.19 28);        /* coral #d8553a */
  --sidebar: oklch(0.985 0 0);            /* currently near-white, NOT used by dark sidebar */
}
```

**Critical gap:** `--sidebar` is `oklch(0.985 0 0)` (near-white) but the actual dark sidebar uses `bg-[#1c1814]`. These are disconnected. The fix for D-02 is:
1. Update `--sidebar` in `:root {}` to the new warm-dark OKLCH value
2. Replace `bg-[#1c1814]` in Sidebar.tsx and MobileNav.tsx with `bg-sidebar`

**OKLCH for sidebar candidates** [ASSUMED: CSS color conversion]:
- `#252017` ≈ `oklch(0.20 0.015 65)` — slightly lighter warm brown
- `#2a2420` ≈ `oklch(0.22 0.018 45)` — similar but slightly redder

Recommendation: use `#252017` — closer to the original warm brown character.

### Pattern 1: Tailwind v4 New Token Registration

Adding a new semantic token requires both steps:

```css
/* In @theme inline block — add the bridge: */
@theme inline {
  --color-sidebar-bg: var(--sidebar-bg);   /* NEW: for warm dark sidebar */
}

/* In :root {} — add the value: */
:root {
  --sidebar-bg: oklch(0.20 0.015 65);    /* #252017 equivalent */
}
```

Then in components: `className="bg-sidebar-bg"` instead of `bg-[#252017]`.

**HOWEVER:** The simpler path for D-02 is to update `--sidebar` in `:root {}` (and `--sidebar-foreground`, `--sidebar-border` for text/border contrast) since `--color-sidebar` is already bridged in `@theme`. Change `--sidebar` from `oklch(0.985 0 0)` to the warm dark OKLCH, then switch `bg-[#1c1814]` to `bg-sidebar`.

**Caveat:** The `.dark` block also sets `--sidebar: oklch(0.205 0 0)`. Since dark mode is out of scope, this is safe to override — just update `:root {}`. [VERIFIED: CONTEXT.md Deferred Ideas: "Dark mode support — out of scope"]

### Pattern 2: Shadcn Badge with Status Colors

Current pattern (VERIFIED: JobsTable.tsx, NotificationsTable.tsx, AlertsTable.tsx):

```tsx
// Already used — variant="outline" + className override
<Badge variant="outline" className={STATUS_STYLES[job.status]}>
  {job.status}
</Badge>

const STATUS_STYLES: Record<JobStatus, string> = {
  pending: 'border-amber-500 text-amber-600',
  running: 'border-blue-500 text-blue-600',
  done: 'border-green-600 text-green-600',
  failed: 'border-red-500 text-red-500',
  skipped: 'border-zinc-400 text-zinc-500',
};
```

This pattern is correct and semantically meaningful. D-08 is about ensuring consistency across all tables (currently each table defines its own STATUS_STYLES object inline). Extract to a shared `lib/badge-styles.ts` file.

**Action buttons:** Currently using `variant="ghost"` for Edit/Delete (AlertsTable, SourcesTable) and `variant="outline"` for Retry (JobsTable). For D-08 coral primary consistency: Retry button can use `variant="default"` (which uses `bg-primary` = coral). Edit should remain ghost. Delete can remain ghost or use `variant="destructive"`.

### Pattern 3: mark Tag Restyling (D-05)

Current implementation (VERIFIED: entries-table.tsx line 34):
```tsx
<mark className="bg-yellow-200 dark:bg-yellow-800/50 rounded-sm px-0.5">
  {part}
</mark>
```

Target (D-05 — coral tint or underline, consistent with palette):
```tsx
<mark className="bg-[#d8553a]/10 text-inherit rounded-sm px-0.5 decoration-[#d8553a] underline decoration-2">
  {part}
</mark>
```

Or using CSS variable (after token formalization):
```tsx
<mark className="bg-primary/10 text-inherit rounded-sm px-0.5 underline decoration-primary decoration-2">
  {part}
</mark>
```

Recommendation: use `bg-primary/10` + `underline decoration-primary` — reads clearly and ties to the token system.

### Pattern 4: Empty State Component (D-06)

Current (VERIFIED: entries-table.tsx line 66-73): plain div, no icon:
```tsx
<div className="rounded-lg border border-border p-8 text-center text-muted-foreground text-sm">
  {q ? `No results for "${q}"...` : 'No entries found...'}
</div>
```

Target pattern (lucide-react icon + message):
```tsx
<div className="flex flex-col items-center justify-center rounded-lg border border-border p-12 gap-3 text-muted-foreground">
  <SearchX size={32} className="text-muted-foreground/50" aria-hidden="true" />
  <p className="text-sm font-medium">{q ? `No results for "${q}"` : 'No entries found'}</p>
  <p className="text-xs">{q ? 'Try a different search term or clear filters.' : 'Adjust filters or wait for new crawl data.'}</p>
</div>
```

Use `SearchX` when `q` is active, `Inbox` when no data (both in lucide-react 1.14). [VERIFIED: lucide-react is installed at ^1.14.0 — both SearchX and Inbox icons exist since v0.x]

### Pattern 5: Chart Card Wrapping (D-07)

Current (VERIFIED: VolumeChart.tsx): chart sections use `<section className="space-y-2">` with no border or shadow.

Target — wrap each chart section in a card:
```tsx
<section className="rounded-lg border border-border bg-card shadow-sm p-6 space-y-3">
  <h2 className="text-sm font-semibold text-foreground">Entries over time</h2>
  <div className="h-64" aria-label="Entry volume chart">
    ...
  </div>
</section>
```

Chart colors are already correct (VERIFIED: globals.css): `--chart-1` = coral, `--chart-2` = teal, `--chart-3` = purple, `--chart-4` = green, `--chart-5` = pink. VolumeChart already reads `var(--chart-1)` etc. via the `CHART_COLORS` array. No color change needed — just card wrapping.

### Pattern 6: Table Container Standardization (D-08)

All management tables use hardcoded `border-zinc-200 bg-white bg-zinc-100` (VERIFIED: JobsTable.tsx, NotificationsTable.tsx, AlertsTable.tsx, SourcesTable.tsx). Replace with semantic CSS variables:

```tsx
// Before
<div className="rounded-md border border-zinc-200 bg-white overflow-x-auto">
  <TableHeader className="bg-zinc-100">
    <TableHead className="text-zinc-700">

// After
<div className="rounded-md border border-border bg-card overflow-x-auto">
  <TableHeader className="bg-muted/50">
    <TableHead className="text-muted-foreground">
```

Row hover: `hover:bg-zinc-50` → `hover:bg-muted/30`

### Pattern 7: Playwright Screenshot Test Setup (D-10)

Playwright is not installed. Required setup: [VERIFIED: no playwright.config.ts exists, no @playwright/test in package.json]

```typescript
// apps/dashboard/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  snapshotDir: './e2e/__snapshots__',
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,  // 2% pixel diff tolerance
    },
  },
});
```

```typescript
// apps/dashboard/e2e/visual.spec.ts
import { test, expect } from '@playwright/test';

test('entries page visual snapshot', async ({ page }) => {
  await page.goto('/entries');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('entries.png', { fullPage: true });
});

// Charts, Sources, Jobs pages similarly
```

**Port:** Next.js dev defaults to 3000. No custom port is configured. [VERIFIED: package.json "dev": "next dev", no --port flag]

**CI consideration:** D-10 specifies "Chrome headless on CI" — `linux/amd64` matches the GCP VM architecture. Playwright's `@playwright/test` installs Chromium by default. On first run, screenshots are generated as baselines. On subsequent runs, diffs are checked.

### Pattern 8: Row Density (D-04)

Shadcn Table uses `TableCell` which inherits padding from the `table.tsx` component's `td` definition. The current vitest environment is node (not jsdom), so DOM checks don't apply here.

Adding explicit padding to the `TableCell` override:
```tsx
// In EntriesTable — add py-3.5 to all TableCells
<TableCell className="py-3.5 w-[120px]">
```

Or globally in the table's base class. Since Shadcn/ui components are in `components/ui/table.tsx`, the cleanest approach for a single page is to add `[&_td]:py-3.5` to the `<Table>` wrapper or add `py-3.5` to each `TableCell` in `entries-table.tsx` specifically (since only entries needs the comfortable density per D-04 — management tables can stay compact).

### Recommended Project Structure for Phase Changes

```
apps/dashboard/
├── app/globals.css              # D-02: Update --sidebar, mark styles
├── components/layout/
│   ├── Sidebar.tsx              # D-02: bg-[#1c1814] → bg-sidebar
│   └── MobileNav.tsx            # D-02: bg-[#1c1814] → bg-sidebar (2 places)
├── components/entries/
│   ├── entries-table.tsx        # D-04: row density, D-05: mark restyling, D-06: empty state
│   ├── HeroSection.tsx          # D-02: zinc-200/zinc-900/zinc-500 → CSS vars
│   └── HeroSearchInput.tsx      # D-02/D-05: zinc-200 → border-border, focus ring
├── components/charts/
│   └── VolumeChart.tsx          # D-07: card wrappers, empty state icon
├── components/layout/PageHeader.tsx  # D-02: zinc-900/zinc-500 → foreground/muted-foreground
├── components/jobs/JobsTable.tsx     # D-08: table container CSS vars, dense→semantic
├── components/sources/SourcesTable.tsx  # D-08: same
├── components/alerts/AlertsTable.tsx    # D-08: same
├── components/notifications/NotificationsTable.tsx  # D-08: same
├── components/sources/SourceModal.tsx   # D-09: zinc-100/zinc-200 → muted/border
├── components/alerts/AlertRuleModal.tsx # D-09: same
├── lib/badge-styles.ts          # NEW: shared STATUS_STYLES and CHANNEL_STYLES
├── e2e/
│   ├── visual.spec.ts           # NEW: D-10 screenshot tests
│   └── __snapshots__/           # NEW: generated on first run
└── playwright.config.ts         # NEW: D-10
```

### Anti-Patterns to Avoid

- **Mixing @theme and direct CSS var usage:** In Tailwind v4 `@theme inline`, you MUST use `var(--token)` as the value (not the raw OKLCH). The `@theme inline` block is just a bridge. Do NOT put raw `oklch(...)` values in `@theme inline` — they go in `:root {}`.
- **Using bg-[#d8553a] instead of bg-primary:** bg-primary is already bridged via `--color-primary: var(--primary)` in @theme inline. Use `bg-primary` everywhere instead of the hardcoded hex.
- **Changing VolumeChart's CHART_COLORS array:** The array already reads `var(--chart-1)` etc., which are correctly set in globals.css. Do NOT replace these with hardcoded hex strings.
- **Forgetting MobileNav.tsx:** The dark sidebar color appears in 3 places (Sidebar.tsx line 7, MobileNav.tsx line 14, MobileNav.tsx line 19). All three must be updated simultaneously.
- **Playwright baseline generation:** On first `npx playwright test`, snapshots are generated. Committing these files is intentional — they are the baseline. Subsequent runs compare against them.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icon for empty state | Custom SVG | `lucide-react` `SearchX` / `Inbox` | Already installed at ^1.14.0 |
| Screenshot diffing | Custom pixel comparison | `@playwright/test` `toHaveScreenshot()` | Built-in, handles tolerance, CI-friendly |
| Badge color system | Custom Badge component | Shadcn Badge `variant="outline"` + className | All tables already use this pattern consistently |
| CSS variable system | Manual CSS injection | Tailwind v4 `@theme inline` + `:root {}` | Already established; both Shadcn and Recharts read from these vars |
| Form validation in modals | Custom validator | `zod` + `react-hook-form` | Already wired in SourceModal.tsx; replicate for AlertRuleModal |

**Key insight:** The existing CSS variable infrastructure already covers everything — no new abstractions needed. This phase is purely updating values in globals.css and replacing hardcoded hex/zinc classes with semantic tokens.

---

## Current State Audit

### What is DONE (commit 944bc81)

[VERIFIED: reading all source files]

| Feature | Status | Files |
|---------|--------|-------|
| Dark sidebar (`#1c1814`) | Done | Sidebar.tsx, MobileNav.tsx |
| Coral primary in globals.css | Done | globals.css `:root { --primary }` |
| Hero section on Entries | Done | HeroSection.tsx, entries page |
| PageHeader on all non-entry pages | Done | charts, sources, jobs, alerts, notifications |
| CategoryBadge with colored styles | Done | CategoryBadge.tsx |
| CategoryFilterTiles | Done | CategoryFilterTiles.tsx |
| Plus Jakarta Sans + Inter fonts | Done | layout.tsx |
| Chart colors (coral/teal/purple/green/pink) | Done | globals.css --chart-1 through --chart-5 |
| Chart reads CSS vars via CHART_COLORS | Done | VolumeChart.tsx |
| Search `<mark>` highlight logic | Done | entries-table.tsx |
| Status badges with colored outlines | Done | JobsTable.tsx, NotificationsTable.tsx, AlertsTable.tsx |

### What STILL NEEDS WORK

| Decision | Gap | Files to Change |
|----------|-----|-----------------|
| D-02: Sidebar color nudge | `bg-[#1c1814]` hardcoded in 3 places; `--sidebar` CSS var is wrong value | Sidebar.tsx, MobileNav.tsx, globals.css |
| D-02: Coral token formalization | `bg-[#d8553a]`, `text-[#d8553a]` in 8 places instead of `bg-primary`/`text-primary` | NavLinks.tsx, CategoryFilterTiles.tsx (5x), Sidebar.tsx, MobileNav.tsx (3x), HeroSection.tsx, HeroSearchInput.tsx |
| D-02: Zinc → CSS var semantic conversion | `zinc-900`/`zinc-500` in PageHeader, HeroSection; `zinc-200`/`bg-white` in table containers | PageHeader.tsx, HeroSection.tsx, HeroSearchInput.tsx, all 4 management tables, SourceModal.tsx, AlertRuleModal.tsx |
| D-04: Row density | No explicit row height; uses default compact TableRow padding | entries-table.tsx TableCell |
| D-05: Mark styling | Uses `bg-yellow-200` — not coral palette | entries-table.tsx `<mark>` className |
| D-06: Empty state icon | Plain text div, no icon | entries-table.tsx empty branch |
| D-07: Chart card wrapping | VolumeChart sections have no border/shadow card treatment | VolumeChart.tsx |
| D-08: Table container tokens | `border-zinc-200 bg-white bg-zinc-100` hardcoded | JobsTable, NotificationsTable, AlertsTable, SourcesTable |
| D-09: Modal palette | `zinc-100`/`zinc-200`/`bg-zinc-50` hardcoded in modal sections | SourceModal.tsx, AlertRuleModal.tsx |
| D-10: Playwright setup | Not installed; no config; no e2e/ directory | package.json, playwright.config.ts (NEW), e2e/ (NEW) |

---

## Common Pitfalls

### Pitfall 1: --sidebar CSS Variable Disconnect
**What goes wrong:** Updating `--sidebar` in globals.css alone does NOT change the sidebar background because Sidebar.tsx uses `bg-[#1c1814]` (hardcoded, ignores CSS var). Must update BOTH globals.css AND the className in Sidebar.tsx and MobileNav.tsx.
**Why it happens:** The dark sidebar was implemented with a hardcoded hex before token formalization was planned.
**How to avoid:** Update globals.css `--sidebar` value first, then replace all three `bg-[#1c1814]` with `bg-sidebar`.
**Warning signs:** Sidebar doesn't change color after globals.css update.

### Pitfall 2: Tailwind v4 @theme Double-Write
**What goes wrong:** Adding a new color to `:root {}` only (e.g., `--sidebar-bg: ...`) but not adding `--color-sidebar-bg: var(--sidebar-bg)` to the `@theme inline` block means `bg-sidebar-bg` utility class won't work.
**Why it happens:** Tailwind v4 requires explicit bridging — unlike v3 where you'd extend the config.
**How to avoid:** Any new token needs two lines: one in `@theme inline` and one in `:root {}`.
**Warning signs:** Tailwind class compiles to nothing; color doesn't apply despite CSS var being defined.

### Pitfall 3: Playwright First-Run Baseline
**What goes wrong:** Running `npx playwright test` before any snapshots exist causes all screenshot tests to "fail" with "screenshot is missing" — expected behavior, not a bug.
**Why it happens:** First run generates baselines; they don't exist yet.
**How to avoid:** Run `npx playwright test --update-snapshots` on first setup to generate initial baseline images. Commit the `.png` files in `e2e/__snapshots__/`.
**Warning signs:** All screenshot tests fail on first CI run.

### Pitfall 4: MobileNav Has Three Dark Background References
**What goes wrong:** Updating only Sidebar.tsx for the sidebar color nudge but leaving MobileNav.tsx with old hardcoded color.
**Why it happens:** MobileNav uses `bg-[#1c1814]` in both the `<header>` element (mobile header bar) and the `<SheetContent>` (the slide-out drawer).
**How to avoid:** Grep for all occurrences: `bg-\[#1c1814\]` → 3 results in 2 files. Fix all three.
**Warning signs:** Mobile layout shows old color while desktop sidebar shows new color.

### Pitfall 5: Chart Colors Are Already Correct
**What goes wrong:** Changing `CHART_COLORS` in VolumeChart.tsx to hardcoded hex values, bypassing the CSS variable system.
**Why it happens:** VolumeChart already correctly reads `var(--chart-1)` through `var(--chart-5)`, and those are set in globals.css to coral/teal/purple/green/pink. The only change needed for D-07 is wrapping each `<section>` in a card div.
**How to avoid:** Do NOT modify CHART_COLORS. Only add card wrapping CSS.
**Warning signs:** Chart colors break if `--chart-*` variables change.

### Pitfall 6: Shadcn Badge `base-ui` Internals
**What goes wrong:** Trying to add new Badge `variant` values to `badgeVariants` CVA — the existing Badge uses `@base-ui/react/merge-props` and `@base-ui/react/use-render`. Standard Shadcn cva variant additions work, but the component also needs the state object updated.
**Why it happens:** Shadcn v4 uses Base UI primitives, not just cva.
**How to avoid:** Don't add new variants. The `variant="outline"` + `className` override pattern (already used everywhere) is the right approach and requires no changes to badge.tsx.
**Warning signs:** Badge renders with unexpected styles if internal state doesn't include the new variant.

---

## Code Examples

Verified patterns from source files:

### Sidebar color update (D-02)

```css
/* apps/dashboard/app/globals.css — in :root {} */
/* Before: */
--sidebar: oklch(0.985 0 0);  /* near-white, unused */

/* After (pick one): */
--sidebar: oklch(0.20 0.015 65);  /* #252017 warm-dark */
/* OR */
--sidebar: oklch(0.22 0.018 45);  /* #2a2420 warm-dark */

/* sidebar-foreground, border should remain light for dark bg: */
--sidebar-foreground: oklch(0.85 0.005 80);   /* warm off-white text */
--sidebar-border: oklch(1 0 0 / 0.08);         /* white/8 border */
```

```tsx
// apps/dashboard/components/layout/Sidebar.tsx — line 7
// Before:
<aside className="hidden md:flex md:flex-col md:w-[220px] md:shrink-0 bg-[#1c1814]">
// After:
<aside className="hidden md:flex md:flex-col md:w-[220px] md:shrink-0 bg-sidebar">
```

### Mark highlight restyling (D-05)

```tsx
// apps/dashboard/components/entries/entries-table.tsx — in highlightMatches()
// Before:
className="bg-yellow-200 dark:bg-yellow-800/50 rounded-sm px-0.5"
// After:
className="bg-primary/10 rounded-sm px-0.5 underline decoration-primary decoration-2"
```

### Empty state with icon (D-06)

```tsx
// apps/dashboard/components/entries/entries-table.tsx — replace empty branch
import { Inbox, SearchX } from 'lucide-react';

if (entries.length === 0) {
  const Icon = q && q.trim() !== '' ? SearchX : Inbox;
  const title = q && q.trim() !== '' ? `No results for "${q.trim()}"` : 'No entries found';
  const subtitle = q && q.trim() !== ''
    ? 'Try a different search term or clear filters.'
    : 'Adjust filters or wait for new crawl data.';
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border p-12 gap-3 text-muted-foreground">
      <Icon size={36} className="opacity-40" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs">{subtitle}</p>
    </div>
  );
}
```

### Chart card wrapping (D-07)

```tsx
// apps/dashboard/components/charts/VolumeChart.tsx
// Wrap each <section> in a card:
<section className="rounded-lg border border-border bg-card shadow-sm p-6 space-y-3">
  <h2 className="text-sm font-semibold text-foreground">Entries over time</h2>
  <div className="h-64" aria-label="Entry volume chart">
    <ResponsiveContainer ...>
```

### Playwright config (D-10)

```typescript
// apps/dashboard/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  snapshotDir: './e2e/__snapshots__',
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
});
```

### Shared badge styles (D-08)

```typescript
// apps/dashboard/lib/badge-styles.ts (NEW)
export const JOB_STATUS_STYLES: Record<string, string> = {
  pending:  'border-amber-500 text-amber-600',
  running:  'border-blue-500 text-blue-600',
  done:     'border-green-600 text-green-600',
  failed:   'border-red-500 text-red-500',
  skipped:  'border-zinc-400 text-zinc-500',
};

export const NOTIF_STATUS_STYLES: Record<string, string> = {
  sent:   'border-green-600 text-green-600',
  failed: 'border-red-500 text-red-500',
};

export const CHANNEL_STYLES: Record<string, string> = {
  telegram: 'border-blue-500 text-blue-500',
  discord:  'border-indigo-500 text-indigo-500',
};
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `#252017` ≈ `oklch(0.20 0.015 65)` — CSS color conversion | Architecture Patterns | OKLCH approximation may be slightly off visually; planner should note that the exact OKLCH value needs visual verification against a color picker. The hex `#252017` can also be used directly as `bg-[#252017]` as a fallback. |
| A2 | lucide-react `SearchX` and `Inbox` icons exist in v1.14.0 | Don't Hand-Roll, Code Examples | If icons were renamed or removed, implementer should check the lucide-react icon list. Both icons have existed since early lucide versions. |
| A3 | Playwright `@playwright/test` v1.48+ works with Next.js 16 | Standard Stack | Playwright is framework-agnostic; the webServer config approach is the standard pattern. No known incompatibility. |

**Verified claims count:** All token structures, component contents, CSS variables, file paths, and library versions verified directly against source files in this session. Only color conversion math and icon availability are assumed.

---

## Open Questions

1. **Sidebar OKLCH exact value**
   - What we know: `#252017` is the D-02 candidate; OKLCH conversion is approximate
   - What's unclear: Whether `oklch(0.20 0.015 65)` looks exactly right vs a direct hex
   - Recommendation: Plan should allow using `bg-[#252017]` directly as a fallback if OKLCH conversion looks wrong. Both approaches work in Tailwind v4.

2. **Playwright test data**
   - What we know: Screenshot tests require a running Next.js dev server; the API must also be running for data to appear
   - What's unclear: D-10 screenshots against a real API vs mocked data. Empty states look different from populated states.
   - Recommendation: Plan for screenshots with `?mock=true` query param that returns fixture data, OR document that snapshots are "empty state" screenshots when API is not running. The planner should decide — this affects what Wave 0 sets up.

3. **entries page container discrepancy**
   - What we know: entries/page.tsx uses `container mx-auto px-4 py-6 max-w-7xl` wrapper while other pages use the DashboardLayout `px-4 md:px-8 py-6 md:py-8` directly
   - What's unclear: D-03 says no structural changes — but the entries page has an extra container wrapper not present on other pages
   - Recommendation: Leave entries page container as-is. The outer max-7xl container is consistent with the hero section design intent.

---

## Environment Availability

[VERIFIED: bash probes]

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build / dev server | Yes | (project runs) | — |
| pnpm | Package install | Yes | (turborepo uses it) | — |
| @playwright/test | D-10 visual QA | No | — | Must install via `pnpm add -D @playwright/test --filter @web-crawler/dashboard` |
| Chromium browser | D-10 screenshots | No | — | Installed via `npx playwright install chromium` |
| Next.js dev server (port 3000) | D-10 webServer | Available on start | 16.2.2 | — |

**Missing dependencies with no fallback:**
- `@playwright/test` — required for D-10. Must be installed as Wave 0 task.
- Chromium — required for D-10. `npx playwright install chromium` after adding devDependency.

**Missing dependencies with fallback:**
- None — all design work is pure CSS/TSX changes with already-installed libraries.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (existing unit tests) + Playwright (new e2e) |
| Vitest config | `apps/dashboard/vitest.config.ts` |
| Playwright config | `apps/dashboard/playwright.config.ts` (Wave 0 gap) |
| Quick run command (unit) | `pnpm test --filter @web-crawler/dashboard` (runs `vitest run`) |
| Quick run command (e2e) | `npx playwright test --project=chromium` from `apps/dashboard/` |
| Full suite command | `pnpm test && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DESIGN-01 | Variant B direction confirmed and applied | Manual visual check | — | ✅ Design decision in CONTEXT.md |
| DESIGN-02 | CSS tokens resolve correctly; `bg-primary` = coral; `bg-sidebar` = warm-dark | Unit (CSS var check) | `pnpm test` | ✅ existing vitest (extend) |
| DESIGN-03 | All pages render with correct layout; hero on entries only | e2e screenshot | `npx playwright test` | ❌ Wave 0 |
| DESIGN-04 | Component polish — row density, mark style, empty state, badges | e2e screenshot + manual | `npx playwright test` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm test --filter @web-crawler/dashboard` (unit tests, ~5s)
- **Per wave merge:** `npx playwright test --project=chromium` (screenshot comparison)
- **Phase gate:** All unit tests green + Playwright screenshots match baseline before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/dashboard/playwright.config.ts` — Playwright configuration with webServer pointing at Next.js dev
- [ ] `apps/dashboard/e2e/visual.spec.ts` — Screenshot tests for Entries, Charts, Sources, Jobs pages
- [ ] `apps/dashboard/e2e/__snapshots__/` — Generated on first `--update-snapshots` run; must be committed
- [ ] Package install: `pnpm add -D @playwright/test --filter @web-crawler/dashboard` + `npx playwright install chromium`

---

## Security Domain

Security enforcement is not applicable to this phase — it is purely visual/CSS/TSX changes with no new data flows, authentication, or external service integrations. No ASVS categories apply. No new user inputs or outputs are introduced.

---

## Sources

### Primary (HIGH confidence — all verified by direct file read this session)

| Source | Topics Verified |
|--------|-----------------|
| `apps/dashboard/app/globals.css` | Full CSS token structure, @theme inline pattern, chart/sidebar/primary values |
| `apps/dashboard/package.json` | Exact library versions: Tailwind 4.2.4, Next.js 16.2.2, recharts 3.8.0, vitest 4.1.4, lucide-react 1.14.0 |
| `apps/dashboard/components/layout/Sidebar.tsx` | bg-[#1c1814] hardcoded, sidebar structure |
| `apps/dashboard/components/layout/MobileNav.tsx` | Two bg-[#1c1814] occurrences + three text-[#d8553a] |
| `apps/dashboard/components/layout/NavLinks.tsx` | bg-[#d8553a] for active nav item |
| `apps/dashboard/components/entries/entries-table.tsx` | mark styling (bg-yellow-200), empty state (no icon), row padding |
| `apps/dashboard/components/entries/HeroSection.tsx` | zinc-200/zinc-900/zinc-500 hardcoded, text-[#d8553a] |
| `apps/dashboard/components/entries/HeroSearchInput.tsx` | focus:ring-[#d8553a]/40 focus:border-[#d8553a], zinc hardcoded |
| `apps/dashboard/components/entries/CategoryFilterTiles.tsx` | bg-[#d8553a] x5 for active state |
| `apps/dashboard/components/charts/VolumeChart.tsx` | CHART_COLORS reads var(--chart-*), no card wrapping, empty state text-only |
| `apps/dashboard/components/jobs/JobsTable.tsx` | STATUS_STYLES pattern, zinc hardcoded |
| `apps/dashboard/components/notifications/NotificationsTable.tsx` | Badge outline + className pattern |
| `apps/dashboard/components/alerts/AlertsTable.tsx` | conditionBadgeClass/channelBadgeClass functions |
| `apps/dashboard/components/sources/SourcesTable.tsx` | zinc hardcoded in container |
| `apps/dashboard/components/sources/SourceModal.tsx` | zinc-100/zinc-200 in section headers, modal structure |
| `apps/dashboard/components/ui/badge.tsx` | @base-ui/react internals, variant="outline" pattern |
| `apps/dashboard/components/ui/button.tsx` | variant="default" → bg-primary |
| `apps/dashboard/app/layout.tsx` | Font variables confirmed |
| `.planning/phases/13-frontend-design-refresh/13-CONTEXT.md` | All decisions D-01 through D-10 |
| `design/design-v1/wireframes.jsx` | Variant B wireframe: hero + tiles + dark sidebar + coral accent |
| `design/design-v1/app.jsx` | Palette config: accent #d8553a, vibe pencil (#fbf8f2 paper, #1a1714 ink) |

### Secondary (MEDIUM confidence)

- CSS color conversion `#252017` → OKLCH approximate [ASSUMED: A1] — verify visually during implementation

### Tertiary (LOW confidence — none)

No low-confidence claims in this research.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all versions verified from package.json
- Architecture: HIGH — all patterns verified from direct source file reads
- Pitfalls: HIGH — identified from direct observation of code gaps
- Environment: HIGH — bash probes confirmed no playwright

**Research date:** 2026-05-26
**Valid until:** 2026-07-01 (stable stack; no fast-moving dependencies)
