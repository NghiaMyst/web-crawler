# Phase 6: SignalR Real-Time Layer - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

SignalR hub at `/hubs/dashboard` pushes every new `data_entries` row to all connected
dashboard clients in real time — no polling required.

Covers: API-10 (SignalR hub `/hubs/dashboard` — real-time push on new entry).

Not in scope: Next.js dashboard UI consuming the hub (Phase 9), production WebSocket proxy
config (Phase 10 — Nginx `/hubs/` path upgrade).

</domain>

<decisions>
## Implementation Decisions

### Hub Broadcast Scope
- **D-01:** Broadcast fires for EVERY new `data_entries` insert, regardless of whether an
  alert rule matches. The hub is a real-time data feed for the dashboard, not a filtered
  alert channel. Entries without alert rules must still appear live.

### Trigger Point in Pipeline
- **D-02:** `CrawlerEventListener.HandleNotificationAsync` is the injection point.
  After `UpsertEntryAsync` completes, inject `IHubContext<DashboardHub>` (singleton,
  available after `AddSignalR()`) and call `Clients.All.SendAsync("NewEntry", entry)`.
  Broadcast fires before `NotificationDispatcher` (alert notification is independent of
  real-time push).

### Reconnect Gap Handling (SC-2)
- **D-03:** Client re-fetch via REST on reconnect. When the SignalR JS client fires its
  `onreconnected` event, it calls `GET /api/entries?since=<last_received_at>` and prepends
  the missed rows. Server stays stateless — no buffering, no server-side gap tracking.
  The test client (06-03) implements this reconnect handler to satisfy SC-2.

### Test Client (Plan 06-03)
- **D-04:** Static file at `apps/api/wwwroot/test-signalr.html`, served by .NET via
  `app.UseStaticFiles()`. Accessible at `http://localhost:5000/test-signalr.html`.
  Uses `@microsoft/signalr` from CDN (no npm/build step).
- **D-05:** Dev-only scaffolding — not maintained long-term. Phase 9 builds the real
  SignalR client in the Next.js dashboard. This page exists only to verify Phase 6 works.

### Hub Connection Count in /health (SC-3)
- **D-06:** Singleton `HubConnectionTracker` service (thread-safe int counter).
  `DashboardHub.OnConnectedAsync` increments; `OnDisconnectedAsync` decrements.
  `/health` response extended to include `"hub_connections": <count>`.

### CORS Extension for SignalR
- **D-07:** SignalR requires `AllowCredentials()` with explicit origins (not wildcard).
  Update the existing CORS policy in `Program.cs` to add `.AllowCredentials()` on the
  same origins array. Do NOT change to wildcard — SignalR rejects credentials with `*`.

### Claude's Discretion
- Exact JSON shape of the `NewEntry` event payload (include full DataEntry fields or a
  minimal DTO — use the same `DataEntryResponse` DTO pattern established in Phase 5 D-08)
- Whether to add a `DashboardHub` folder or place `DashboardHub.cs` directly under `Services/`
- Exact SignalR backplane choice (no backplane needed — single .NET process, in-memory hub)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — API-10 (SignalR hub spec), DASH-07 (dashboard real-time
  requirement — context for what the hub must support in Phase 9)

### Roadmap
- `.planning/ROADMAP.md` — Phase 6 success criteria (3 items), Plans 06-01/02/03 descriptions

### Existing Source Files (must read before implementing)
- `apps/api/Program.cs` — Current DI registrations, CORS setup, MapGroup calls; Phase 6
  adds `AddSignalR()`, `MapHub<DashboardHub>("/hubs/dashboard")`, `UseStaticFiles()`
- `apps/api/Services/CrawlerEventListener.cs` — Injection point for hub broadcast (after
  `UpsertEntryAsync` in `HandleNotificationAsync`)
- `apps/api/Endpoints/HealthCheck.cs` — Extend to include `hub_connections` field from
  `HubConnectionTracker` (satisfies SC-3)
- `apps/api/WebCrawlerApi.csproj` — Add `Microsoft.AspNetCore.SignalR` NuGet reference

### Prior Phase Context
- `.planning/phases/05-net-rest-api/05-CONTEXT.md` — D-08 (DataEntryResponse DTO pattern
  for JSONB payload serialization), D-10 (/health endpoint structure to extend for SC-3)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CrawlerEventListener` (BackgroundService) — existing injection point; already has
  `IServiceScopeFactory` for creating scoped services; `IHubContext<DashboardHub>` is
  singleton and can be injected directly into constructor
- `DataEntryResponse` DTO (Phase 5) — reuse for `NewEntry` event payload shape
- `IConnectionMultiplexer` singleton — already registered, no change needed
- `AppDbContext` with `DataEntries` DbSet — `GET /api/entries?since=` endpoint already
  exists in Phase 5 with date-range filter support

### Established Patterns
- Minimal API with `MapHub` follows same `app.Map*` pattern as `MapGroup`
- Constructor injection in `BackgroundService` for singletons is established in
  `CrawlerEventListener` (receives `IConnectionMultiplexer` directly)
- `Environment.GetEnvironmentVariable` for config — CORS_ORIGINS already uses this pattern

### Integration Points
- `Program.cs` — add `builder.Services.AddSignalR()` + singleton `HubConnectionTracker`;
  add `app.UseStaticFiles()` before `app.MapHub<DashboardHub>("/hubs/dashboard")`
- `CrawlerEventListener.HandleNotificationAsync` — call `_hubContext.Clients.All.SendAsync`
  immediately after `UpsertEntryAsync` (line ~50 in current file)
- `/health` endpoint — inject `HubConnectionTracker` and add `hub_connections` to JSON response

</code_context>

<specifics>
## Specific Ideas

No specific UI references discussed — this is a server + test-client phase.

The test client (`test-signalr.html`) should demonstrate:
1. Connect to `/hubs/dashboard`
2. Display `NewEntry` events in a live list
3. On `onreconnected`: call `GET /api/entries?since=<last_ts>` and prepend missed rows

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-signalr-real-time-layer*
*Context gathered: 2026-04-21*
