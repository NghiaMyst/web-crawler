---
phase: 8
slug: next-js-dashboard-alerts-charts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 |
| **Config file** | `apps/dashboard/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @web-crawler/dashboard test` |
| **Full suite command** | `pnpm --filter @web-crawler/dashboard test && pnpm --filter @web-crawler/dashboard type-check` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @web-crawler/dashboard test`
- **After every plan wave:** Run `pnpm --filter @web-crawler/dashboard test && pnpm --filter @web-crawler/dashboard type-check`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | DASH-05 | — | `createAlertRuleAction` returns `{ ok: false, fieldErrors }` when condition type invalid | unit | `pnpm --filter @web-crawler/dashboard test -- --grep "createAlertRuleAction"` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 1 | DASH-05 | — | `updateAlertRuleAction` does not call API when Zod parse fails | unit | `pnpm --filter @web-crawler/dashboard test -- --grep "updateAlertRuleAction"` | ❌ W0 | ⬜ pending |
| 8-01-03 | 01 | 1 | DASH-05 | — | alertRule Zod schema rejects `threshold` condition with missing `fieldPath` | unit | `pnpm --filter @web-crawler/dashboard test -- --grep "alertRuleSchema"` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 1 | DASH-06 | — | `fetchNotifications` calls correct URL with optional sourceId | unit | `pnpm --filter @web-crawler/dashboard test -- --grep "fetchNotifications"` | ❌ W0 | ⬜ pending |
| 8-03-01 | 03 | 2 | DASH-02 | — | `fetchVolumeStats` calls correct URL with range param | unit | `pnpm --filter @web-crawler/dashboard test -- --grep "fetchVolumeStats"` | ❌ W0 | ⬜ pending |
| 8-04-01 | 04 | 1 | DASH-02/05/06 | — | TypeScript build passes with zero errors | type-check | `pnpm --filter @web-crawler/dashboard type-check` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/dashboard/__tests__/alert-rule-actions.test.ts` — stubs for DASH-05 action validation path
- [ ] `apps/dashboard/__tests__/alert-rule-schema.test.ts` — stubs for DASH-05 Zod discriminated union validation
- [ ] `apps/dashboard/__tests__/api-stats.test.ts` — stubs for DASH-02 fetchVolumeStats URL construction
- [ ] Mock factory update in `apps/dashboard/__tests__/__mocks__/` — add `fetchAlertRules`, `createAlertRule`, `updateAlertRule`, `deleteAlertRule`, `fetchNotifications`, `fetchVolumeStats` to the `vi.mock('@/lib/api.server')` factory (follow existing `source-actions.test.ts` pattern)

*Existing Vitest/test infrastructure is present. Wave 0 only creates test stub files — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Alert rule form shows/hides fields based on condition type selection | DASH-05 | UI interaction requiring browser | Open `/alerts` → create rule → toggle type dropdown → verify fields appear/disappear |
| Notification history filters correctly by source | DASH-06 | Integration with live API | Open `/notifications` → select source from dropdown → verify rows filter |
| Volume chart renders correct source labels on lines | DASH-02 | Visual chart rendering | Open `/charts` → verify each source has labeled line in legend |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
