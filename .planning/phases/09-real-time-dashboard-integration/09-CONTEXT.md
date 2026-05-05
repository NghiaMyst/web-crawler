# Phase 9: Real-Time Dashboard Integration - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the existing SignalR hub (`/hubs/dashboard`, built in Phase 6) to the Next.js dashboard
(Phases 7–8). New `data_entries` rows appear in the entries data table in real time without
page refresh, powered by `@microsoft/signalr` JS client. Auto-reconnect with a connection
status indicator in the nav bar.

Covers: DASH-07 (real-time data updates via SignalR).

Not in scope: the SignalR hub itself (Phase 6), production WebSocket proxy config (Phase 10),
any new dashboard pages or features beyond real-time wiring.

</domain>

<decisions>
## Implementation Decisions

### Connection Scope
- **D-01:** Global React Context Provider (`SignalRProvider`) wrapping `DashboardLayout`.
  The connection is established once on layout mount and persists across all pages (Entries,
  Sources, Jobs, Alerts). Any component in the tree can read connection state via a
  `useSignalRContext()` hook. This is required for the nav bar status indicator (SC-3) to
  always reflect live connection state regardless of which page the user is on.

### Live Entries Architecture
- **D-02:** `LiveEntriesWrapper` client component (`'use client'`) wrapping the entries section
  on the `/entries` page. Maintains a `liveEntries: DataEntry[]` state populated by `NewEntry`
  SignalR events. Renders live entries prepended above the server-fetched `EntriesTable`
  (RSC data). Cap at 200 total displayed rows — when the combined live + server count exceeds
  200, trim oldest entries. The existing RSC pattern and `EntriesTable` component are unchanged.
- **D-03:** On reconnect (`onreconnected`), call `GET /api/entries?since=<last_received_at>`
  to fetch missed rows and prepend them (Phase 6 D-03 decision, carried forward).

### Connection Status Indicator
- **D-04:** Small colored dot placed next to the "Web Crawler" brand text in both `Sidebar.tsx`
  (desktop) and `MobileNav.tsx` (mobile header). Consistent indicator across all breakpoints.
  Three states:
  - `Connected` → green dot
  - `Reconnecting` → yellow dot with CSS pulse animation
  - `Disconnected` → red dot
  The dot reads connection state from `SignalRProvider` context.

### Reconnect Toast
- **D-05:** Install **Sonner** (shadcn-compatible toast library, tiny footprint). Add `<Toaster />`
  to `DashboardLayout`. Two toast triggers:
  - On `onreconnected`: `toast.success("Reconnected — loaded N missed entries")`
  - On `onclose` / permanent disconnect: `toast.error("Live updates disconnected")`
  Sonner is the standard companion for shadcn/ui projects and requires no custom styling.

### Claude's Discretion
- Exact Sonner toast position (top-right vs. bottom-right) and duration
- Auto-reconnect policy config passed to `HubConnectionBuilder` (retry intervals, max attempts)
- Whether `liveEntries` and server entries share a single merged array or render as two adjacent lists
- Exact CSS for the pulsing yellow dot animation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — DASH-07 (real-time data updates via SignalR — the requirement this phase closes)
- `.planning/ROADMAP.md` — Phase 9 success criteria (SC-1: entry appears within 3s; SC-2: auto-reconnect within 30s; SC-3: nav bar status indicator), Plans 09-01/02/03 descriptions

### Phase 6 SignalR Hub (must read — this is what Phase 9 connects to)
- `.planning/phases/06-signalr-real-time-layer/06-CONTEXT.md` — Hub architecture decisions:
  D-01 (broadcasts every new entry regardless of alert rules), D-02 (event name: `NewEntry`,
  payload shape: `DataEntryResponse` DTO), D-03 (reconnect gap recovery via
  `GET /api/entries?since=<last_received_at>`), D-06 (hub live at `/hubs/dashboard`),
  D-07 (CORS requires `AllowCredentials()` with explicit origins — not wildcard)

### Phase 8 Dashboard Patterns (must follow)
- `.planning/phases/08-next-js-dashboard-alerts-charts/08-CONTEXT.md` — Shadcn/ui Tailwind v4
  CSS-first patterns (no tailwind.config.js), component conventions, `'use client'` boundary placement

### Existing Source Files (read before implementing)
- `apps/dashboard/components/layout/DashboardLayout.tsx` — Mount point for `SignalRProvider` wrapper
- `apps/dashboard/components/layout/Sidebar.tsx` — Add dot indicator here (desktop)
- `apps/dashboard/components/layout/MobileNav.tsx` — Add dot indicator here (mobile)
- `apps/dashboard/components/entries/entries-table.tsx` — Existing table component; preserved unchanged
- `apps/dashboard/app/entries/page.tsx` — Where `LiveEntriesWrapper` is inserted
- `apps/dashboard/types/api.ts` — `DataEntry` interface (shape of `NewEntry` event payload)
- `apps/dashboard/lib/api.client.ts` — Client-side fetch helper for reconnect gap recovery call

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/dashboard/types/api.ts` → `DataEntry` interface — matches `DataEntryResponse` DTO from Phase 6; no new type needed for SignalR payload
- `apps/dashboard/lib/api.client.ts` — client-side fetch helper; add `fetchEntriesSince(since: string)` here for reconnect gap recovery
- `apps/dashboard/components/ui/` — Button, Badge, Skeleton all available; no new installs needed beyond Sonner

### Established Patterns
- `'use client'` boundary: client components are co-located with server components in the same directory (e.g., `entries-filters.tsx` is client, `entries-table.tsx` is server); follow same pattern for `LiveEntriesWrapper`
- React Context for shared state: no existing Context in dashboard yet — `SignalRProvider` is the first; wrap `DashboardLayout` children, not the layout shell itself
- Shadcn/ui Tailwind v4 CSS-first: all styling in `globals.css @theme` block — no `tailwind.config.js`; add dot colors as CSS variables if needed

### Integration Points
- `apps/dashboard/components/layout/DashboardLayout.tsx` — wrap `<main>` content (or full children) with `<SignalRProvider>`
- `apps/dashboard/app/entries/page.tsx` — insert `<LiveEntriesWrapper>` around `<EntriesTable>` inside `EntriesContent`
- `apps/dashboard/components/layout/Sidebar.tsx` — add `<ConnectionDot />` next to "Web Crawler" span in the header `div`
- `apps/dashboard/components/layout/MobileNav.tsx` — add same `<ConnectionDot />` next to "Web Crawler" span in the `header`
- `apps/dashboard/package.json` — add `@microsoft/signalr` and `sonner` to dependencies

</code_context>

<specifics>
## Specific Ideas

- The nav bar dot should pulse (CSS animation) in the "Reconnecting" state to signal activity — not just a static yellow dot
- Reconnect toast should be informative: "Reconnected — loaded N missed entries" (show exact count from the gap recovery call), not just "Reconnected"
- The `LiveEntriesWrapper` row cap (200 rows total) is defined in Roadmap Plan 09-02 — enforce this by slicing when the combined count exceeds the limit

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-real-time-dashboard-integration*
*Context gathered: 2026-05-05*
