---
phase: 09-real-time-dashboard-integration
plan: "01"
subsystem: dashboard
tags: [signalr, websocket, react-context, sonner, toast, real-time]
dependency_graph:
  requires: []
  provides:
    - SignalRProvider React context with HubConnection lifecycle management
    - useSignalRContext hook for connection state access
    - Sonner Toaster in DashboardLayout at bottom-right
    - Test scaffold for all Phase 9 components
  affects:
    - apps/dashboard/components/layout/DashboardLayout.tsx
    - apps/dashboard/contexts/signalr.context.tsx
tech_stack:
  added:
    - "@microsoft/signalr@10.0.0 — SignalR JS client for WebSocket hub connection"
    - "sonner@2.0.7 — toast notification library"
  patterns:
    - "useState-based HubConnection storage (not useRef) — ensures child re-renders on connection set"
    - "Callbacks registered BEFORE start() — prevents missing lifecycle events"
    - "onReconnectRef pattern — single slot for reconnect handler, no accumulation"
key_files:
  created:
    - apps/dashboard/contexts/signalr.context.tsx
    - apps/dashboard/components/ui/sonner.tsx
    - apps/dashboard/__tests__/__mocks__/signalr.ts
    - apps/dashboard/__tests__/signalr-context.test.ts
  modified:
    - apps/dashboard/package.json
    - apps/dashboard/components/layout/DashboardLayout.tsx
    - .gitignore
    - pnpm-lock.yaml
decisions:
  - "MockBuilder type uses explicit callable signatures (not ReturnType<typeof vi.fn>) to satisfy TypeScript 6 strict mode — Mock<Procedure|Constructable> is not callable per TS6"
  - "callBuilderMock() helper function uses (fn as any)() cast to call vi.fn() arrow mock without new — the shadcn-generated HubConnectionBuilder mock is an arrow fn, not a class"
  - "tsconfig.tsbuildinfo added to .gitignore as it is a generated incremental build artifact"
metrics:
  duration_minutes: 15
  completed_date: "2026-05-07"
  tasks_completed: 2
  files_changed: 8
---

# Phase 9 Plan 01: SignalR Foundation and DashboardLayout Wiring Summary

**One-liner:** SignalR HubConnection lifecycle context with useState-based connection, auto-reconnect policy [0,2000,10000,30000]ms, Sonner disconnect toast, and registerReconnectHandler slot for Plan 09-02 gap recovery.

## What Was Built

### Task 1: Install dependencies and create test infrastructure
- Installed `@microsoft/signalr@10.0.0` and `sonner@2.0.7` via pnpm
- Generated `apps/dashboard/components/ui/sonner.tsx` via `shadcn add sonner` (applies theme tokens, wraps Sonner Toaster)
- Created `apps/dashboard/__tests__/__mocks__/signalr.ts` — exports `HubConnectionState` enum and `createMockConnection()` factory with vi.fn() mocks for all lifecycle methods plus `_simulateReconnecting()`, `_simulateClose()`, `_simulateReconnected()` test helpers
- Created `apps/dashboard/__tests__/signalr-context.test.ts` with 8 real SignalRProvider tests + 7 todo stubs for ConnectionDot (Plan 09-03) and LiveEntriesWrapper (Plan 09-02)

### Task 2: Create SignalRProvider context and wire into DashboardLayout
- Created `apps/dashboard/contexts/signalr.context.tsx` with `'use client'` directive:
  - `SignalRContextValue` interface: `{ connection, state, registerReconnectHandler }`
  - `SignalRProvider`: useState-based `HubConnection | null`, lifecycle callbacks before `start()`, `withAutomaticReconnect([0, 2000, 10000, 30000])`, `toast.error('Live updates disconnected')` on close
  - `useSignalRContext()` hook
  - `registerReconnectHandler` via `useCallback` + `useRef` for Plan 09-02 gap recovery
- Modified `DashboardLayout.tsx`: wraps `{children}` in `<SignalRProvider>` inside `<main>`, adds `<Toaster position="bottom-right" />` outside the flex column — no `'use client'` directive (server component can render client components)

## Test Results

- 42 tests passing, 7 todo stubs (ConnectionDot + LiveEntriesWrapper — implemented in Plans 09-02/09-03)
- TypeScript type-check: clean (0 errors)
- Test files: 6 suites passing

## Commits

| Hash | Message |
|------|---------|
| `4555ffa` | feat(09-01): install SignalR + Sonner, create mock and test scaffold |
| `4442db0` | feat(09-01): create SignalRProvider context and wire into DashboardLayout |
| `cc09b5b` | chore(09-01): add tsconfig.tsbuildinfo to .gitignore |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MockBuilder type incompatible with TypeScript 6 strict mode**
- **Found during:** Task 2 type-check
- **Issue:** `ReturnType<typeof vi.fn>` resolves to `Mock<Procedure | Constructable>` which TypeScript 6 strict mode reports as "not callable" (TS2348) when calling `.withUrl(...)`, `.withAutomaticReconnect(...)` etc.
- **Fix:** Changed `MockBuilder` type to use explicit callable signatures `(...args: any[]) => MockBuilder` instead of `ReturnType<typeof vi.fn>`. Added `callBuilderMock()` helper that casts through `(fn as any)()` to invoke the vi.fn() arrow-function mock without `new`.
- **Files modified:** `apps/dashboard/__tests__/signalr-context.test.ts`
- **Commit:** `4442db0`

**2. [Rule 2 - Missing] tsconfig.tsbuildinfo not gitignored**
- **Found during:** Task 2 post-commit git status check
- **Issue:** `tsc --noEmit` with `incremental: true` generates `tsconfig.tsbuildinfo` — a build cache artifact that should not be tracked
- **Fix:** Added `tsconfig.tsbuildinfo` to root `.gitignore`
- **Files modified:** `.gitignore`
- **Commit:** `cc09b5b`

## Known Stubs

The following test stubs are intentional placeholders for future plans:

| Stub | File | Reason |
|------|------|--------|
| `it.todo('renders green dot when Connected')` | `__tests__/signalr-context.test.ts` | ConnectionDot component implemented in Plan 09-03 |
| `it.todo('renders yellow dot with animate-pulse when Reconnecting')` | `__tests__/signalr-context.test.ts` | ConnectionDot component implemented in Plan 09-03 |
| `it.todo('renders red dot when Disconnected')` | `__tests__/signalr-context.test.ts` | ConnectionDot component implemented in Plan 09-03 |
| `it.todo('has role=status and correct aria-label')` | `__tests__/signalr-context.test.ts` | ConnectionDot component implemented in Plan 09-03 |
| `it.todo('prepends new entry from NewEntry event')` | `__tests__/signalr-context.test.ts` | LiveEntriesWrapper implemented in Plan 09-02 |
| `it.todo('caps combined entries at 200 rows')` | `__tests__/signalr-context.test.ts` | LiveEntriesWrapper row cap (T-09-03 mitigation) implemented in Plan 09-02 |
| `it.todo('calls fetchEntriesSince on reconnect with last crawledAt timestamp')` | `__tests__/signalr-context.test.ts` | Gap recovery implemented in Plan 09-02 |

These stubs do NOT prevent Plan 09-01's goal from being achieved — all foundation components are wired and tested.

## Threat Flags

No new security-relevant surface introduced beyond what is in the plan's threat model. The `NEXT_PUBLIC_API_URL` usage in `signalr.context.tsx` is covered by T-09-02 (accepted: intentionally public URL, standard Next.js pattern).

## Self-Check: PASSED

- `apps/dashboard/contexts/signalr.context.tsx` — FOUND
- `apps/dashboard/components/ui/sonner.tsx` — FOUND
- `apps/dashboard/__tests__/__mocks__/signalr.ts` — FOUND
- `apps/dashboard/__tests__/signalr-context.test.ts` — FOUND
- `apps/dashboard/components/layout/DashboardLayout.tsx` — modified, FOUND
- Commit `4555ffa` — FOUND in git log
- Commit `4442db0` — FOUND in git log
- Commit `cc09b5b` — FOUND in git log
