---
phase: 13-frontend-design-refresh
verified: 2026-05-27T08:00:00Z
status: human_needed
score: 22/23 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 15/23
  gaps_closed:
    - "globals.css --sidebar token restored to oklch(0.20 0.015 65) in :root block"
    - "Sidebar.tsx bg-[#1c1814] replaced with bg-sidebar; border-white/8 replaced with border-sidebar-border"
    - "MobileNav.tsx bg-[#1c1814] x2 replaced with bg-sidebar; text-[#d8553a] x2 replaced with text-primary"
    - "NavLinks.tsx active state bg-[#d8553a] text-white replaced with bg-primary text-primary-foreground"
    - "PageHeader.tsx text-zinc-900 replaced with text-foreground; text-zinc-500 replaced with text-muted-foreground"
    - "HeroSection.tsx border-zinc-200 bg-white replaced with border-border bg-card; text-zinc-900 -> text-foreground; text-[#d8553a] -> text-primary; text-zinc-500 -> text-muted-foreground"
    - "CategoryFilterTiles.tsx all 5 bg-[#d8553a] border-[#d8553a] text-white replaced with bg-primary border-primary text-primary-foreground"
    - "HeroSearchInput.tsx zinc-* and hex focus ring replaced with semantic tokens; focus:ring-primary/40 focus:border-primary"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Re-examine Playwright baselines after commit 1ff606b re-applied sidebar tokens. Open the four committed PNG files in apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/ (entries-linux.png, charts-linux.png, sources-linux.png, jobs-linux.png). Confirm sidebar shows warm-dark background with coral 'crawler' brand text and coral active nav item. Run pnpm test:e2e:update from apps/dashboard/ to regenerate baselines capturing the now-correct warm-dark sidebar, then visually approve the new baselines."
    expected: "Sidebar renders #252017 warm-dark background (via --sidebar: oklch(0.20 0.015 65)). Active nav item is coral fill (via bg-primary). Brand 'crawler' text is coral. Hero card uses border-border bg-card. All four pages reflect Variant B palette as defined in Phase 13 goals."
    why_human: "The four existing baseline PNGs were captured in commit 469ee6e BEFORE commit 1ff606b re-applied the sidebar tokens — they locked in the reverted (hardcoded bg-[#1c1814]) state. These baselines must be regenerated with pnpm test:e2e:update so they capture the now-correct semantic-token sidebar. Human approval is required per Plan 04 Task 3 (blocking checkpoint) to confirm the regenerated Variant B images match design intent before the new PNGs are committed."
---

# Phase 13: Frontend Design Refresh — Verification Report (Re-verification)

**Phase Goal:** Refresh the dashboard's visual design — formalize the Variant B coral+warm-dark palette into CSS tokens, apply semantic classes throughout all components, polish data tables and modals with consistent styling, and capture Playwright visual baselines for regression protection.
**Verified:** 2026-05-27T08:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure in commit 1ff606b

---

## Re-verification Summary

Commit `1ff606b` (fix(13-01): re-apply sidebar tokens + semantic class swap lost in wave-2 merge) resolved all 4 gaps from the first verification run. All Plan 01 token formalization work is now correctly applied in the codebase.

**Gaps closed (8 items across 8 files):**
- `globals.css` :root `--sidebar` restored to `oklch(0.20 0.015 65)`, all related sidebar tokens updated
- `Sidebar.tsx` uses `bg-sidebar`, `border-sidebar-border`, `text-primary`, `text-sidebar-foreground`
- `MobileNav.tsx` uses `bg-sidebar` x2, `border-sidebar-border` x2, `text-primary` x2
- `NavLinks.tsx` active state uses `bg-primary text-primary-foreground`
- `PageHeader.tsx` uses `text-foreground`, `text-muted-foreground`
- `HeroSection.tsx` uses `border-border bg-card`, `text-foreground`, `text-primary`, `text-muted-foreground`
- `CategoryFilterTiles.tsx` all 5 active states use `bg-primary border-primary text-primary-foreground`
- `HeroSearchInput.tsx` uses `focus:ring-primary/40 focus:border-primary` and semantic tokens throughout

**One human verification item remains:** The four Playwright baseline PNGs were generated before `1ff606b` and depict the old hardcoded sidebar colors. They must be regenerated to capture the corrected Variant B design, then approved by the user.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Sidebar background renders warm-dark via --sidebar token (bg-sidebar) | VERIFIED | globals.css line 85: `--sidebar: oklch(0.20 0.015 65)` in :root. Sidebar.tsx line 7: `bg-sidebar`. MobileNav.tsx lines 14, 19: `bg-sidebar` x2 |
| 2 | No bg-[#1c1814] / text-[#d8553a] / bg-[#d8553a] remain in layout/entries/search dirs | VERIFIED | grep returns zero matches across all 7 Plan 01 component files |
| 3 | Active nav item uses bg-primary text-primary-foreground (not hardcoded hex) | VERIFIED | NavLinks.tsx line 31: `'bg-primary text-primary-foreground font-medium'` |
| 4 | PageHeader / HeroSection / HeroSearchInput use semantic tokens — no zinc-* or hex hardcodes | VERIFIED | PageHeader: `text-foreground`, `text-muted-foreground`. HeroSection: `border-border bg-card`, `text-foreground`, `text-primary`, `text-muted-foreground`. HeroSearchInput: `focus:ring-primary/40`, `focus:border-primary`, semantic throughout — zero zinc/hex matches |
| 5 | Dashboard builds with zero TypeScript errors | VERIFIED | `pnpm --filter @web-crawler/dashboard type-check` exits 0 |
| 6 | Entries table cells use py-3 density (~44px row height) | VERIFIED | entries-table.tsx: 4 TableCell elements each have py-3 |
| 7 | Matched substrings render in mark with bg-primary/10 + decoration-primary decoration-2 | VERIFIED | entries-table.tsx: `className="bg-primary/10 rounded-sm px-0.5 underline decoration-primary decoration-2..."` |
| 8 | Empty state (no q): centered Inbox icon + "No entries found" + subcopy | VERIFIED | entries-table.tsx: `const Icon = hasQuery ? SearchX : Inbox`; "No entries found" heading, "Adjust filters or wait for new crawl data." subcopy |
| 9 | Empty state (q set): centered SearchX icon + 'No results for "{q}"' + subcopy | VERIFIED | Same block — hasQuery path uses SearchX; copy matches UI-SPEC |
| 10 | Empty state container uses semantic CSS-variable classes — no zinc-* | VERIFIED | border-border, text-muted-foreground, text-foreground — zero zinc classes |
| 11 | Dashboard builds with zero TypeScript errors (Plan 02) | VERIFIED | type-check exits 0; entries-table.tsx lucide-react imports compile correctly |
| 12 | Charts sections wrapped in cards (border-border, bg-card, shadow-sm, rounded-lg, p-6) | VERIFIED | VolumeChart.tsx: `"rounded-lg border border-border bg-card shadow-sm p-6 space-y-3"` on both sections — grep count = 2 |
| 13 | Chart series colors resolve via var(--chart-1) through var(--chart-5) | VERIFIED | VolumeChart.tsx CHART_COLORS array uses var(--chart-1)..var(--chart-5) unchanged |
| 14 | All four management tables use border-border bg-card + bg-muted/50 + hover:bg-muted/30 | VERIFIED | JobsTable, NotificationsTable, AlertsTable, SourcesTable all use border-border bg-card container; bg-muted/50 header; hover:bg-muted/30 rows |
| 15 | Job Retry button is variant="default" (coral primary fill) | VERIFIED | JobsTable.tsx: `variant="default"` on Retry button |
| 16 | Badge styles exported from lib/badge-styles.ts; four tables import from it | VERIFIED | badge-styles.ts exports 5 typed records (JOB_STATUS_STYLES, NOTIF_STATUS_STYLES, CHANNEL_STYLES, ALERT_CONDITION_STYLES, ACTIVE_INACTIVE_STYLES); all 4 tables import from @/lib/badge-styles |
| 17 | Modal section headers/footers use bg-muted / border-border / text tokens — no zinc hardcodes | VERIFIED | SourceModal.tsx and AlertRuleModal.tsx: zero zinc-100/200/300/500/700/900 matches; semantic tokens throughout |
| 18 | Modal primary labels: "Save Source" / "Save Rule"; secondary: "Discard Changes" / "Close" via isDirty | VERIFIED | SourceModal.tsx: "Save Source" (1 match), isDirty (2 matches), "Discard Changes". AlertRuleModal.tsx: "Save Rule" (1 match), isDirty (2 matches), "Discard Changes" |
| 19 | @playwright/test installed in apps/dashboard/package.json | VERIFIED | package.json: "@playwright/test": "^1.60.0" in devDependencies; test:e2e and test:e2e:update scripts present |
| 20 | playwright.config.ts exists with correct config | VERIFIED | testDir: './e2e', viewport: 1280x800, maxDiffPixelRatio: 0.02, webServer.command: 'pnpm dev' |
| 21 | e2e/visual.spec.ts exists with four screenshot tests | VERIFIED | PAGES array with /entries, /charts, /sources, /jobs; toHaveScreenshot for each |
| 22 | Four baseline PNGs exist in e2e/__snapshots__/ each >= 5KB | VERIFIED | entries-linux.png, charts-linux.png, sources-linux.png, jobs-linux.png — all present; find -size +4k returns 4 |
| 23 | Baselines depict the corrected Variant B palette (warm-dark sidebar via CSS token) | HUMAN NEEDED | The 4 existing PNGs were captured in commit 469ee6e before commit 1ff606b re-applied sidebar tokens. They show the hardcoded bg-[#1c1814] state. Baselines must be regenerated with pnpm test:e2e:update and human-approved. |

**Score:** 22/23 truths verified

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dashboard/app/globals.css` | --sidebar: oklch(0.20 0.015 65) in :root | VERIFIED | Line 85 in :root block — correct warm-dark value |
| `apps/dashboard/components/layout/Sidebar.tsx` | bg-sidebar, text-primary, border-sidebar-border | VERIFIED | Line 7: bg-sidebar; line 13: text-primary; lines 9, 19: border-sidebar-border |
| `apps/dashboard/components/layout/MobileNav.tsx` | bg-sidebar x2, text-primary x2, border-sidebar-border | VERIFIED | Lines 14, 19: bg-sidebar; lines 23, 35: text-primary; lines 20, 26: border-sidebar-border |
| `apps/dashboard/components/layout/NavLinks.tsx` | bg-primary text-primary-foreground (active) | VERIFIED | Line 31: bg-primary text-primary-foreground; line 32: text-sidebar-foreground/70 hover:bg-sidebar-accent |
| `apps/dashboard/components/entries/CategoryFilterTiles.tsx` | bg-primary border-primary text-primary-foreground x5 | VERIFIED | All 5 CATEGORIES entries: bg-primary border-primary text-primary-foreground |
| `apps/dashboard/components/entries/HeroSection.tsx` | border-border bg-card, text-foreground, text-primary, text-muted-foreground | VERIFIED | All four semantic replacements present; zero zinc/hex matches |
| `apps/dashboard/components/search/HeroSearchInput.tsx` | focus:ring-primary/40 focus:border-primary, semantic tokens | VERIFIED | Focus ring and border use primary; all zinc tokens replaced |
| `apps/dashboard/components/layout/PageHeader.tsx` | text-foreground, text-muted-foreground | VERIFIED | text-foreground on h1; text-muted-foreground on description; zero zinc matches |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dashboard/components/entries/entries-table.tsx` | py-3, bg-primary/10, Inbox/SearchX icons | VERIFIED | All three changes present and wired correctly |

### Plan 03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dashboard/lib/badge-styles.ts` | 5 typed exports | VERIFIED | JOB_STATUS_STYLES, NOTIF_STATUS_STYLES, CHANNEL_STYLES, ALERT_CONDITION_STYLES, ACTIVE_INACTIVE_STYLES |
| `apps/dashboard/components/charts/VolumeChart.tsx` | rounded-lg border border-border bg-card shadow-sm p-6 x2 | VERIFIED | Both chart sections wrapped; CHART_COLORS preserved |
| `apps/dashboard/components/jobs/JobsTable.tsx` | JOB_STATUS_STYLES import, variant="default" | VERIFIED | Import and Retry button variant correct |
| `apps/dashboard/components/notifications/NotificationsTable.tsx` | @/lib/badge-styles import | VERIFIED | Import present and used |
| `apps/dashboard/components/alerts/AlertsTable.tsx` | @/lib/badge-styles import | VERIFIED | Import present and used |
| `apps/dashboard/components/sources/SourcesTable.tsx` | border-border bg-card | VERIFIED | Container uses semantic tokens |
| `apps/dashboard/components/sources/SourceModal.tsx` | "Save Source", isDirty, semantic tokens | VERIFIED | All three present; zero zinc matches |
| `apps/dashboard/components/alerts/AlertRuleModal.tsx` | "Save Rule", isDirty, semantic tokens | VERIFIED | All three present; zero zinc matches |

### Plan 04 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dashboard/playwright.config.ts` | maxDiffPixelRatio: 0.02, 1280x800, webServer | VERIFIED | All required config fields present |
| `apps/dashboard/e2e/visual.spec.ts` | toHaveScreenshot, 4 routes | VERIFIED | All four page routes present |
| `apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/` | 4 baseline PNGs >= 5KB | VERIFIED (stale) | 4 PNGs present at ~31KB but captured before 1ff606b — need regeneration |
| `apps/dashboard/package.json` | @playwright/test ^1.60.0 + test:e2e script | VERIFIED | Both present |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Sidebar.tsx | globals.css --sidebar | bg-sidebar Tailwind utility | WIRED | Sidebar.tsx uses bg-sidebar; globals.css :root has --sidebar: oklch(0.20 0.015 65) |
| NavLinks.tsx | globals.css --primary | bg-primary utility | WIRED | Line 31: bg-primary text-primary-foreground |
| HeroSection.tsx | globals.css --foreground/--primary | text-foreground / text-primary | WIRED | text-foreground on heading; text-primary on "crawled?" accent |
| entries-table.tsx | globals.css --primary | bg-primary/10 + decoration-primary | WIRED | mark element correctly uses CSS-variable-backed classes |
| JobsTable.tsx | lib/badge-styles.ts | import { JOB_STATUS_STYLES } | WIRED | Import present and used on Badge className |
| NotificationsTable.tsx | lib/badge-styles.ts | import { NOTIF_STATUS_STYLES, CHANNEL_STYLES } | WIRED | Import present and used |
| AlertsTable.tsx | lib/badge-styles.ts | import { ALERT_CONDITION_STYLES, CHANNEL_STYLES } | WIRED | Import present and used |
| VolumeChart.tsx | globals.css --chart-1..5 | var(--chart-1) in CHART_COLORS | WIRED | CHART_COLORS array preserved unchanged |
| playwright.config.ts | Next.js dev server | webServer.command 'pnpm dev' | WIRED | Config has webServer block with pnpm dev |
| e2e/visual.spec.ts | e2e/__snapshots__/ | toHaveScreenshot calls | WIRED | 4 PNG baseline files present; need regeneration to reflect 1ff606b |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DESIGN-01 | 13-01, 13-04 | Wireframe audit & direction selection; Playwright visual QA | SATISFIED | Variant B direction locked in CONTEXT.md. Plan 04 Playwright baselines captured and approved. Plan 01 token work now correctly applied. Note: baselines need regeneration after 1ff606b. |
| DESIGN-02 | 13-01, 13-02, 13-03 | Design system tokens / semantic Tailwind classes | SATISFIED | globals.css sidebar tokens updated. All 7 Plan 01 components use semantic tokens. Plans 02+03 applied correctly. Zero hex/zinc hardcodes remain in target files. |
| DESIGN-03 | 13-03 | Page-level layout polish | SATISFIED | Chart cards, management table containers, modal palette all applied. Sidebar/layout tokens now correctly applied via Plan 01 re-application. |
| DESIGN-04 | 13-02, 13-03, 13-04 | Component polish & visual QA | SATISFIED | Entries table polish (Plan 02) fully applied. Badge styles consolidated (Plan 03). Playwright infrastructure in place (Plan 04). Baselines need regeneration (human action). |

---

## Anti-Patterns Found

No blockers remain. The 8 previously identified blocker anti-patterns (hardcoded hex classes, wrong --sidebar token) have all been resolved by commit 1ff606b.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | All hardcoded hex classes and zinc tokens replaced with semantic Tailwind utilities |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| --sidebar token in :root | `grep "oklch(0.20 0.015 65)" globals.css` | Line 85 in :root | PASS |
| Sidebar.tsx uses bg-sidebar | `grep -c "bg-sidebar" Sidebar.tsx` | 1 | PASS |
| MobileNav.tsx uses bg-sidebar x2 | `grep -c "bg-sidebar" MobileNav.tsx` | 2 | PASS |
| NavLinks.tsx uses bg-primary (active) | `grep "bg-primary" NavLinks.tsx` | Line 31: bg-primary text-primary-foreground | PASS |
| Zero hex classes in layout/entries/search | `grep -rE "bg-\[#1c1814\]|text-\[#d8553a\]..." dirs` | Zero matches | PASS |
| PageHeader no zinc tokens | `grep "text-zinc" PageHeader.tsx` | Zero matches | PASS |
| HeroSection no zinc/hex | `grep "text-zinc|bg-zinc|\[#" HeroSection.tsx` | Zero matches | PASS |
| HeroSearchInput no zinc/hex | same grep on HeroSearchInput.tsx | Zero matches | PASS |
| badge-styles.ts has 5 exports | `grep -c "^export const" badge-styles.ts` | 5 | PASS |
| VolumeChart card wrappers x2 | `grep -c "rounded-lg border border-border bg-card shadow-sm" VolumeChart.tsx` | 2 | PASS |
| SourceModal "Save Source" | `grep -c "Save Source" SourceModal.tsx` | 1 | PASS |
| AlertRuleModal "Save Rule" | `grep -c "Save Rule" AlertRuleModal.tsx` | 1 | PASS |
| isDirty in both modals | grep for both files | 2 in SourceModal, 2 in AlertRuleModal | PASS |
| 4 baseline PNGs >= 5KB | `find e2e/__snapshots__ -name '*.png' -size +4k | wc -l` | 4 | PASS (stale content) |
| Baselines not git-ignored | `git check-ignore entries-linux.png` | exit 1 (not ignored) | PASS |
| type-check exits 0 | `pnpm type-check` | exit 0, no errors | PASS |

---

## Human Verification Required

### 1. Regenerate and Approve Playwright Baselines

**Test:** From `apps/dashboard/`, run `pnpm test:e2e:update`. Then open each of the four generated PNGs in `apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/`:
- `entries-linux.png`
- `charts-linux.png`
- `sources-linux.png`
- `jobs-linux.png`

For each PNG, verify the following Variant B traits are present:
- **Sidebar (all four pages):** Warm-dark background (#252017 — noticeably warm-brown, lighter than the old #1c1814). "web**crawler**" logo where "crawler" is coral. Active nav item has coral fill.
- **/entries:** Hero card with "What's been **crawled?**" headline (coral on "crawled?"), five category tile pills, entries empty state showing Inbox icon + "No entries found".
- **/charts:** "No data to display" with BarChart3 icon, or if data is present: two chart cards with coral primary series.
- **/sources:** SourcesEmptyState with "No sources configured" and coral "Add Source" button.
- **/jobs:** JobsEmptyState with "No jobs found".

**Expected:** All four pages show warm-dark sidebar via CSS variable (not hardcoded #1c1814). Coral palette consistent throughout. If the baselines look correct, type "approved" to lock them in and commit the new PNGs.

**Why human:** The existing baseline PNGs were captured BEFORE commit `1ff606b` re-applied the sidebar CSS tokens. They depict the old hardcoded `bg-[#1c1814]` state. Per Plan 04 Task 3 (blocking checkpoint), a human must visually approve the regenerated baselines before they are committed — automated tests cannot judge whether the Variant B palette matches design intent.

---

## Gaps Summary

No gaps remain. All 4 previously identified gaps were closed by commit `1ff606b`.

The only outstanding item is a human action: regenerate and approve the Playwright baselines (`pnpm test:e2e:update` from `apps/dashboard/`, then visually inspect and confirm the 4 PNG files reflect the correct Variant B warm-dark sidebar palette).

---

_Verified: 2026-05-27T08:00:00Z_
_Verifier: Claude (gsd-verifier)_
