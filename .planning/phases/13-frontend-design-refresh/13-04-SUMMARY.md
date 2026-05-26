---
phase: 13
plan: 04
subsystem: dashboard/e2e
tags: [playwright, visual-regression, e2e, baseline, snapshot]
dependency_graph:
  requires: [13-01, 13-02, 13-03]
  provides: [visual-regression-baseline, playwright-config]
  affects: [apps/dashboard/e2e/, apps/dashboard/playwright.config.ts]
tech_stack:
  added: ["@playwright/test ^1.60.0 (Chromium headless, visual regression)"]
  patterns: ["screenshot snapshot testing", "webServer auto-start in Playwright config"]
key_files:
  created:
    - apps/dashboard/playwright.config.ts
    - apps/dashboard/e2e/visual.spec.ts
    - apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/entries-linux.png
    - apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/charts-linux.png
    - apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/sources-linux.png
    - apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/jobs-linux.png
  modified:
    - apps/dashboard/package.json
    - apps/dashboard/.gitignore
    - apps/dashboard/vitest.config.ts
    - pnpm-lock.yaml
decisions:
  - "Playwright 1.60.0 installed (resolved from ^1.60.0, exceeds D-10 requirement of >=1.48)"
  - "Baselines captured in empty/error state (API unavailable during test run = expected and intentional)"
  - "Human checkpoint approved baselines as-is: sidebar design correct, API error state in content area is acceptable"
  - "vitest.config.ts updated to exclude e2e/ dir to prevent Playwright spec files from being picked up by unit test runner"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-26"
  tasks_completed: 3
  files_created: 6
  files_modified: 4
---

# Phase 13 Plan 04: Playwright Visual Baselines Summary

Installed Playwright 1.60.0 into the dashboard app, wrote `playwright.config.ts` and four screenshot tests, generated committed baseline PNGs for the Variant B redesign, and obtained human approval to lock in the baselines.

## What Was Built

### Playwright Installation

- Package: `@playwright/test ^1.60.0` added to `apps/dashboard/package.json` `devDependencies`
- Installed version: `1.60.0` (confirmed via `npx playwright --version`)
- Browser: Chromium headless installed via `npx playwright install chromium`
- Scripts added to `apps/dashboard/package.json`:
  - `"test:e2e": "playwright test"` — regression check against committed baselines
  - `"test:e2e:update": "playwright test --update-snapshots"` — regenerate baselines

### playwright.config.ts

`apps/dashboard/playwright.config.ts` — Single Chromium project at 1280x800 (Desktop Chrome), webServer auto-starts the Next.js dev server:

- `testDir: './e2e'`
- `snapshotDir: './e2e/__snapshots__'`
- `baseURL: 'http://localhost:3000'`
- `viewport: { width: 1280, height: 800 }`
- `webServer.command: 'pnpm dev'`, `reuseExistingServer: !process.env.CI`
- `expect.toHaveScreenshot.maxDiffPixelRatio: 0.02` (2% pixel tolerance)
- `trace: 'retain-on-failure'`

### e2e/visual.spec.ts

Four screenshot tests covering each key dashboard route:

```
/entries  → entries-linux.png
/charts   → charts-linux.png
/sources  → sources-linux.png
/jobs     → jobs-linux.png
```

Each test: `goto(path)` → `waitForLoadState('networkidle')` → `waitForTimeout(500)` → `toHaveScreenshot(name.png, { fullPage: true })`.

### .gitignore Updates

Added Playwright runtime artifact ignores (NOT the `__snapshots__/` dir — baselines are committed):

```
# Playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

### vitest.config.ts Update

Added `exclude: ['e2e/**']` to prevent Playwright spec files from being mistakenly picked up by the Vitest unit test runner.

## Baseline PNGs Generated

Generated via `pnpm test:e2e:update` from `apps/dashboard/`. All four PNGs located at `apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/`:

| File | Size | Content |
|------|------|---------|
| `entries-linux.png` | ~31 KB | `/entries` page — hero card + empty state (Inbox icon, "No entries found") |
| `charts-linux.png` | ~31 KB | `/charts` page — date-range Select + "No data to display" (BarChart3 icon) |
| `sources-linux.png` | ~31 KB | `/sources` page — SourcesEmptyState ("No sources configured") |
| `jobs-linux.png` | ~31 KB | `/jobs` page — JobsEmptyState ("No jobs found") |

Baseline state note: The dev server ran without the .NET API backend. All four pages show empty/error states. This is intentional — the baselines prove the Variant B layout and palette render correctly even without crawl data. The API error indicator visible in the content area is expected behavior.

Stability verification: Second `pnpm test:e2e` run (without `--update-snapshots`) passed 4/4 tests against the freshly generated baselines. Baselines are stable.

## Human Checkpoint Decision

**Task 3 was a non-autonomous checkpoint requiring user approval before PNGs were committed.**

The user reviewed the four captured baselines showing:
- Sidebar with warm-dark background and coral "crawler" logo
- Active nav items in coral
- Content areas showing empty/error states (API unavailable during test = expected)

**User approved the baselines as-is.** The sidebar design is correct per Variant B intent. The API error state in the content area is acceptable — it reflects the real state when the backend is not running, and is the deliberate baseline for regression detection.

## How to Use

**Regression check** (CI and daily verification):

```bash
cd apps/dashboard
pnpm test:e2e
```

All four tests must pass. If any test fails, a screenshot diff is generated in `playwright-report/` showing the pixel difference.

**Regenerate baselines** (after intentional visual changes):

```bash
cd apps/dashboard
pnpm test:e2e:update
```

Run this when Plans 13-01 through 13-03 introduce intentional palette/layout changes. After regenerating, visually inspect the new PNGs, commit them, and the new baselines become the regression target.

## Commits

| Hash | Description |
|------|-------------|
| `c9e313d` | feat(13-04): install Playwright, add playwright.config.ts + e2e/visual.spec.ts (D-10) |
| `469ee6e` | feat(13-04): generate Playwright baseline PNGs for Variant B (D-10 Task 2) |

## Verification

- `npx playwright --version` → `Version 1.60.0` (>=1.48 requirement satisfied)
- `find apps/dashboard/e2e/__snapshots__ -name '*.png' -size +4k | wc -l` → 4
- `pnpm test:e2e` (second run without --update-snapshots) → 4 passed, 0 failed
- `git check-ignore apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/entries-linux.png` → exit 1 (not ignored)
- `pnpm type-check` → exit 0
- Human checkpoint: APPROVED

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Excluded e2e/ from vitest config**

- Found during: Task 1
- Issue: Playwright spec files use `test()` from `@playwright/test`; without exclusion, Vitest would try to collect them and fail on import
- Fix: Added `exclude: ['e2e/**']` to `apps/dashboard/vitest.config.ts`
- Files modified: `apps/dashboard/vitest.config.ts`
- Commit: `c9e313d`

## Known Stubs

None. The four baseline PNGs are committed real screenshots, not placeholders.

## Threat Flags

None. This plan installs a dev-only test framework with no new network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

- `apps/dashboard/playwright.config.ts` exists (in git at c9e313d)
- `apps/dashboard/e2e/visual.spec.ts` exists (in git at c9e313d)
- `apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/entries-linux.png` exists (in git at 469ee6e)
- `apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/charts-linux.png` exists (in git at 469ee6e)
- `apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/sources-linux.png` exists (in git at 469ee6e)
- `apps/dashboard/e2e/__snapshots__/visual.spec.ts-snapshots/jobs-linux.png` exists (in git at 469ee6e)
- Commits c9e313d and 469ee6e confirmed present in git log
