---
phase: 08-next-js-dashboard-alerts-charts
reviewed: 2026-05-05T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - apps/api/Endpoints/AlertRulesEndpoints.cs
  - apps/dashboard/__tests__/alert-rule-actions.test.ts
  - apps/dashboard/__tests__/alert-rule-schema.test.ts
  - apps/dashboard/actions/alert-rule.actions.ts
  - apps/dashboard/app/alerts/page.tsx
  - apps/dashboard/components/alerts/AlertRuleModal.tsx
  - apps/dashboard/components/alerts/AlertsClient.tsx
  - apps/dashboard/components/alerts/AlertsEmptyState.tsx
  - apps/dashboard/components/alerts/AlertsTable.tsx
  - apps/dashboard/components/alerts/DeleteAlertDialog.tsx
  - apps/dashboard/components/layout/NavLinks.tsx
  - apps/dashboard/lib/alert-rules.ts
  - apps/dashboard/lib/api.server.ts
  - apps/dashboard/lib/schemas/alert-rule.ts
  - apps/dashboard/types/api.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-05-05T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

This phase introduces the Alert Rules CRUD feature: a .NET minimal-API endpoint set, Next.js Server Actions, Zod schemas, React components (table, modal, delete dialog), and nav registration. The overall architecture is consistent with the existing Sources pattern and the code is well-structured. No critical security vulnerabilities were found.

Four warnings were identified — all logic correctness issues that can produce silent runtime failures or visible UI bugs: an unhandled page-level fetch error that will crash the RSC render without a meaningful error boundary, a toast that fires after the dialog closes on delete failure giving users no visible feedback, a schema/endpoint mismatch where the dashboard sends `condition` as a typed union object but the .NET endpoint currently accepts a raw `JsonElement`, and a type-narrowing cast in `AlertRuleModal` that silently discards errors for nested discriminated-union fields.

Four informational items cover a duplicate schema definition, a missing `useId`-based id association for the checkbox, an untested happy-path in the actions tests, and a minor inconsistency in the error message copy.

## Warnings

### WR-01: Unhandled fetch errors on `/alerts` page crash the RSC render

**File:** `apps/dashboard/app/alerts/page.tsx:9`
**Issue:** `fetchAlertRules()` and `fetchSources()` are awaited inside `Promise.all` with no try/catch and no error boundary wrapping this page. If the API is unavailable (network error, non-2xx response) the server-side render throws an unhandled exception. Next.js will serve the nearest `error.tsx` boundary, but none appears to exist for the `/alerts` route. The user will see a generic error page rather than a meaningful, recoverable state. The same `request<T>()` helper in `api.server.ts` throws on non-ok responses (line 24), which confirms this path is reachable.

**Fix:**
```tsx
// Option A — wrap in try/catch and render a graceful fallback
export default async function AlertsPage(): Promise<React.JSX.Element> {
  let rules: AlertRule[] = [];
  let sources: Source[] = [];
  try {
    [rules, sources] = await Promise.all([fetchAlertRules(), fetchSources()]);
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-zinc-900">Alert Rules</h1>
        <p className="text-sm text-red-600">Could not load alert rules. Please try again later.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Alert Rules</h1>
      <AlertsClient initialRules={rules} sources={sources} />
    </div>
  );
}

// Option B — add apps/dashboard/app/alerts/error.tsx as an error boundary
```

---

### WR-02: Toast for delete failure fires after `onOpenChange(false)` closes the dialog, making the error invisible

**File:** `apps/dashboard/components/alerts/DeleteAlertDialog.tsx:40-42`
**Issue:** The delete button's `onClick` handler calls `await onConfirm(rule)` then immediately calls `onOpenChange(false)`. Inside `AlertsClient.confirmDelete`, when the API call fails, `setToast(result.error)` runs and restores the rule to `baseRules`. However, `onOpenChange(false)` has already been dispatched (the dialog is closing) before the parent component re-renders with the toast. In practice the toast element does render because React batches the state updates, but the control flow is fragile: if `onConfirm` itself throws (rather than returning `ok: false`), `onOpenChange(false)` will never be called at all, leaving the dialog stuck open and no `isPending` reset.

**Fix:**
```tsx
// In DeleteAlertDialog.tsx — let the parent control dialog close timing
onClick={() => {
  if (!rule) return;
  startTransition(async () => {
    await onConfirm(rule);
    // Only close if the parent did not already do so (parent closes on success,
    // leaves open on failure so the user can retry or cancel manually).
    // Alternatively, unconditionally close and rely on the toast for error feedback:
    onOpenChange(false);
  });
}}
```
```tsx
// In AlertsClient.tsx — keep dialog open on failure so user sees context
async function confirmDelete(rule: AlertRule): Promise<void> {
  dispatchOptimistic({ type: 'delete', id: rule.id });
  const result = await deleteAlertRuleAction(rule.id);
  if (!result.ok) {
    setBaseRules((prev) => (prev.some((r) => r.id === rule.id) ? prev : [...prev, rule]));
    setToast(result.error);
    setDeleteTarget(rule); // re-open or keep open
    return;
  }
  setDeleteTarget(null);
  setBaseRules((prev) => prev.filter((r) => r.id !== rule.id));
}
```

---

### WR-03: `condition` field errors in `AlertRuleModal` are silently dropped for nested paths

**File:** `apps/dashboard/components/alerts/AlertRuleModal.tsx:123-127`
**Issue:** When a server action returns `fieldErrors`, the modal iterates entries and calls `setError(field as keyof AlertRuleFormData, ...)`. For top-level fields this works. For nested condition fields (e.g. `"condition.fieldPath"`, `"condition.threshold"`) the cast `field as keyof AlertRuleFormData` resolves to `"condition"` and the `setError` call targets the parent object key, not the nested path. The `setError` from react-hook-form accepts dot-notation paths but the type cast prevents TypeScript from catching the mismatch. The result is that nested field errors from the server are set on the wrong key and the per-field error UI never appears.

**Fix:**
```tsx
// Use a type-safe dot-path string rather than the keyof cast
if (result.fieldErrors) {
  for (const [field, msgs] of Object.entries(result.fieldErrors)) {
    if (msgs?.[0]) {
      // react-hook-form accepts dot-notation paths; cast to Parameters<typeof setError>[0]
      setError(
        field as Parameters<typeof setError>[0],
        { message: msgs[0] },
      );
    }
  }
}
```

---

### WR-04: `condition` is serialized as an object on the wire but the .NET endpoint deserializes it as `JsonElement`

**File:** `apps/api/Endpoints/AlertRulesEndpoints.cs:56-57` and `apps/dashboard/lib/api.server.ts:74-79`
**Issue:** `CreateAlertRuleRequest` and `UpdateAlertRuleRequest` on the .NET side declare `Condition` as `JsonElement?`. The dashboard serializes the condition as a plain JSON object (e.g. `{"type":"new_item"}`). This round-trips correctly today because the API stores it as a `JsonDocument` blob. However, the `GetAlertRules` response returns the entity directly (line 39), and the deserialization of the stored `JsonDocument` back to `AlertCondition` on the dashboard side relies entirely on the shape being preserved as-is. If the API ever re-serializes `Condition` with a different casing or property ordering (EF Core + `JsonDocument` persistence is implementation-dependent), the dashboard type `AlertCondition` discriminated union will fail silently. More concretely: there is no server-side validation that the submitted `condition.type` is one of `new_item | field_changed | threshold`. A caller can submit `{"type":"evil"}` and it will be stored and later returned to the UI, where `formatCondition` hits no `switch` branch and the TypeScript exhaustiveness check is bypassed at runtime.

**Fix:**
```csharp
// In AlertRulesEndpoints.cs — add condition type validation in CreateAlertRule
static readonly string[] ValidConditionTypes = ["new_item", "field_changed", "threshold"];

if (req.Condition.HasValue)
{
    if (!req.Condition.Value.TryGetProperty("type", out var typeProp)
        || !ValidConditionTypes.Contains(typeProp.GetString()))
    {
        errors["condition"] = new[] { "condition.type must be one of: new_item, field_changed, threshold" };
    }
}
// Apply the same guard in UpdateAlertRule
```

---

## Info

### IN-01: Duplicate `conditionFormSchema` defined in `AlertRuleModal` shadows the shared schema

**File:** `apps/dashboard/components/alerts/AlertRuleModal.tsx:21-37`
**Issue:** `AlertRuleModal` re-declares a complete `conditionFormSchema` and `alertRuleFormSchema` locally that are functionally equivalent to `alertConditionSchema` and `alertRuleSchema` from `@/lib/schemas/alert-rule`. The only intentional difference is that the modal schema uses `z.number()` (not `z.coerce.number()`) for `threshold` — but this is already noted in a comment. This duplication means that if the canonical schemas in `lib/schemas/alert-rule.ts` are updated (e.g. a new condition type is added), the modal schema will silently diverge, causing the modal to accept or reject different values than the server action.

**Suggestion:** Export a separate form-specific variant from `lib/schemas/alert-rule.ts` (e.g. `alertRuleFormSchema`) that the modal imports, keeping the `z.number()` vs `z.coerce.number()` distinction with an inline comment.

---

### IN-02: Checkbox `isActive` uses a raw `<input>` rather than the project's `<Checkbox>` UI primitive

**File:** `apps/dashboard/components/alerts/AlertRuleModal.tsx:225-232`
**Issue:** All other form controls in `AlertRuleModal` use the project's shadcn/ui component wrappers (`<Input>`, `<Select>`, etc.). The `isActive` checkbox uses a plain HTML `<input type="checkbox">` directly, which bypasses any project-wide styling and accessibility defaults applied by the UI component library. Additionally, the `<Label>` wrapping uses a separate `htmlFor` association rather than being co-located with the input, which is acceptable but inconsistent with shadcn `<Checkbox>` usage (which pairs with `<Label>` via a flex wrapper, not `htmlFor`).

**Suggestion:** Replace with the shadcn/ui `<Checkbox>` component and pair it with `<Label>` following the same pattern used elsewhere in the codebase:
```tsx
import { Checkbox } from '@/components/ui/checkbox';

<div className="flex items-center gap-2">
  <Checkbox
    id="isActive"
    checked={isActive}
    onCheckedChange={(checked) =>
      setValue('isActive', checked === true, { shouldValidate: true })
    }
  />
  <Label htmlFor="isActive" className="text-sm">Active (send notifications)</Label>
</div>
```

---

### IN-03: Happy-path (successful API call) is not tested in `alert-rule-actions.test.ts`

**File:** `apps/dashboard/__tests__/alert-rule-actions.test.ts`
**Issue:** All test cases in this file cover validation failure paths. There are no tests for the success path: when `alertRuleSchema` passes and `createAlertRule`/`updateAlertRule` API mocks return a valid rule, the actions should return `{ ok: true, data: rule }`. The absence of success-path tests means a regression in the happy-path (e.g. a wrong key being passed to the API function) would not be caught by this suite.

**Suggestion:** Add at minimum two tests:
```ts
it('returns { ok: true, data } when API resolves successfully', async () => {
  const mockRule = { id: 'r1', ...VALID_RULE_INPUT, messageTpl: '', createdAt: '' };
  vi.mocked(apiServer.createAlertRule).mockResolvedValueOnce(mockRule);
  const r = await createAlertRuleAction({ ...VALID_RULE_INPUT });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.data).toEqual(mockRule);
});

it('returns { ok: false, error } when API rejects', async () => {
  vi.mocked(apiServer.createAlertRule).mockRejectedValueOnce(new Error('500'));
  const r = await createAlertRuleAction({ ...VALID_RULE_INPUT });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toMatch(/Could not save/);
});
```

---

### IN-04: Inconsistent error message copy in `deleteAlertRuleAction`

**File:** `apps/dashboard/actions/alert-rule.actions.ts:82`
**Issue:** The non-`Error` fallback message for `deleteAlertRuleAction` is `'Failed to delete alert rule. It has been restored.'` The phrase "It has been restored" is misleading — the UI optimistically removes the row and then restores it on failure, so the rule is technically restored in the UI. However, this message text was copied verbatim from `deleteSourceAction` and may confuse users who see it if a non-`Error` value is thrown (very unlikely in practice, but the copy is still inaccurate in spirit for the alert context).

**Suggestion:** Use `'Failed to delete alert rule.'` as the fallback to avoid implying a server-side restore that did not occur.

---

_Reviewed: 2026-05-05T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
