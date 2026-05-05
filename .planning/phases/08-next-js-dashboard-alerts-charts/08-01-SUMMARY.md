---
phase: 08-next-js-dashboard-alerts-charts
plan: "01"
subsystem: dashboard
tags: [nextjs, react-hook-form, zod, optimistic-ui, dialog, crud, dotnet, minimal-api]
dependency_graph:
  requires:
    - 07-04 (SourcesClient/SourceModal pattern, ActionResult type, source.actions.ts)
    - 05-04 (AlertRulesEndpoints.cs GET/POST/DELETE handlers)
  provides:
    - AlertRule TS types (types/api.ts)
    - alertRuleSchema discriminated union (lib/schemas/alert-rule.ts)
    - fetchAlertRules/createAlertRule/updateAlertRule/deleteAlertRule (lib/api.server.ts)
    - createAlertRuleAction/updateAlertRuleAction/deleteAlertRuleAction (actions/alert-rule.actions.ts)
    - /alerts CRUD page with useOptimistic pattern
    - PUT /api/alert-rules/{id} .NET endpoint
  affects:
    - 08-02 (notification logs reference AlertRule type, /alerts nav entry already live)
    - 08-03 (Bell icon nav pattern extended for History + BarChart2)
tech_stack:
  added:
    - Zod 4 discriminatedUnion for condition type validation (new_item | field_changed | threshold)
  patterns:
    - useOptimistic dual-state (baseRules + optimisticRules) — mirrors SourcesClient pattern
    - watch('condition.type') conditional form field reveal via RHF
    - ActionResult<T> server action contract re-used from source.actions.ts
    - z.number() (not z.coerce) in local form schema + valueAsNumber:true in register()
key_files:
  created:
    - apps/api/Endpoints/AlertRulesEndpoints.cs (UpdateAlertRule + UpdateAlertRuleRequest added)
    - apps/dashboard/types/api.ts (AlertCondition, AlertRule, CreateAlertRuleRequest, UpdateAlertRuleRequest appended)
    - apps/dashboard/lib/schemas/alert-rule.ts
    - apps/dashboard/lib/alert-rules.ts
    - apps/dashboard/lib/api.server.ts (4 alert rule helpers appended)
    - apps/dashboard/actions/alert-rule.actions.ts
    - apps/dashboard/app/alerts/page.tsx
    - apps/dashboard/components/alerts/AlertsClient.tsx
    - apps/dashboard/components/alerts/AlertsTable.tsx
    - apps/dashboard/components/alerts/AlertRuleModal.tsx
    - apps/dashboard/components/alerts/DeleteAlertDialog.tsx
    - apps/dashboard/components/alerts/AlertsEmptyState.tsx
  modified:
    - apps/dashboard/components/layout/NavLinks.tsx (Bell + /alerts entry)
    - apps/dashboard/__tests__/alert-rule-schema.test.ts (new)
    - apps/dashboard/__tests__/alert-rule-actions.test.ts (new)
decisions:
  - "Zod 4 uuid validation is RFC 4122 strict — test UUIDs updated from 11111111-... pattern to 550e8400-... (valid v4 UUID)"
  - "Select onValueChange callback typed as string | null in this shadcn version — null guard added in handleConditionTypeChange and sourceId setValue"
  - "AlertRuleModal uses conditionFormSchema with z.number() not z.coerce for threshold — matches SourceModal pattern to preserve RHF type inference"
metrics:
  duration_seconds: 1200
  completed_date: "2026-05-05"
  tasks_completed: 2
  files_changed: 15
---

# Phase 08 Plan 01: Alert Rules CRUD Page Summary

## One-liner

Alert rules CRUD page at `/alerts` with Zod discriminated-union condition form (new_item / field_changed / threshold), useOptimistic orchestration, and PUT /api/alert-rules/{id} .NET endpoint.

## What Was Built

### Task 1 — .NET PUT endpoint + TypeScript contracts + Wave 0 test stubs (TDD RED)

Added `UpdateAlertRule` handler and `UpdateAlertRuleRequest` record to `AlertRulesEndpoints.cs` mirroring the `UpdateSource` pattern. `SourceId` is intentionally NOT copied from the request body (immutable post-creation). Appended `AlertCondition`, `AlertRule`, `CreateAlertRuleRequest`, and `UpdateAlertRuleRequest` interfaces to `types/api.ts`. Created `lib/schemas/alert-rule.ts` with `alertConditionSchema` (discriminated union on `type`) and `alertRuleSchema`. Created `lib/alert-rules.ts` with `formatCondition()` display helper. Appended 4 API helpers to `lib/api.server.ts`. Wrote Wave 0 test stubs: `alert-rule-schema.test.ts` (7 tests, all GREEN) and `alert-rule-actions.test.ts` (RED until Task 2 creates the actions file).

### Task 2 — /alerts page + all UI components (TDD GREEN)

Created `alert-rule.actions.ts` with `createAlertRuleAction`, `updateAlertRuleAction`, `deleteAlertRuleAction` — each validates via Zod before calling the API and calls `revalidatePath('/alerts')` on success. Created the full page component tree: `app/alerts/page.tsx` (server component), `AlertsClient` (useOptimistic orchestrator), `AlertsTable` (6-column table with condition/channel/status badges and aria-labels), `AlertRuleModal` (RHF + Zod with `watch('condition.type')` driving conditional field reveal for fieldPath/threshold inputs), `DeleteAlertDialog` (destructive confirmation), `AlertsEmptyState`. Updated `NavLinks.tsx` with Bell icon and `/alerts` entry.

## Verification Results

- `pnpm --filter @web-crawler/dashboard test` — 34 tests passing (7 schema + 6 actions + 21 pre-existing)
- `pnpm --filter @web-crawler/dashboard type-check` — 0 errors
- `pnpm --filter @web-crawler/dashboard build` — `/alerts` appears as dynamic route (ƒ)
- `dotnet build apps/api/WebCrawlerApi.csproj` — 0 errors, 0 warnings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod 4 UUID validation rejects test fixture UUIDs**
- **Found during:** Task 1 RED phase run — 3 schema tests failing
- **Issue:** Zod 4.3.6 uses strict RFC 4122 UUID regex requiring version bits (version digit 1-8 in third group, variant bits 8/9/a/b in fourth group). The plan's test UUID `11111111-2222-3333-4444-555555555555` fails because the 4th group `4444` does not start with 8/9/a/b.
- **Fix:** Updated both test files to use `550e8400-e29b-41d4-a716-446655440000` (a valid RFC 4122 v4 UUID).
- **Files modified:** `__tests__/alert-rule-schema.test.ts`, `__tests__/alert-rule-actions.test.ts`
- **Commit:** 709a718 (amended before Task 1 commit)

**2. [Rule 1 - Bug] Select onValueChange callback type mismatch**
- **Found during:** Task 2 type-check
- **Issue:** shadcn Select `onValueChange` prop is typed as `(value: T | null) => void` in this version, but `handleConditionTypeChange` and the sourceId `setValue` call expected `string` (non-nullable).
- **Fix:** Added null guards: `if (!newType) return` in `handleConditionTypeChange`; `if (v) setValue(...)` for sourceId select.
- **Files modified:** `components/alerts/AlertRuleModal.tsx`
- **Commit:** 282f170

## Known Stubs

None — all data flows from the live `.NET API` via `fetchAlertRules()` and `fetchSources()`. No hardcoded placeholder data.

## Threat Flags

No new threat surfaces introduced beyond those in the plan's `<threat_model>`. T-08-04 (`server-only` guard) verified: `import 'server-only'` is line 1 of `lib/api.server.ts`.

## Self-Check: PASSED

All 15 created/modified files verified present on disk. Both task commits (709a718, 282f170) confirmed in git log. SUMMARY.md created at `.planning/phases/08-next-js-dashboard-alerts-charts/08-01-SUMMARY.md`.
