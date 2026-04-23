---
phase: 06-signalr-real-time-layer
plan: 02
subsystem: api
tags:
  - signalr
  - dotnet
  - broadcast
  - health
  - api
dependency_graph:
  requires:
    - apps/api/Hubs/DashboardHub.cs (Phase 6 Plan 01)
    - apps/api/Services/HubConnectionTracker.cs (Phase 6 Plan 01)
    - apps/api/Services/CrawlerEventListener.cs (Phase 4 background service)
    - apps/api/Endpoints/HealthCheck.cs (Phase 5 health endpoint)
    - apps/api/Models/Responses/DataEntryResponse.cs (Phase 5 DTO)
  provides:
    - CrawlerEventListener broadcasts NewEntry SignalR event per parsed entry
    - /health JSON response includes hub_connections field from HubConnectionTracker.Count
  affects:
    - apps/api/Services/CrawlerEventListener.cs (new IHubContext<DashboardHub> param, internal EvaluateAndNotifyAsync)
    - apps/api/Endpoints/HealthCheck.cs (new optional hubConnections parameter)
    - apps/api/Program.cs (/health route injects HubConnectionTracker)
tech_stack:
  added: []
  patterns:
    - IHubContext<DashboardHub> constructor injection for background service broadcast
    - JsonElement.Clone() to detach payload from EF-tracked JsonDocument lifetime (Pitfall 6)
    - try/catch around broadcast — failures logged, never rethrow (Pitfall 5)
    - Optional parameter with default 0 for backward-compatible API extension
key_files:
  created:
    - apps/api.Tests/Services/CrawlerEventListenerBroadcastTests.cs
  modified:
    - apps/api/Services/CrawlerEventListener.cs
    - apps/api/Endpoints/HealthCheck.cs
    - apps/api/Program.cs
    - apps/api.Tests/Endpoints/HealthEndpointTests.cs
decisions:
  - "IHubContext<DashboardHub> injected as 4th primary constructor parameter (NOT DashboardHub directly — avoids Pitfall 3 singleton hub instantiation)"
  - "EvaluateAndNotifyAsync changed from private to internal to enable unit testing via InternalsVisibleTo (already declared in WebCrawlerApi.csproj)"
  - "Broadcast fires BEFORE NotificationDispatcher so real-time clients receive entries even if notification delivery fails"
  - "Payload.RootElement.Clone() used for DataEntryResponse to survive async SignalR serialization after JsonDocument using-scope exits (Pitfall 6)"
  - "hubConnections = 0 default in CheckHealth preserves backward compatibility — existing 4 tests pass without changes to call sites"
metrics:
  duration: 15
  completed_date: "2026-04-23"
  tasks_completed: 2
  files_created_or_modified: 5
---

# Phase 6 Plan 02: Broadcast + Health hub_connections Summary

**One-liner:** CrawlerEventListener wired with IHubContext<DashboardHub> to broadcast DataEntryResponse as NewEntry SignalR event after each upsert; /health extended with hub_connections field from HubConnectionTracker.Count; 9 tests total (6 health + 3 broadcast), full suite 88 tests green.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend /health with hub_connections + update HealthCheck tests | 1b64481 | HealthCheck.cs, Program.cs, HealthEndpointTests.cs |
| 2 | Broadcast NewEntry after UpsertEntryAsync + broadcast unit test | 07f1ae8 | CrawlerEventListener.cs, CrawlerEventListenerBroadcastTests.cs |

## What Was Built

### CrawlerEventListener broadcast injection (apps/api/Services/CrawlerEventListener.cs)

- Added `using Microsoft.AspNetCore.SignalR`, `using WebCrawlerApi.Hubs`, `using WebCrawlerApi.Models.Responses`
- Extended primary constructor with `IHubContext<DashboardHub> hubContext` as 4th parameter (before `ILogger`)
- Changed `EvaluateAndNotifyAsync` from `private` to `internal` to allow unit test access via `InternalsVisibleTo`
- Inserted broadcast block in `EvaluateAndNotifyAsync` after the `upserted` re-read and before `NotificationDispatcher`:
  - Constructs `DataEntryResponse` with `upserted.Payload.RootElement.Clone()` (Pitfall 6 mitigation)
  - Calls `await hubContext.Clients.All.SendAsync("NewEntry", broadcastDto, ct)`
  - Wraps in try/catch — `LogError` on failure, never rethrows (Pitfall 5 mitigation, D-01, D-02)

### HealthCheck.cs extension (apps/api/Endpoints/HealthCheck.cs)

- Added `int hubConnections = 0` optional parameter to `CheckHealth` signature
- Added `hub_connections = hubConnections` to response body anonymous object
- `hubConnections` is informational only — never affects overall status or status code

### Program.cs /health route update (apps/api/Program.cs)

- `/health` lambda now injects `HubConnectionTracker hubTracker` as third parameter
- Passes `hubTracker.Count` to `CheckHealth` as `hubConnections` argument

### HealthEndpointTests.cs updates (apps/api.Tests/Endpoints/HealthEndpointTests.cs)

- `ExtractResult` helper updated to 5-tuple: `(int StatusCode, string Status, string Postgres, string Redis, int HubConnections)`
- Reads `hub_connections` JSON property via `doc.RootElement.GetProperty("hub_connections").GetInt32()`
- Existing 4 tests updated to destructure 5 values (discard `hub_connections` with `_`)
- 2 new tests added:
  - `CheckHealth_WithHubConnections_ReturnsCountInBody` — passes 7, asserts `hub_connections: 7`
  - `CheckHealth_HubConnectionsZero_DoesNotDegradeStatus` — passes 0, asserts status remains "ok"

### CrawlerEventListenerBroadcastTests.cs (apps/api.Tests/Services/CrawlerEventListenerBroadcastTests.cs)

3 new `[Fact]` tests via mocked `IHubContext<DashboardHub>` / `IClientProxy`:
- `Broadcast_FiresAfterUpsert_SendsNewEntryEventOnce` — verifies `SendCoreAsync("NewEntry", ...)` called exactly once with `DataEntryResponse` argument
- `Broadcast_PayloadIsDataEntryResponse_WithValidPayloadElement` — captures argument, asserts `SourceId`, `EntryKey`, non-Undefined `Payload.ValueKind`
- `Broadcast_WhenSendAsyncThrows_DoesNotBubbleException` — mock throws, asserts no exception propagates from handler

## Test Results

- 6 HealthEndpointTests pass (4 existing + 2 new)
- 3 CrawlerEventListenerBroadcastTests pass (all new)
- Full suite: 88 tests passed, 0 failed (up from 83 after 06-01; +5 from this plan; +3 from broadcast tests + 2 health tests net new)

## Deviations from Plan

None — plan executed exactly as written. Named parameters used in ParsedEntry constructor calls to match actual record field order `(SourceId, EntryKey, Category, Payload)` which differs from the plan's positional example — this is conformance to the actual type definition, not a deviation.

## Known Stubs

None — all implementation is functional. The NewEntry broadcast event contract is now live and ready for Plan 06-03 browser test-page consumption.

## Threat Flags

No new security-relevant surfaces beyond plan's threat model. All surfaces (broadcast payload, /health extension) are covered by T-06-05 through T-06-09 in the plan's STRIDE register.

## Self-Check: PASSED

Files verified present:
- apps/api/Services/CrawlerEventListener.cs — FOUND (modified)
- apps/api/Endpoints/HealthCheck.cs — FOUND (modified)
- apps/api/Program.cs — FOUND (modified)
- apps/api.Tests/Endpoints/HealthEndpointTests.cs — FOUND (modified)
- apps/api.Tests/Services/CrawlerEventListenerBroadcastTests.cs — FOUND (created)

Commits verified:
- 1b64481 — feat(06-02): extend /health with hub_connections + update HealthCheck tests
- 07f1ae8 — feat(06-02): broadcast NewEntry via IHubContext after UpsertEntryAsync + 3 unit tests
