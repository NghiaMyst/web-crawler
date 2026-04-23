---
phase: 06-signalr-real-time-layer
plan: 01
subsystem: api
tags:
  - signalr
  - dotnet
  - websocket
  - api
dependency_graph:
  requires:
    - apps/api/Program.cs (Phase 5 base)
    - apps/api/Services/CrawlerEventListener.cs (Phase 4 background service)
  provides:
    - apps/api/Hubs/DashboardHub.cs
    - apps/api/Services/HubConnectionTracker.cs
    - SignalR endpoint at /hubs/dashboard
    - Thread-safe connection counting via HubConnectionTracker singleton
  affects:
    - apps/api/Program.cs (CORS, middleware order, DI registrations)
tech_stack:
  added:
    - Microsoft.AspNetCore.SignalR (shared framework, no NuGet needed — Microsoft.NET.Sdk.Web)
  patterns:
    - Primary constructor injection for DashboardHub(HubConnectionTracker tracker)
    - Interlocked/Volatile for lock-free thread-safe counter
    - Server-to-client only hub (no client-invokable methods)
key_files:
  created:
    - apps/api/Services/HubConnectionTracker.cs
    - apps/api/Hubs/DashboardHub.cs
    - apps/api/wwwroot/.gitkeep
    - apps/api.Tests/Services/HubConnectionTrackerTests.cs
    - apps/api.Tests/Hubs/DashboardHubTests.cs
  modified:
    - apps/api/Program.cs
decisions:
  - "SignalR is in shared framework (Microsoft.NET.Sdk.Web) — no NuGet package reference added"
  - "DashboardHub uses primary constructor syntax for HubConnectionTracker injection"
  - "HubConnectionTracker uses Interlocked.Increment/Decrement + Volatile.Read for lock-free thread safety"
  - "CORS AllowCredentials() added with explicit WithOrigins() — AllowAnyOrigin() not used (would throw InvalidOperationException)"
  - "Middleware order: UseCors -> UseStaticFiles -> MapHub (per plan Pitfall 2)"
metrics:
  duration: 12
  completed_date: "2026-04-23"
  tasks_completed: 2
  files_created_or_modified: 6
---

# Phase 6 Plan 01: SignalR Hub Bootstrap Summary

**One-liner:** DashboardHub + HubConnectionTracker singleton wired into Program.cs with SignalR endpoint at /hubs/dashboard, CORS credentials, static files, and 8 unit tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | HubConnectionTracker + DashboardHub with unit tests | ff21ab0 | HubConnectionTracker.cs, DashboardHub.cs, HubConnectionTrackerTests.cs, DashboardHubTests.cs |
| 2 | Program.cs wiring — AddSignalR, AddSingleton, UseStaticFiles, MapHub, AllowCredentials, wwwroot | b23ca6b | Program.cs, wwwroot/.gitkeep |

## What Was Built

### HubConnectionTracker (apps/api/Services/HubConnectionTracker.cs)

Thread-safe singleton counter for live SignalR hub connections. Uses `Interlocked.Increment`/`Interlocked.Decrement` for lock-free writes and `Volatile.Read` for the `Count` getter. Registered as `AddSingleton<HubConnectionTracker>()` in DI so `DashboardHub` lifecycle and the upcoming `/health` extension (Plan 06-02) share the same instance.

### DashboardHub (apps/api/Hubs/DashboardHub.cs)

SignalR hub at `/hubs/dashboard`. Server-to-client only — no client-invokable methods defined. Uses C# 12 primary constructor syntax to inject `HubConnectionTracker`. `OnConnectedAsync` increments, `OnDisconnectedAsync` decrements. `base.*` calls are preserved for SignalR's internal bookkeeping.

### Program.cs additions

- `using WebCrawlerApi.Hubs;` added to using directives
- `builder.Services.AddSignalR()` registered before CORS
- `builder.Services.AddSingleton<HubConnectionTracker>()` registered after AddSignalR
- CORS policy extended with `.AllowCredentials()` — explicit `WithOrigins(CORS_ORIGINS)` preserved (wildcard + credentials is a runtime exception)
- `app.UseStaticFiles()` added after `app.UseCors()` and before `app.MapHub`
- `app.MapHub<DashboardHub>("/hubs/dashboard")` added; all existing endpoint mappings untouched

### wwwroot/.gitkeep

Empty sentinel file ensuring `apps/api/wwwroot/` is tracked by git. Required so `app.UseStaticFiles()` can resolve `test-signalr.html` in Plan 06-03 without a directory-not-found error.

## Test Results

- 8 new tests added (5 tracker + 3 hub), all pass
- Full test suite: 83 tests passed, 0 failed
- No existing tests regressed from Program.cs edits

### HubConnectionTrackerTests (5 tests)

- `Count_StartsAtZero` — initial state
- `Increment_IncreasesCount` — 3 increments yield Count 3
- `Decrement_DecreasesCount` — increment then decrement yields 0
- `Decrement_GoesNegativeIfOverDecremented` — documents no-clamp behavior
- `Increment_IsThreadSafe_Under1000ParallelCalls` — Parallel.For(1000) yields Count 1000

### DashboardHubTests (3 tests)

- `OnConnectedAsync_IncrementsTracker`
- `OnDisconnectedAsync_DecrementsTracker`
- `OnConnected_ThenOnDisconnected_ReturnsToZero`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all implementation is functional. `/health` hub_connections field is a stub target for Plan 06-02, but that is an intentional scope boundary.

## Threat Flags

No new security-relevant surfaces beyond what the plan's threat model covers. The `/hubs/dashboard` endpoint is unauthenticated as expected for this personal project (T-06-02 accepted; T-06-01 mitigated by AllowCredentials + explicit origins; T-06-03 mitigated by no client-invokable methods; T-06-04 mitigated by .gitkeep).

## Self-Check: PASSED

Files verified present:
- apps/api/Services/HubConnectionTracker.cs — FOUND
- apps/api/Hubs/DashboardHub.cs — FOUND
- apps/api/wwwroot/.gitkeep — FOUND
- apps/api.Tests/Services/HubConnectionTrackerTests.cs — FOUND
- apps/api.Tests/Hubs/DashboardHubTests.cs — FOUND
- apps/api/Program.cs (modified) — FOUND

Commits verified:
- ff21ab0 — feat(06-01): add HubConnectionTracker + DashboardHub with unit tests
- b23ca6b — feat(06-01): wire SignalR in Program.cs
