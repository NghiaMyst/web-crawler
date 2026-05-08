---
phase: 08-next-js-dashboard-alerts-charts
fixed_at: 2026-05-05T13:44:46Z
review_path: .planning/phases/08-next-js-dashboard-alerts-charts/08-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 08: Code Review Fix Report

**Fixed at:** 2026-05-05T13:44:46Z
**Source review:** .planning/phases/08-next-js-dashboard-alerts-charts/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (WR-01 through WR-04; Critical/Warning scope; 0 Critical, 4 Warning)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: Unhandled fetch errors on `/alerts` page crash the RSC render

**Files modified:** `apps/dashboard/app/alerts/page.tsx`
**Commit:** 3816ba1
**Applied fix:** Wrapped the `Promise.all([fetchAlertRules(), fetchSources()])` call in a `try/catch` block. On failure the function returns an inline error fallback (`<p className="text-sm text-red-600">`) instead of letting the uncaught exception propagate to Next.js's generic error page. Also added the missing `AlertRule` and `Source` type imports needed for the pre-declared `let` bindings.

---

### WR-02: Toast for delete failure fires after dialog closes, making the error invisible

**Files modified:** `apps/dashboard/components/alerts/DeleteAlertDialog.tsx`, `apps/dashboard/components/alerts/AlertsClient.tsx`
**Commit:** 42ab5be
**Applied fix:**
- `DeleteAlertDialog.tsx`: Removed the unconditional `onOpenChange(false)` call from the `startTransition` callback. The parent now controls close timing entirely.
- `AlertsClient.tsx`: On delete failure, added `setDeleteTarget(rule)` after restoring the base rules and setting the toast, so the dialog remains open and the user can see the error, retry, or cancel manually. On success, `setDeleteTarget(null)` is now explicit (previously it was implicitly handled by the `onOpenChange` prop in the dialog, which is no longer responsible for closing on success).

---

### WR-03: `condition` field errors in `AlertRuleModal` are silently dropped for nested paths

**Files modified:** `apps/dashboard/components/alerts/AlertRuleModal.tsx`
**Commit:** 479de53
**Applied fix:** Replaced the `field as keyof AlertRuleFormData` cast with `field as Parameters<typeof setError>[0]`. The `keyof` cast collapsed dot-notation paths like `"condition.fieldPath"` to `"condition"`, causing `setError` to target the wrong key and the per-field error UI to never appear. The `Parameters` cast preserves the full dot-notation string and is the type that react-hook-form's `setError` actually accepts.

---

### WR-04: `condition` serialized as object on the wire but .NET endpoint accepts it without type validation

**Files modified:** `apps/api/Endpoints/AlertRulesEndpoints.cs`
**Commit:** 9691576
**Applied fix:** Added a static `ValidConditionTypes` array (`["new_item", "field_changed", "threshold"]`) to the `AlertRulesEndpoints` class. Both `CreateAlertRule` and `UpdateAlertRule` now validate that the submitted `condition.type` is one of the three allowed values before proceeding. Invalid submissions return a `ValidationProblem` response with error key `"condition"`. This prevents arbitrary `type` values from being stored in the `JsonDocument` column and later returned to the UI where they would silently bypass the `formatCondition` switch exhaustiveness check.

---

_Fixed: 2026-05-05T13:44:46Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
