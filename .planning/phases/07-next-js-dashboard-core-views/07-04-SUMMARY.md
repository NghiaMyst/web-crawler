---
phase: 07-next-js-dashboard-core-views
plan: 04
subsystem: ui
tags: [nextjs, server-actions, react-hook-form, zod, optimistic-ui, dialog, crud, react19]

requires:
  - phase: 07-01
    provides: "api.server.ts fetchSources/createSource/updateSource/deleteSource, sourceSchema/sourceUpdateSchema, Source/CreateSourceRequest/UpdateSourceRequest types"
  - phase: 07-02
    provides: "DashboardLayout shell, UI component library (Button, Badge, Table, Dialog, Input, Select, Label)"

provides:
  - "/sources page — full CRUD source management with optimistic UI"
  - "createSourceAction, updateSourceAction, deleteSourceAction Server Actions with Zod validation"
  - "SourcesClient with useOptimistic for instant delete/add feedback"
  - "SourceModal (RHF+Zod) handling both add and edit modes"
  - "DeleteSourceDialog — separate destructive confirmation dialog"
  - "SourcesEmptyState — empty state with Add Source CTA"

affects: [07-05, future-phases-using-sources]

tech-stack:
  added: []
  patterns:
    - "Server Actions return discriminated union ActionResult<T> — no thrown exceptions surface to client"
    - "useOptimistic layered over useState baseSources — baseSources is authoritative truth, useOptimistic is transient UI"
    - "Form schema split: z.coerce for server validation, z.number() for RHF form (valueAsNumber:true handles coercion)"
    - "Immutable API fields (name, category, parserKey, crawlerType) disabled in edit mode — enforces PUT constraint"

key-files:
  created:
    - apps/dashboard/actions/source.actions.ts
    - apps/dashboard/app/sources/page.tsx
    - apps/dashboard/components/sources/SourcesClient.tsx
    - apps/dashboard/components/sources/SourcesTable.tsx
    - apps/dashboard/components/sources/SourceModal.tsx
    - apps/dashboard/components/sources/DeleteSourceDialog.tsx
    - apps/dashboard/components/sources/SourcesEmptyState.tsx
  modified: []

key-decisions:
  - "z.number() used in SourceModal's local form schema (not z.coerce.number()) because Zod 4 infers coerce input as unknown, breaking RHF type inference — valueAsNumber:true in register() handles HTML string-to-number conversion before Zod sees the value"
  - "useOptimistic + baseSources dual-state: baseSources (useState) is the ground truth between revalidations; useOptimistic layers transient UI on top and auto-reverts when the Server Action returns — delete rollback restores to baseSources"
  - "deleteSourceAction called directly from SourcesClient (not wrapped in startTransition) because React 19 async event handlers auto-wrap in transitions, satisfying useOptimistic's transition requirement"

patterns-established:
  - "ActionResult<T>: { ok: true; data: T } | { ok: false; error: string; fieldErrors? } — avoids throwing from Server Actions, keeps modal open for inline field error display"
  - "Toast for delete rollback: inline fixed-position div (no external toast library needed for v1)"
  - "OptimisticAction discriminated union (add | delete | replace) passed to useOptimistic reducer"

requirements-completed: [DASH-03]

duration: 25min
completed: 2026-05-04
---

# Phase 07 Plan 04: Sources CRUD Page Summary

**Full source management page at /sources with Server Actions, useOptimistic delete/add, React Hook Form + Zod modal, and destructive confirmation dialog**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-04T00:00:00Z
- **Completed:** 2026-05-04T00:25:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Server Actions implementing full CRUD with Zod validation and discriminated union returns (no thrown exceptions to client)
- SourcesClient using React 19 `useOptimistic` for instant delete feedback with automatic rollback on Server Action error
- SourceModal handling add/edit modes with React Hook Form + zodResolver; immutable fields disabled in edit mode per .NET PUT API constraint
- Build passes: `/sources` shows as dynamic route (ƒ) in Next.js 16 Turbopack build output

## Task Commits

Each task was committed atomically:

1. **Task 1: Server Actions + page server component + SourcesEmptyState** - `eff8339` (feat)
2. **Task 2: SourcesClient, SourcesTable, SourceModal, DeleteSourceDialog** - `d123a50` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/dashboard/actions/source.actions.ts` — createSourceAction, updateSourceAction, deleteSourceAction; Zod validation + revalidatePath
- `apps/dashboard/app/sources/page.tsx` — Async server component fetching sources and rendering SourcesClient
- `apps/dashboard/components/sources/SourcesClient.tsx` — useOptimistic orchestrator; baseSources + toast state
- `apps/dashboard/components/sources/SourcesTable.tsx` — Table with status Badge, edit/delete icon buttons, Loader2 pending spinner
- `apps/dashboard/components/sources/SourceModal.tsx` — Dialog + RHF + zodResolver; disabled immutable fields in edit mode
- `apps/dashboard/components/sources/DeleteSourceDialog.tsx` — Destructive confirmation Dialog per UI-SPEC copy
- `apps/dashboard/components/sources/SourcesEmptyState.tsx` — Empty state with exact UI-SPEC copy

## Decisions Made

**Server Actions return discriminated union, never throw:**
```typescript
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
```
This keeps the modal open when validation/API errors occur, allowing inline field error display.

**useOptimistic + baseSources dual-state pattern:**
- `baseSources` (useState) = authoritative truth (synchronized with server after each mutation)
- `optimisticSources` (useOptimistic) = what the UI renders (instantly reflects user intent)
- On delete error: baseSources is restored with the original row; optimisticSources reverts automatically
- On delete success: baseSources is filtered; both states converge

**Edit mode field disabling:**
The .NET PUT endpoint (`/api/sources/{id}`) only accepts `displayName`, `url`, `crawlInterval`, `priority`, `isActive`. Fields `name`, `category`, `parserKey`, `crawlerType` are immutable once created. The modal disables these via `disabled={isEdit}` and the `updateSourceAction` only sends the accepted fields.

**Toast for rollback errors:**
Simple inline fixed-position `div` with `role="alert"` — no external toast library needed for v1 scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Form schema uses z.number() instead of z.coerce.number() for RHF compatibility**
- **Found during:** Task 2 (SourceModal type-check)
- **Issue:** Zod 4 infers `z.coerce.number()` input type as `unknown`. With `@hookform/resolvers` 5.x, `zodResolver(sourceSchema)` produces `Resolver<{ crawlInterval: unknown; ... }>` which is incompatible with `useForm<SourceFormData>` (expects `number`). TypeScript error TS2322.
- **Fix:** Created `sourceFormSchema` local to SourceModal using `z.number()` (not `z.coerce`). Added `valueAsNumber: true` to `register('crawlInterval')` and `register('priority')` calls so HTML string-to-number conversion happens before Zod sees the value. Server-side actions still use `sourceSchema` (with `z.coerce`) for defense-in-depth.
- **Files modified:** `apps/dashboard/components/sources/SourceModal.tsx`
- **Verification:** `pnpm type-check` exits 0; `pnpm build` exits 0
- **Committed in:** `d123a50` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type bug)
**Impact on plan:** Required fix for TypeScript correctness. No behavioral difference — both z.number() and z.coerce.number() produce the same output when the value is already a number. Server Actions retain z.coerce for defense-in-depth validation.

## Issues Encountered

None beyond the Zod 4 / RHF type inference issue documented above.

## Known Stubs

None — all data flows are wired. SourcesPage fetches from .NET API via `fetchSources()`, mutations call real Server Actions, optimistic state reflects actual server responses.

## Next Phase Readiness

- `/sources` CRUD page is fully functional
- Server Actions ready for reuse or extension in other forms
- `ActionResult<T>` pattern established for all future Server Actions in the dashboard
- `/sources` dynamic route confirmed working in production build

---
*Phase: 07-next-js-dashboard-core-views*
*Completed: 2026-05-04*

## Self-Check: PASSED

- FOUND: apps/dashboard/actions/source.actions.ts
- FOUND: apps/dashboard/app/sources/page.tsx
- FOUND: apps/dashboard/components/sources/SourcesEmptyState.tsx
- FOUND: apps/dashboard/components/sources/SourcesClient.tsx
- FOUND: apps/dashboard/components/sources/SourcesTable.tsx
- FOUND: apps/dashboard/components/sources/SourceModal.tsx
- FOUND: apps/dashboard/components/sources/DeleteSourceDialog.tsx
- FOUND commit: eff8339 (Task 1)
- FOUND commit: d123a50 (Task 2)
