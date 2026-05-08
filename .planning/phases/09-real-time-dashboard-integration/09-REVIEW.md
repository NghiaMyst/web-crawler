---
phase: 09-real-time-dashboard-integration
reviewed: 2026-05-08T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - apps/dashboard/contexts/signalr.context.tsx
  - apps/dashboard/components/ui/sonner.tsx
  - apps/dashboard/__tests__/__mocks__/signalr.ts
  - apps/dashboard/__tests__/signalr-context.test.ts
  - apps/dashboard/components/layout/DashboardLayout.tsx
  - apps/dashboard/components/entries/live-entries-wrapper.tsx
  - apps/dashboard/lib/api.client.ts
  - apps/dashboard/app/entries/page.tsx
  - apps/dashboard/components/connection/connection-dot.tsx
  - apps/dashboard/__tests__/connection-dot.test.ts
  - apps/dashboard/components/layout/Sidebar.tsx
  - apps/dashboard/components/layout/MobileNav.tsx
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-05-08T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

This phase introduces real-time SignalR integration, a connection status indicator, gap-recovery on reconnect, and associated tests. The overall architecture is sound: the provider pattern, ref-based reconnect handler registration, and URLSearchParams-based query building are all correct. No security vulnerabilities or data-loss risks were found.

Three warnings are raised: the initial connection failure produces no user notification, the gap-recovery slice does not account for server-side entries when enforcing the 200-row cap, and a catch block surfaces a misleading toast on actual network failure. Four informational issues relate to test coverage gaps — the `SignalRProvider` tests do not render the component under test, and the `ConnectionDot` ARIA attributes are never exercised against a rendered element.

---

## Warnings

### WR-01: Initial connection failure produces no user-facing notification

**File:** `apps/dashboard/contexts/signalr.context.tsx:73-76`

**Issue:** When `conn.start()` rejects (initial connection attempt fails), the `.catch()` handler only calls `setState(HubConnectionState.Disconnected)`. The `onclose` callback — which fires the `toast.error('Live updates disconnected')` toast — is only invoked when a previously-established connection drops, not on an initial failure. As a result, if the SignalR hub is unreachable on page load the user sees no indication other than a red dot, which may not be noticeable.

**Fix:**
```tsx
conn
  .start()
  .then(() => setState(HubConnectionState.Connected))
  .catch(() => {
    setState(HubConnectionState.Disconnected);
    toast.error('Could not connect to live updates');
  });
```

---

### WR-02: Gap-recovery slice does not respect the combined ROW_CAP

**File:** `apps/dashboard/components/entries/live-entries-wrapper.tsx:60`

**Issue:** After a successful reconnect, the gap-recovery function prepends missed entries with:

```ts
setLiveEntries((prev) => [...result.items, ...prev].slice(0, ROW_CAP));
```

This caps `liveEntries` alone at 200 rows, but `serverEntriesLengthRef.current` server-side rows are also rendered below. The combined render at line 76 (`[...liveEntries, ...serverEntries].slice(0, ROW_CAP)`) will handle the final display cap, so the visual output is correct — but `liveEntries` state can transiently hold up to 200 items while `serverEntries` also holds up to 20, causing the state to silently exceed intent. More importantly this diverges from the pattern used by the live `NewEntry` handler (lines 33-36), which correctly subtracts `serverEntriesLengthRef.current` before slicing.

**Fix:**
```ts
setLiveEntries((prev) => {
  const merged = [...result.items, ...prev];
  return merged.slice(0, Math.max(0, ROW_CAP - serverEntriesLengthRef.current));
});
```

---

### WR-03: Gap-recovery catch block shows "no missed entries" toast on actual fetch failure

**File:** `apps/dashboard/components/entries/live-entries-wrapper.tsx:65-66`

**Issue:** The `catch` block in `gapRecovery` calls `toast.success('Reconnected — no missed entries')` even when the `fetchEntriesFrom` call threw a network or server error. This is factually incorrect — the fetch failed, so the missed-entry count is unknown. Users may believe they have not missed any data when in reality a gap exists.

**Fix:**
```ts
} catch {
  toast.warning('Reconnected — could not fetch missed entries');
}
```

---

## Info

### IN-01: `SignalRProvider` tests do not render the React component

**File:** `apps/dashboard/__tests__/signalr-context.test.ts:51-129`

**Issue:** All tests in the `describe('SignalRProvider')` block instantiate mock builders and connections directly — none of them mount the `SignalRProvider` component. As a result the tests verify mock infrastructure and wiring (e.g., that `withAutomaticReconnect` was called with certain delays) rather than the actual component behavior. If the provider were rewritten to, say, skip registering `onclose`, these tests would still pass.

**Fix:** Use a JSDOM-capable test renderer (e.g., `@testing-library/react` with `renderHook`) to mount `SignalRProvider` and assert on the exposed `state` values and toast calls. At minimum, document that the current tests are integration stubs, not component-level tests.

---

### IN-02: `ConnectionDot` tests do not render the component — ARIA attributes are untested

**File:** `apps/dashboard/__tests__/connection-dot.test.ts:30-76`

**Issue:** The test suite imports `ConnectionDot` and confirms it is a function, and inspects the `stateConfig` object directly. The component is never rendered, so the `role="status"` attribute, `aria-label` text, conditional `animate-pulse` class, and color class application are not verified against actual DOM output. The `.todo` items in `signalr-context.test.ts` (lines 131-136) acknowledge this gap but are in the wrong file.

**Fix:** Render the component using `@testing-library/react` and assert on the rendered element:
```ts
render(<ConnectionDot />);
const dot = screen.getByRole('status');
expect(dot).toHaveAttribute('aria-label', 'Disconnected');
expect(dot.className).toContain('bg-red-500');
```

---

### IN-03: Redundant `registerReconnectHandler` null-guard that can never be false

**File:** `apps/dashboard/components/entries/live-entries-wrapper.tsx:47-48`

**Issue:** `registerReconnectHandler` is typed as `(fn: (() => Promise<void>) | null) => void` in `SignalRContextValue` — it is always a function (a no-op in the default context value). The guard `if (!registerReconnectHandler) return;` can never be `true` and is misleading.

**Fix:** Remove the guard, or if defensive programming is desired, add a comment explaining the intent:
```ts
// Always present — default context provides a no-op
registerReconnectHandler(gapRecovery);
```

---

### IN-04: Stale `.todo` tests for `ConnectionDot` live in the wrong test file

**File:** `apps/dashboard/__tests__/signalr-context.test.ts:131-136`

**Issue:** Lines 131-136 contain a `describe('ConnectionDot')` block with four `.todo` tests inside `signalr-context.test.ts`. A separate, more complete `connection-dot.test.ts` file already exists. The `.todo` placeholders in the signalr context test file are orphaned and will never be filled in, adding noise to test output.

**Fix:** Remove the `describe('ConnectionDot')` block from `signalr-context.test.ts`. If additional render-level tests are needed, add them to `connection-dot.test.ts`.

---

_Reviewed: 2026-05-08T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
