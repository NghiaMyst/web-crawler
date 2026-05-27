---
phase: 13-frontend-design-refresh
reviewed: 2026-05-26T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - apps/dashboard/app/globals.css
  - apps/dashboard/lib/badge-styles.ts
  - apps/dashboard/components/layout/Sidebar.tsx
  - apps/dashboard/components/layout/MobileNav.tsx
  - apps/dashboard/components/layout/NavLinks.tsx
  - apps/dashboard/components/layout/PageHeader.tsx
  - apps/dashboard/components/entries/HeroSection.tsx
  - apps/dashboard/components/entries/CategoryFilterTiles.tsx
  - apps/dashboard/components/entries/entries-table.tsx
  - apps/dashboard/components/search/HeroSearchInput.tsx
  - apps/dashboard/components/charts/VolumeChart.tsx
  - apps/dashboard/components/jobs/JobsTable.tsx
  - apps/dashboard/components/notifications/NotificationsTable.tsx
  - apps/dashboard/components/alerts/AlertsTable.tsx
  - apps/dashboard/components/sources/SourcesTable.tsx
  - apps/dashboard/components/sources/SourceModal.tsx
  - apps/dashboard/components/alerts/AlertRuleModal.tsx
  - apps/dashboard/playwright.config.ts
  - apps/dashboard/e2e/visual.spec.ts
  - apps/dashboard/package.json
  - apps/dashboard/vitest.config.ts
findings:
  critical: 0
  warning: 3
  info: 7
  total: 10
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-05-26
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

This was a pure visual/CSS design refresh: CSS token formalization (coral + warm-dark palette), entries table polish, shared `badge-styles.ts` module, semantic tokens on management tables, VolumeChart card wrapping, and Playwright visual baseline setup. No new data flows, auth, or API integrations.

The implementation is well-structured overall. Badge styles are correctly typed as exhaustive `Record<UnionType, string>` maps, the `escapeRegExp` in `entries-table.tsx` is properly applied (no ReDoS risk), no user content is rendered via `innerHTML` or other unsafe mechanisms, and the Playwright/Vitest configs are both sane.

Three findings warrant fixing before shipping:

1. **Category ID mismatch (WR-01):** `CategoryFilterTiles` uses `id: 'games'` (plural) but the backend schema enum is `'game'` (singular). Filtering by the Games tile produces zero results because no entry stored in the DB will have `category === 'games'`.

2. **Escape key does not clear URL search param (WR-02):** In `HeroSearchInput`, `Escape` clears the local input state but does not call `navigateWithQ('')`, so the `?q=` param stays in the URL and filtered results remain visible behind an empty input box.

3. **Duplicate `aria-label` on two chart regions (WR-03):** Both chart sections in `VolumeChart` carry `aria-label="Entry volume chart"`, making them indistinguishable to screen readers.

The remaining findings are informational: dead code (`void pathname`), minor type-annotation inconsistency in `ACTIVE_INACTIVE_STYLES`, hardcoded hex colors that bypass the CSS token system, and a self-referential CSS variable pattern in `globals.css` that works at runtime but is confusing.

---

## Warnings

### WR-01: Games category filter never matches — `'games'` vs `'game'` mismatch

**File:** `apps/dashboard/components/entries/CategoryFilterTiles.tsx:31`

**Issue:** The Games tile uses `id: 'games'` (plural). The backend `sourceCategoryEnum` defines the valid value as `'game'` (singular), which is what is written to the database. When a user clicks the Games tile, the URL becomes `?category=games`, but every entry from a games source has `category: 'game'`, so the filter returns zero results. `CategoryBadge.tsx` (out of scope but same root) also has this mismatch, causing game entries to render with the default grey badge instead of the emerald color.

**Fix:** Change the tile `id` to match the backend enum value:

```tsx
// CategoryFilterTiles.tsx — line 31
{
  id: 'game',       // was 'games'
  label: 'Games',
  Icon: Gamepad2,
  colorInactive: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
  colorActive: 'bg-[#d8553a] border-[#d8553a] text-white',
},
```

Also fix the corresponding key in `CategoryBadge.tsx` (not in Phase 13 scope but same root cause):

```tsx
// CategoryBadge.tsx — line 7
game: 'bg-emerald-100 text-emerald-700 border-emerald-200',  // was 'games'
```

---

### WR-02: Escape key clears input text but leaves URL `?q=` param intact

**File:** `apps/dashboard/components/search/HeroSearchInput.tsx:35-38`

**Issue:** Pressing `Escape` calls `setValue('')`, which empties the visible input. It does not call `navigateWithQ('')`, so `?q=<previous-query>` remains in the URL and the server-filtered results stay on screen. The user sees an empty search box but filtered (stale) data — a confusing state.

**Fix:**

```tsx
} else if (e.key === 'Escape') {
  e.preventDefault();
  setValue('');
  navigateWithQ('');  // clear the URL param too
}
```

---

### WR-03: Duplicate `aria-label` makes two chart regions indistinguishable to screen readers

**File:** `apps/dashboard/components/charts/VolumeChart.tsx:84,109`

**Issue:** Both chart `<div>` containers share `aria-label="Entry volume chart"`. Assistive technologies that enumerate labeled regions (e.g., NVDA Elements List, VO Rotor) will present two regions with identical names, giving no way to distinguish the line chart from the bar chart.

**Fix:** Match the `aria-label` to the nearby `<h2>` heading in each section:

```tsx
// Line chart section (line 84)
<div className="h-64" aria-label="Entries over time — line chart">

// Bar chart section (line 109)
<div className="h-64" aria-label="Per-source breakdown — bar chart">
```

---

## Info

### IN-01: Dead code — `usePathname()` imported and voided in two components

**Files:**
- `apps/dashboard/components/entries/CategoryFilterTiles.tsx:48,70`
- `apps/dashboard/components/search/HeroSearchInput.tsx:11,41`

**Issue:** Both components call `usePathname()`, assign the result to `pathname`, then immediately discard it via `void pathname`. The hook return value is never used for routing or rendering. In Next.js App Router, URL changes trigger component re-renders automatically, so the hook call is not needed to force updates. This pattern adds an unnecessary hook invocation and confuses readers.

**Fix:** Remove both the import and the call in each file:

```tsx
// Remove from imports:
// usePathname,

// Remove from component body:
// const pathname = usePathname();
// void pathname;
```

---

### IN-02: `ACTIVE_INACTIVE_STYLES` lacks an exhaustive `Record<>` type annotation

**File:** `apps/dashboard/lib/badge-styles.ts:39-42`

**Issue:** `JOB_STATUS_STYLES`, `NOTIF_STATUS_STYLES`, `CHANNEL_STYLES`, and `ALERT_CONDITION_STYLES` are all typed as `Record<SomeUnion, string>`, which means TypeScript will error if a union member is missing. `ACTIVE_INACTIVE_STYLES` uses `as const` only, so there is no compile-time exhaustiveness check. If a third active-state value were ever added to the union, the omission would be silent.

**Fix:** Since the active/inactive state is a boolean-driven boolean (not a string union), the simplest fix is to make the intent explicit with a `Record`:

```ts
export const ACTIVE_INACTIVE_STYLES: Record<'active' | 'inactive', string> = {
  active:   'border-green-600 text-green-600 bg-green-50',
  inactive: 'border-red-500 text-red-500 bg-red-50',
};
```

---

### IN-03: Hardcoded `#d8553a` hex bypasses the `--primary` CSS token

**Files:**
- `apps/dashboard/components/layout/Sidebar.tsx:13`
- `apps/dashboard/components/layout/MobileNav.tsx:23,35`
- `apps/dashboard/components/layout/NavLinks.tsx:31`
- `apps/dashboard/components/entries/CategoryFilterTiles.tsx:14,21,28,35,42`
- `apps/dashboard/components/entries/HeroSection.tsx:18`
- `apps/dashboard/components/search/HeroSearchInput.tsx:62`

**Issue:** `#d8553a` is used as a Tailwind arbitrary value (`bg-[#d8553a]`, `text-[#d8553a]`, `border-[#d8553a]`, `ring-[#d8553a]/40`) rather than via the `--primary` CSS token defined in `globals.css`. The CSS token system was set up precisely to make palette changes single-source. If the coral shade is ever adjusted, all these hardcoded values need manual hunting.

**Fix:** Replace arbitrary hex values with Tailwind semantic utilities that resolve through `--primary`:

```tsx
// Instead of: bg-[#d8553a] text-white
bg-primary text-primary-foreground

// Instead of: text-[#d8553a]
text-primary

// Instead of: border-[#d8553a]
border-primary

// Instead of: focus:ring-[#d8553a]/40 focus:border-[#d8553a]
focus:ring-primary/40 focus:border-primary
```

Note: The sidebar background `bg-[#1c1814]` is intentionally distinct from the page background and has no semantic token — that one is acceptable as-is.

---

### IN-04: Self-referential CSS variable declarations in `globals.css`

**File:** `apps/dashboard/app/globals.css:18-19`

**Issue:** The `@theme inline` block contains:

```css
--font-heading: var(--font-heading);
--font-sans:    var(--font-sans);
```

These are self-references. At runtime they work because Next.js font optimization injects the actual font variable values (e.g., `--font-sans: '__Inter_...'`) onto `<html>` before the browser evaluates `@theme`, so `var(--font-sans)` resolves to the Next.js-injected value. However, reading this in isolation looks like an infinite self-reference and is likely to confuse future maintainers. A comment explaining the indirection would suffice:

```css
/* Next.js injects --font-sans / --font-heading onto <html> via its font optimization.
   These @theme rules expose them as Tailwind CSS utilities (font-sans, font-heading). */
--font-heading: var(--font-heading);
--font-sans:    var(--font-sans);
```

---

### IN-05: Management tables render an empty `<tbody>` with no empty-state UI

**Files:**
- `apps/dashboard/components/jobs/JobsTable.tsx`
- `apps/dashboard/components/notifications/NotificationsTable.tsx`
- `apps/dashboard/components/alerts/AlertsTable.tsx`
- `apps/dashboard/components/sources/SourcesTable.tsx`

**Issue:** `EntriesTable` has a well-crafted empty state (icon + heading + sub-copy). The four management tables do not guard against an empty array; they render a table with headers and an empty `<tbody>`, which is visually bare. This is a UX inconsistency, not a crash risk.

**Fix:** Add a guard at the top of each table component, mirroring `EntriesTable`:

```tsx
if (jobs.length === 0) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border p-12 gap-3 text-muted-foreground">
      <ListTodo size={36} className="opacity-40" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">No jobs yet</p>
    </div>
  );
}
```

---

### IN-06: `AlertRuleModal` uses unsafe path casts for discriminated-union fields

**File:** `apps/dashboard/components/alerts/AlertRuleModal.tsx:246,263`

**Issue:** The nested field paths `condition.fieldPath` and `condition.threshold` are registered with:

```tsx
{...register('condition.fieldPath' as keyof AlertRuleFormData)}
{...register('condition.threshold' as keyof AlertRuleFormData, { valueAsNumber: true })}
```

`'condition.fieldPath'` is not a key of `AlertRuleFormData`; the cast silences the TypeScript error. React Hook Form's `register` does support dot-notation strings for nested fields as a separate overload; the correct type-safe approach is to use `register` with the full dot-notation path without a cast, or to use `useFormContext` inside a sub-component.

**Fix:** Remove the `as keyof AlertRuleFormData` cast and use the dot-notation directly (RHF accepts it at runtime; the typing issue is in the generic):

```tsx
// Accept the type widening or use a typed helper:
{...register('condition.fieldPath' as `condition.fieldPath`)}
// Or suppress only this specific cast with a comment explaining why:
// eslint-disable-next-line @typescript-eslint/no-explicit-any
{...(register as any)('condition.fieldPath')}
```

The current cast is not unsafe at runtime but it suppresses what could be a meaningful type error if the schema changes.

---

### IN-07: Visual spec uses a fixed `waitForTimeout(500)` for font/Suspense settlement

**File:** `apps/dashboard/e2e/visual.spec.ts:26`

**Issue:** After `waitForLoadState('networkidle')`, the spec waits an additional 500 ms for "font loading + suspense fallback resolution." Fixed delays are a known source of flakiness in CI (slow machines may need more; fast machines waste time). If a Suspense boundary takes longer than 500 ms to resolve (e.g., under high CI load), the snapshot will capture a skeleton/loading state and produce a false positive diff.

**Fix:** Replace the fixed delay with a condition that waits for the Suspense content to appear. For the entries page, wait for the search input or a category tile to be visible:

```ts
await page.goto(path);
await page.waitForLoadState('networkidle');
// Wait for the first interactive element rather than a fixed delay:
await page.locator('body').waitFor({ state: 'visible' });
// For entries specifically, wait for hero search to resolve:
if (path === '/entries') {
  await page.locator('input[aria-label="Search entries"]').waitFor({ state: 'visible' });
}
await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
```

If a generic wait-condition is preferred across all pages, `page.waitForFunction(() => document.fonts.ready)` ensures fonts are loaded.

---

_Reviewed: 2026-05-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
