---
phase: 12
plan: "04"
subsystem: observability
tags: [prometheus, prom-client, prometheus-net, metrics, crawler, dotnet-api]
dependency_graph:
  requires: []
  provides: [crawler-metrics-endpoint, api-metrics-endpoint]
  affects: [12-05-prometheus-scrape-config]
tech_stack:
  added:
    - prom-client@15.1.3 (Node.js Prometheus client, ESM named imports)
    - prometheus-net.AspNetCore@8.2.1 (.NET Prometheus client)
    - Microsoft.AspNetCore.Mvc.Testing@8.0.0 (integration test factory)
  patterns:
    - Node.js http.createServer for standalone metrics server on port 9464
    - BullMQ queue.exportPrometheusMetrics() for queue state metrics
    - Worker.on('completed') hook for crawl duration histogram
    - ASP.NET Core UseRouting + UseHttpMetrics + MapMetrics middleware chain
    - WebApplicationFactory<Program> with in-memory DB + mock Redis for integration tests
key_files:
  created:
    - apps/crawler/src/metrics/metricsServer.ts
    - apps/crawler/src/metrics/crawlMetrics.ts
    - apps/crawler/src/metrics/metricsServer.test.ts
    - apps/crawler/src/metrics/crawlMetrics.test.ts
    - apps/api.Tests/Endpoints/MetricsEndpointTests.cs
  modified:
    - apps/crawler/src/index.ts
    - apps/api/WebCrawlerApi.csproj
    - apps/api/Program.cs
    - apps/api.Tests/WebCrawlerApi.Tests.csproj
    - apps/crawler/package.json
    - pnpm-lock.yaml
decisions:
  - collectDefaultMetrics() called once in metricsServer.ts at module level — index.ts does NOT call it to avoid "already registered" crash
  - MetricsTestFactory uses WebApplicationFactory<Program> with in-memory EF Core and mock Redis; CrawlerEventListener removed from test services to prevent Npgsql connection crash
  - db.Database.Migrate() guarded with IsRelational() check so Program startup works with InMemory provider in tests
  - public partial class Program {} added to Program.cs to expose type for WebApplicationFactory generic parameter
metrics:
  duration: ~35 minutes
  completed_date: "2026-05-25"
  tasks_completed: 2
  files_created: 5
  files_modified: 6
---

# Phase 12 Plan 04: Prometheus Metrics Instrumentation Summary

Instrumented the Node.js crawler with prom-client 15.x (BullMQ queue metrics + crawl latency histogram on port 9464) and the .NET API with prometheus-net.AspNetCore 8.2.1 (HTTP request counter + .NET runtime metrics at /metrics). Both endpoints are ready for Prometheus scraping in Plan 05.

## Tasks Completed

### Task 1: Crawler metrics module (TDD)

Created `apps/crawler/src/metrics/metricsServer.ts` — a standalone Node.js `http.createServer` on port 9464 that aggregates prom-client default metrics and BullMQ `queue.exportPrometheusMetrics()` output from all 6 queues.

Created `apps/crawler/src/metrics/crawlMetrics.ts` — `crawlDurationHistogram` (Histogram with `queue` + `strategy` labels, 8 buckets from 0.5s to 120s) and `instrumentWorker()` that hooks `worker.on('completed')` to observe duration from BullMQ's `processedOn`/`finishedOn` timestamps.

Tests: 6 Vitest tests (3 for metricsServer, 3 for crawlMetrics) — all pass.

**Commit:** `3a18c80`

### Task 2: Wire metrics + .NET API instrumentation (TDD)

Updated `apps/crawler/src/index.ts`: imports `crawlQueue`, `startMetricsServer`, `instrumentWorker`; calls `startMetricsServer([6 queues])` and `instrumentWorker(worker, name)` for all 6 workers.

Updated `apps/api/WebCrawlerApi.csproj`: added `prometheus-net.AspNetCore 8.2.1`.

Updated `apps/api/Program.cs`: added `using Prometheus;`, `app.UseRouting()`, `app.UseHttpMetrics(ReduceStatusCodeCardinality)` before `app.UseCors()`, and `app.MapMetrics()` after all MapGroup calls. Added `public partial class Program {}` for test factory access. Guarded `db.Database.Migrate()` with `IsRelational()` check.

Created `apps/api.Tests/Endpoints/MetricsEndpointTests.cs`: 3 xUnit integration tests via `MetricsTestFactory` (WebApplicationFactory with in-memory DB, mock Redis, CrawlerEventListener removed).

Tests: 3 xUnit tests pass — GET /metrics returns 200, Content-Type is text/plain, body contains `http_requests_received_total` after a /health request.

**Commit:** `103045c`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `WebApplicationFactory<Program>` failed — `Program` class inaccessible**
- **Found during:** Task 2 build
- **Issue:** Top-level statement `Program` class defaults to `internal`; `WebApplicationFactory<Program>` constructor parameter had accessibility mismatch
- **Fix:** Added `public partial class Program {}` at end of Program.cs (standard ASP.NET Core testing pattern)
- **Files modified:** `apps/api/Program.cs`
- **Commit:** `103045c`

**2. [Rule 1 - Bug] `CrawlerEventListener` crashed test host with Npgsql connection refused**
- **Found during:** Task 2 test run
- **Issue:** `CrawlerEventListener` background service connects directly to PostgreSQL via `NpgsqlConnection` (not through DbContext), bypassing the in-memory DB override. `BackgroundServiceExceptionBehavior = StopHost` caused the test server to immediately dispose.
- **Fix:** Removed `CrawlerEventListener` descriptor from test factory's `ConfigureWebHost` service collection
- **Files modified:** `apps/api.Tests/Endpoints/MetricsEndpointTests.cs`
- **Commit:** `103045c`

**3. [Rule 2 - Missing critical functionality] `db.Database.Migrate()` fails with InMemory provider**
- **Found during:** Task 2 test run
- **Issue:** `Program.cs` called `db.Database.Migrate()` unconditionally; InMemory EF provider does not support relational migrations, causing `InvalidOperationException` at startup
- **Fix:** Guarded with `if (db.Database.IsRelational()) db.Database.Migrate()`
- **Files modified:** `apps/api/Program.cs`
- **Commit:** `103045c`

## Verification Results

```
Crawler Vitest:  6/6 tests pass (metricsServer: 3, crawlMetrics: 3)
All crawler:    33/33 tests pass (full suite)
.NET API build: Build succeeded, 0 errors
.NET metrics:    3/3 xUnit tests pass (MetricsEndpointTests)
TS compile:      0 errors in metrics files (1 pre-existing error in FootballDataWorker.ts @web-crawler/shared-types — not caused by this plan)
```

## Known Stubs

None — all metrics modules are fully wired with real prom-client implementations.

## Threat Flags

No new network endpoints beyond what was planned. Port 9464 is internal Docker network only (no host port binding). `/metrics` on the API is not proxied by nginx externally — both mitigations from T-12-04-01 and T-12-04-02 are by design (enforced in Plan 03's docker-compose.prod.yml).

## Self-Check: PASSED

All 6 expected files exist. Both task commits (3a18c80, 103045c) verified in git log.
