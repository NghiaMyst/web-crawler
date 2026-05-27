---
phase: 13
slug: frontend-design-refresh
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-26
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 (existing unit tests) + Playwright (new e2e, Wave 0 installs) |
| **Config file (unit)** | `apps/dashboard/vitest.config.ts` |
| **Config file (e2e)** | `apps/dashboard/playwright.config.ts` (Wave 0 gap — must be created) |
| **Quick run command** | `pnpm test --filter @web-crawler/dashboard` |
| **E2E command** | `npx playwright test --project=chromium` (from `apps/dashboard/`) |
| **Full suite command** | `pnpm test --filter @web-crawler/dashboard && npx playwright test` |
| **Estimated runtime (unit)** | ~5 seconds |
| **Estimated runtime (e2e)** | ~60–90 seconds (includes Next.js dev server start) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --filter @web-crawler/dashboard` (unit tests, ~5s)
- **After every plan wave:** Run `npx playwright test --project=chromium` (screenshot comparison)
- **Before `/gsd-verify-work`:** Full suite must be green — all unit tests + Playwright screenshots match baseline
- **Max feedback latency:** 90 seconds (e2e gate per wave)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | DESIGN-02 | — | N/A | unit | `pnpm test --filter @web-crawler/dashboard` | ✅ existing | ⬜ pending |
| 13-01-02 | 01 | 1 | DESIGN-02 | — | N/A | unit | `pnpm test --filter @web-crawler/dashboard` | ✅ existing | ⬜ pending |
| 13-02-01 | 02 | 2 | DESIGN-02 | — | N/A | unit | `pnpm test --filter @web-crawler/dashboard` | ✅ existing | ⬜ pending |
| 13-02-02 | 02 | 2 | DESIGN-02 | — | N/A | unit | `pnpm test --filter @web-crawler/dashboard` | ✅ existing | ⬜ pending |
| 13-02-03 | 02 | 2 | DESIGN-04 | — | N/A | unit | `pnpm test --filter @web-crawler/dashboard` | ✅ existing | ⬜ pending |
| 13-03-01 | 03 | 3 | DESIGN-03 | — | N/A | e2e screenshot | `npx playwright test --project=chromium` | ❌ W0 | ⬜ pending |
| 13-03-02 | 03 | 3 | DESIGN-03 | — | N/A | e2e screenshot | `npx playwright test --project=chromium` | ❌ W0 | ⬜ pending |
| 13-04-01 | 04 | 4 | DESIGN-04 | — | N/A | e2e screenshot | `npx playwright test --project=chromium` | ❌ W0 | ⬜ pending |
| 13-04-02 | 04 | 4 | DESIGN-01 | — | N/A | manual visual | — | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/dashboard/playwright.config.ts` — Playwright config with `webServer` pointing at Next.js dev server on port 3000, Chrome headless, `maxDiffPixelRatio: 0.02`
- [ ] `apps/dashboard/e2e/visual.spec.ts` — Screenshot tests for Entries, Charts, Sources, and one management page (Jobs)
- [ ] `apps/dashboard/e2e/__snapshots__/` — Generated on first `--update-snapshots` run; must be committed as baseline
- [ ] Package install: `pnpm add -D @playwright/test --filter @web-crawler/dashboard` + `npx playwright install chromium`

*Wave 0 must complete before any e2e screenshot verification can run (Plans 03–04).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Variant B visual identity — hero, coral, warm sidebar look correct | DESIGN-01 | Subjective visual judgment; screenshot tests verify structure not aesthetics | Open http://localhost:3000/entries; confirm dark sidebar, coral primary, hero section, category tiles look consistent with Variant B wireframe |
| Sidebar color nudge — `#252017` vs `#1c1814` visual balance | DESIGN-02 | OKLCH conversion approximate; exact value needs eye check | Compare sidebar before/after; confirm warm brown character is lighter but still warm, not grey |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
