---
plan: 13-03
phase: 13
status: complete
started: 2026-05-26
completed: 2026-05-26
tasks_completed: 3
tasks_total: 3
self_check: PASSED
---

# Plan 13-03 Summary — Secondary Surfaces Polish (D-07, D-08, D-09)

## What Was Built

Three coordinated change bundles applied to all non-entries dashboard surfaces, establishing consistent Variant B palette across charts, management tables, and modals.

### Task 1 — Shared badge-styles.ts + Management Table Refactor (D-08)

**New file created:** `apps/dashboard/lib/badge-styles.ts`

Exports five typed badge-className records consumed across all management tables:
- `JOB_STATUS_STYLES` — pending/running/done/failed/skipped
- `NOTIF_STATUS_STYLES` — sent/failed
- `CHANNEL_STYLES` — telegram/discord
- `ALERT_CONDITION_STYLES` — new_item/field_changed/threshold
- `ACTIVE_INACTIVE_STYLES` — active/inactive (shared between Sources and Alerts)

**Four management tables refactored (zinc → semantic tokens):**

| File | Container | Header | Row hover | Badge source |
|------|-----------|--------|-----------|--------------|
| `JobsTable.tsx` | `border-border bg-card` | `bg-muted/50` | `hover:bg-muted/30` | `JOB_STATUS_STYLES` |
| `NotificationsTable.tsx` | `border-border bg-card` | `bg-muted/50` | `hover:bg-muted/30` | `NOTIF_STATUS_STYLES`, `CHANNEL_STYLES` |
| `AlertsTable.tsx` | `border-border bg-card` | `bg-muted/50` | `hover:bg-muted/30` | `ALERT_CONDITION_STYLES`, `CHANNEL_STYLES`, `ACTIVE_INACTIVE_STYLES` |
| `SourcesTable.tsx` | `border-border bg-card` | `bg-muted/50` | `hover:bg-muted/30` | `ACTIVE_INACTIVE_STYLES` |

**JobsTable Retry button:** `variant="outline"` → `variant="default"` (coral primary CTA per D-08 spec).

### Task 2 — VolumeChart Card Wrapping + Semantic Tokens (D-07)

`apps/dashboard/components/charts/VolumeChart.tsx`:

- Added `import { BarChart3 } from 'lucide-react'`
- Empty state: replaced plain centered text with icon-led empty state card matching UI-SPEC pattern:
  ```
  border-border rounded-lg p-12 + BarChart3 icon + "No data to display" heading + subtext
  ```
- Both `<section>` elements (Entries over time, Per-source breakdown) wrapped in:
  ```
  rounded-lg border border-border bg-card shadow-sm p-6 space-y-3
  ```
- Headings: `text-zinc-700` → `text-foreground`
- **CHART_COLORS array preserved untouched** — `var(--chart-1)` through `var(--chart-5)` unchanged.

### Task 3 — Modal Palette + Button Labels (D-09)

**SourceModal.tsx and AlertRuleModal.tsx** — full zinc-to-semantic migration:

| Old class | New class |
|-----------|-----------|
| `border-zinc-100` (header/footer divider) | `border-border` |
| `border-zinc-200 bg-zinc-50/50` (section cards) | `border-border bg-muted/40` |
| `border-zinc-200` (section headers) | `border-border` |
| `text-zinc-500` (section labels, description) | `text-muted-foreground` |
| `text-zinc-700` (Field labels, Status label) | `text-foreground` |
| `text-zinc-400` (hints) | `text-muted-foreground` |
| `text-zinc-900` (dialog title) | `text-foreground` |
| `border-zinc-300 accent-zinc-900` (checkbox) | `border-input accent-primary` |
| `bg-zinc-50/50` (footer bg) | `bg-muted/40` |
| `text-zinc-600` (secondary button) | `text-muted-foreground` |
| `text-zinc-400` (select placeholder) | `text-muted-foreground` |

**Button labels (UI-SPEC Copywriting Contract):**
- Primary: `"Save Source"` / `"Save Rule"` (constant for create and edit — no more "Create source" / "Save changes")
- Secondary: Dynamic via `isDirty` — `"Discard Changes"` when form is dirty, `"Close"` when pristine
- `formState: { errors, isDirty }` added to both `useForm` destructures

**Error boxes preserved:** `bg-red-50 border-red-200` kept (semantic error palette, not converted to muted)

## Verification Results

```
pnpm type-check → ✓ 0 TypeScript errors
pnpm test       → ✓ 55 tests passed (8 files, 4 todo)
```

Spot-checks:
- `lib/badge-styles.ts` exports all 5 records ✓
- All 4 management tables import from `@/lib/badge-styles` ✓
- No `border-zinc-200 bg-white` or `bg-zinc-100` in management tables ✓
- VolumeChart: 2× `rounded-lg border border-border bg-card shadow-sm p-6 space-y-3` ✓
- VolumeChart: `var(--chart-1)` through `var(--chart-5)` preserved ✓
- SourceModal: contains "Save Source", "Discard Changes", `isDirty` ✓
- AlertRuleModal: contains "Save Rule", "Discard Changes", `isDirty` ✓
- No `>Cancel<` in either modal ✓

## Commits

- `f0b05fc` feat(13-03): create badge-styles.ts and wire into four management tables (D-08)
- `a3427d7` feat(13-03): wrap VolumeChart in cards and refactor modal palettes + labels (D-07, D-09)

## key-files

### created
- apps/dashboard/lib/badge-styles.ts

### modified
- apps/dashboard/components/jobs/JobsTable.tsx
- apps/dashboard/components/notifications/NotificationsTable.tsx
- apps/dashboard/components/alerts/AlertsTable.tsx
- apps/dashboard/components/sources/SourcesTable.tsx
- apps/dashboard/components/charts/VolumeChart.tsx
- apps/dashboard/components/sources/SourceModal.tsx
- apps/dashboard/components/alerts/AlertRuleModal.tsx
