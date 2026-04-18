---
phase: 05-net-rest-api
plan: "05"
subsystem: api
tags: [health-check, postgresql, redis, monitoring, tdd]
dependency_graph:
  requires: [05-01]
  provides: [health-endpoint-with-db-redis-probes]
  affects: [apps/api/Program.cs, apps/api/Endpoints/HealthCheck.cs]
tech_stack:
  added: []
  patterns: [Func<Task> probe delegates for testability, IStatusCodeHttpResult interface for test assertions]
key_files:
  created:
    - apps/api/Endpoints/HealthCheck.cs
    - apps/api.Tests/Endpoints/HealthEndpointTests.cs
  modified:
    - apps/api/Program.cs
decisions:
  - "HealthCheck uses Func<Task> probe delegates instead of injecting AppDbContext+IConnectionMultiplexer directly, enabling pure unit tests without DB/Redis infrastructure"
  - "Tests use IStatusCodeHttpResult + IValueHttpResult interfaces to extract status code and body from IResult, avoiding anonymous type generic parameter mismatch"
  - "CheckHealth method is public (not internal) so the test project can access it without InternalsVisibleTo assembly attribute"
metrics:
  duration_seconds: 480
  completed_date: "2026-04-18"
  tasks_completed: 1
  files_changed: 3
---

# Phase 05 Plan 05: Health Endpoint with PostgreSQL and Redis Probes Summary

**One-liner:** /health endpoint extended with SELECT 1 PostgreSQL probe and Redis PingAsync probe, returning structured JSON with per-service ok/error status and HTTP 200/503 codes.

## Tasks Completed

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 (RED) | Failing tests for health endpoint | ff376b1 | Done |
| 1 (GREEN) | HealthCheck.cs + Program.cs update | 21186f4 | Done |

## What Was Built

### apps/api/Endpoints/HealthCheck.cs

New static class with `CheckHealth(Func<Task> pgProbe, Func<Task> redisProbe)`:
- Wraps each probe in try/catch, mapping success to "ok" and exception to "error"
- Returns `Results.Ok(body)` (HTTP 200) when both services healthy
- Returns `Results.Json(body, statusCode: 503)` when either fails
- Body: `{ status, postgres, redis }` — no exception details exposed (T-05-16)

### apps/api/Program.cs

Replaced:
```csharp
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "api" }));
```
With:
```csharp
app.MapGet("/health", async (AppDbContext db, IConnectionMultiplexer redis) =>
    await HealthCheck.CheckHealth(
        () => db.Database.ExecuteSqlRawAsync("SELECT 1"),
        async () => { await redis.GetDatabase().PingAsync(); }));
```

### apps/api.Tests/Endpoints/HealthEndpointTests.cs

4 unit tests covering all probe combinations:
- Both healthy → 200, status=ok, postgres=ok, redis=ok
- PG fails → 503, status=degraded, postgres=error, redis=ok
- Redis fails → 503, status=degraded, postgres=ok, redis=error
- Both fail → 503, status=degraded, postgres=error, redis=error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AsTask() call on Task<TimeSpan>**
- **Found during:** Task 1 GREEN phase
- **Issue:** Plan suggested `redis.GetDatabase().PingAsync().AsTask()` but `PingAsync()` returns `Task<TimeSpan>` (not `ValueTask`), so `.AsTask()` does not exist
- **Fix:** Changed to `async () => { await redis.GetDatabase().PingAsync(); }` to discard the TimeSpan result and return `Task`
- **Files modified:** apps/api/Program.cs
- **Commit:** 21186f4

**2. [Rule 1 - Bug] Fixed test type assertions for anonymous types**
- **Found during:** Task 1 GREEN phase (first test run)
- **Issue:** `Assert.IsType<Ok<object>>()` fails because `Results.Ok(new { ... })` returns `Ok<AnonymousType>` not `Ok<object>` — generic type parameter mismatch
- **Fix:** Switched to interface-based assertions using `IStatusCodeHttpResult` for status code and `IValueHttpResult` for body value, then serialize/deserialize to extract fields
- **Files modified:** apps/api.Tests/Endpoints/HealthEndpointTests.cs
- **Commit:** 21186f4

**3. [Rule 2 - Missing Access] Made CheckHealth public**
- **Found during:** Task 1 GREEN phase (second test run)
- **Issue:** Plan specified `internal static` but test project is a separate assembly and cannot access `internal` members without `InternalsVisibleTo`
- **Fix:** Changed method visibility to `public static` — simpler than adding assembly attribute
- **Files modified:** apps/api/Endpoints/HealthCheck.cs
- **Commit:** 21186f4

## Threat Model Coverage

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-05-16 (Information Disclosure) | Health endpoint returns only "ok" or "error" strings; exceptions are caught and discarded, no stack traces or connection strings exposed | Mitigated |
| T-05-17 (DoS) | Accepted — SELECT 1 + PING are lightweight, no rate limiting needed | Accepted |

## Known Stubs

None — health endpoint is fully wired to real AppDbContext and IConnectionMultiplexer via Program.cs dependency injection.

## Self-Check

### Files Exist
- `apps/api/Endpoints/HealthCheck.cs` — FOUND
- `apps/api.Tests/Endpoints/HealthEndpointTests.cs` — FOUND
- `apps/api/Program.cs` (modified) — FOUND

### Commits Exist
- ff376b1 (RED phase) — FOUND
- 21186f4 (GREEN phase) — FOUND

### Tests Pass
- `dotnet test --filter "HealthEndpoint"`: Passed 4, Failed 0

### Build
- `dotnet build apps/api/`: Build succeeded, 0 errors, 0 warnings

## Self-Check: PASSED
