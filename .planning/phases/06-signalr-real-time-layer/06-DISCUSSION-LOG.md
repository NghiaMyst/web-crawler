# Phase 6: SignalR Real-Time Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 06-signalr-real-time-layer
**Areas discussed:** Reconnect gap behavior, Test client scope, Hub broadcast filtering

---

## Reconnect Gap Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Client re-fetch via REST | On reconnect, JS client calls GET /api/entries?since=<last_ts> and prepends missed rows. Server stays stateless. | ✓ |
| Accept loss, no buffering | Missed messages lost on disconnect. Fails SC-2. | |
| Server-side in-memory buffer | Hub stores last N entries in singleton List<T>; sends on reconnect. Loses state on restart. | |

**User's choice:** Client re-fetch via REST
**Notes:** Keeps server stateless. Test client (06-03) implements the `onreconnected` handler to satisfy SC-2.

---

## Test Client Scope

### Location

| Option | Description | Selected |
|--------|-------------|----------|
| wwwroot static file | apps/api/wwwroot/test-signalr.html served by .NET UseStaticFiles(). CDN signalR JS. | ✓ |
| Standalone repo root file | Plain HTML at repo root, open via file:// or simple http-server. | |

**User's choice:** wwwroot static file

### Role

| Option | Description | Selected |
|--------|-------------|----------|
| Dev-only scaffolding | Exists only to verify Phase 6. Phase 9 builds real client in Next.js. | ✓ |
| Permanent debug tool | Kept as low-friction way to inspect real-time events without the full dashboard. | |

**User's choice:** Dev-only scaffolding

---

## Hub Broadcast Filtering

| Option | Description | Selected |
|--------|-------------|----------|
| ALL new data_entries inserts | Broadcast fires for every entry written, regardless of alert rules. | ✓ |
| Only alert-matched entries | Broadcast fires only when an alert rule matches. Inconsistent with REST API data. | |

**User's choice:** ALL new data_entries inserts
**Notes:** Dashboard should see all crawled data live, not just alert-triggering entries.

---

## Claude's Discretion

- Exact JSON shape of NewEntry payload (reuse DataEntryResponse DTO from Phase 5)
- Whether DashboardHub.cs lives in Services/ or a dedicated Hubs/ folder
- SignalR backplane (none needed — single process, in-memory hub)
- CORS AllowCredentials() update specifics

## Deferred Ideas

None — discussion stayed within phase scope.
