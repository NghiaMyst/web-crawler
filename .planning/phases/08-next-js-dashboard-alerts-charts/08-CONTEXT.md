# Phase 8: Next.js Dashboard — Alerts & Charts - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

The dashboard gains a working alert rule CRUD interface (list, add, edit, delete), a notification history log (filterable by source), and entry volume trend charts — all backed by live .NET API data.

Phase 7 built: entries table, source management, job management, shared layout shell.
Phase 8 adds: alert rules page, notification history page, charts page, and the .NET stats endpoint.

Real-time updates (SignalR) belong in Phase 9.

</domain>

<decisions>
## Implementation Decisions

### Chart Library
- **D-01:** Use **Shadcn Charts** (Recharts-based wrappers). Installed via `pnpm dlx shadcn add chart`. Consistent with existing Shadcn component system (zinc/neutral color palette, same CSS variable theming), Recharts under the hood so all Recharts primitives are available if needed.

### Alert Condition Form Design
- **D-02:** **Type selector + conditional field reveal** inside the alert rule modal.
  - Dropdown for `type`: `new_item` | `field_changed` | `threshold`
  - `new_item` → no extra fields
  - `field_changed` → reveals "Field path" text input (e.g., `patch_version`)
  - `threshold` → reveals "Field path" + "Threshold value" numeric input
  - Follows the React Hook Form + Zod pattern from SourceModal — `watch("conditionType")` drives conditional field rendering
  - Zod schema uses discriminated union matching the 3 condition shapes

### Alert Rule Editing
- **D-03:** Add **PUT endpoint** to the .NET API (`PUT /api/alert-rules/{id}`) in `apps/api/Endpoints/AlertRulesEndpoints.cs`. Pre-populates the form on edit, clean REST, consistent with Sources CRUD pattern. Plan 08-04 already touches the API for the stats endpoint — both API changes land in the same plan or adjacent ones.

### Chart Date Range
- **D-04:** **Dropdown selector** with preset options: `7d` | `30d` | `90d`. Client-side `useState` for selected range. The `GET /api/stats/volume?groupBy=day&range={range}` endpoint accepts the range param. Default to `7d` (matches success criterion).

### Claude's Discretion
- Exact Shadcn Chart component variant (ChartLine vs ChartBar) and color assignment per source
- Whether to use a single combined page or separate routes for line chart vs bar chart
- Notification history page — exact column layout beyond status/channel/message/timestamp
- Alert rule `messageTpl` field — include in form or omit for v1 simplicity
- NavLinks additions (which icons for Alerts, Notifications, Charts from lucide-react)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Phase 8 requirements: DASH-02 (charts), DASH-05 (alert rules), DASH-06 (notification history)
- `.planning/ROADMAP.md` — Phase 8 success criteria (4 items), plan descriptions (08-01 through 08-04)

### Phase 7 Patterns (must follow exactly)
- `.planning/phases/07-next-js-dashboard-core-views/07-01-SUMMARY.md` — foundation: Tailwind v4, Shadcn init, api.server.ts/api.client.ts split, types/api.ts shapes
- `.planning/phases/07-next-js-dashboard-core-views/07-04-SUMMARY.md` — CRUD pattern: ActionResult<T>, useOptimistic dual-state, RHF+Zod modal, Server Actions

### API Entity Shapes
- `apps/api/Data/Entities/AlertRule.cs` — AlertRule fields: Id, SourceId, Name, Condition (JsonDocument), MessageTpl, Channel, IsActive, CreatedAt
- `apps/api/Data/Entities/NotificationLog.cs` — NotificationLog fields: Id, AlertRuleId, DataEntryId, Channel, Message, Status, SentAt
- `apps/api/Endpoints/AlertRulesEndpoints.cs` — existing GET/POST/DELETE; PUT must be added here

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/dashboard/components/ui/` — Button, Dialog, Table, Select, Badge, Input, Label, Skeleton — all available, no new installs needed for CRUD pages
- `apps/dashboard/actions/source.actions.ts` — canonical Server Actions template (ActionResult<T>, Zod parse, revalidatePath)
- `apps/dashboard/components/sources/SourceModal.tsx` — RHF + zodResolver modal pattern; template for AlertRuleModal
- `apps/dashboard/components/sources/SourcesClient.tsx` — useOptimistic + baseSources dual-state pattern
- `apps/dashboard/lib/api.server.ts` — add fetchAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, fetchNotifications, fetchVolumeStats here
- `apps/dashboard/types/api.ts` — add AlertRule, NotificationLog, VolumeStats TypeScript interfaces here

### Established Patterns
- Server Actions return `ActionResult<T>`: `{ ok: true; data: T } | { ok: false; error: string; fieldErrors? }` — never throw to client
- `useOptimistic` + `useState` dual-state: base state is authoritative, optimistic state is transient UI layer
- `z.number()` (not `z.coerce.number()`) for numeric inputs with `valueAsNumber: true` in RHF register — Zod 4 coerce breaks RHF type inference
- Shadcn/ui Tailwind v4 CSS-first — no `tailwind.config.js`, all in `globals.css @theme` block

### Integration Points
- `apps/api/Endpoints/AlertRulesEndpoints.cs` — add `MapPut("/{id:guid}", UpdateAlertRule)` handler
- `apps/dashboard/components/layout/NavLinks.tsx` — add nav entries for `/alerts`, `/notifications`, `/charts`
- `apps/dashboard/lib/api.server.ts` — extend with alert rules + notification + stats fetch helpers
- `apps/dashboard/types/api.ts` — extend with AlertRule, NotificationLog, VolumeDataPoint interfaces

</code_context>

<specifics>
## Specific Ideas

- Alert condition form uses `watch("conditionType")` to drive conditional field rendering — same RHF watch pattern that would be used in any dynamic form
- Shadcn Charts installed via CLI (`pnpm dlx shadcn add chart`) rather than manual Recharts install — keeps it consistent with how other UI components were added in Phase 7

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-next-js-dashboard-alerts-charts*
*Context gathered: 2026-05-05*
