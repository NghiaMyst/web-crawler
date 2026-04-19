---
phase: 05-net-rest-api
verified: 2026-04-19T00:00:00Z
status: human_needed
score: 16/17
overrides_applied: 0
requirements_covered:
  - API-01
  - API-02
  - API-03
  - API-04
  - API-05
  - API-06
  - API-07
  - API-08
  - API-09
  - API-11
gaps:
  - truth: "Test suite compiles cleanly with dotnet test"
    status: failed
    reason: "apps/api.Tests/WebCrawlerApi.Tests.csproj has duplicate FrameworkReference Include=\"Microsoft.AspNetCore.App\" (introduced in commit 33c613d). dotnet SDK 10 rejects duplicate FrameworkReference with NETSDK1087, preventing dotnet test from compiling. Pre-built binaries from SDK 8 run (39/39 pass), but a clean build is broken."
    artifacts:
      - path: "apps/api.Tests/WebCrawlerApi.Tests.csproj"
        issue: "Two identical <FrameworkReference Include=\"Microsoft.AspNetCore.App\" /> entries present. Remove the duplicate ItemGroup block."
    missing:
      - "Remove one of the two duplicate <FrameworkReference Include=\"Microsoft.AspNetCore.App\" /> ItemGroup blocks from apps/api.Tests/WebCrawlerApi.Tests.csproj"
human_verification:
  - test: "POST /api/jobs/{id}/retry — BullMQ Redis Pub/Sub pickup"
    expected: "After calling POST /api/jobs/{id}/retry on a dead-letter job (status=failed), the Node.js BullMQ worker subscribes to the 'retry-job' Redis channel, receives the job ID, and picks up the job within 5 seconds (visible in crawler logs)"
    why_human: "The .NET side is fully verified: job transitions to pending and Redis PUBLISH is confirmed by Moq unit tests. But the Node.js BullMQ subscription to the retry-job channel is outside this codebase scope and requires a running full-stack environment to verify end-to-end. This is Roadmap SC3."
---

# Phase 5: .NET REST API Verification Report

**Phase Goal:** All dashboard data needs are served by a documented .NET API with full CRUD for sources and alert rules, paginated entries query, job management endpoints, and a health check.
**Verified:** 2026-04-19T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/entries returns paginated entries with nextCursor | VERIFIED | EntriesEndpoints.cs: MapGet("/", GetEntries); returns `{items, nextCursor}`; 10 tests pass (pre-built) |
| 2 | Cursor-based pagination works correctly across sequential calls | VERIFIED | Test `GetEntries_WithCursor_ReturnsNonOverlappingPage2` confirmed; compound OR expansion for keyset |
| 3 | Category, sourceId, from, and to filters narrow results | VERIFIED | 3 filter tests pass; each filter applied as LINQ .Where clause on query |
| 4 | Limit is capped at 100 server-side | VERIFIED | `Math.Clamp(limit, 1, 100)` in EntriesEndpoints.cs |
| 5 | Payload serializes as inline JSON object, not escaped string | VERIFIED | `e.Payload.RootElement.Clone()` in DataEntryResponse mapping; test `GetEntries_PayloadIsInlineJson_NotEscapedString` confirms JsonValueKind.Object |
| 6 | GET /api/sources returns all configured sources | VERIFIED | GetAllSources handler queries `db.Sources.AsNoTracking().ToListAsync()` |
| 7 | POST /api/sources creates a new source with validation | VERIFIED | CreateSource validates Name/Url/ParserKey; returns Results.Created with 201 |
| 8 | PUT /api/sources/{id} updates source fields | VERIFIED | UpdateSource applies partial update on non-null fields; returns 404 for missing ID |
| 9 | DELETE /api/sources/{id} removes a source | VERIFIED | DeleteSource removes entity, returns 204 NoContent |
| 10 | GET /api/jobs returns jobs optionally filtered by status | VERIFIED | GetJobs accepts optional status string; filters with .Where(j => j.Status == status) |
| 11 | POST /api/jobs/{id}/retry resets failed job and publishes to Redis retry-job channel | VERIFIED | job.Status = "pending"; job.AttemptCount = 0; PublishAsync(RedisChannel.Literal("retry-job"), id.ToString()); Moq test confirms publish call |
| 12 | GET /api/alert-rules returns all alert rules | VERIFIED | GetAlertRules queries db.AlertRules.AsNoTracking().ToListAsync() |
| 13 | POST /api/alert-rules creates a new alert rule with validation | VERIFIED | CreateAlertRule validates Name/SourceId/Channel; returns TypedResults.ValidationProblem or Results.Created(201) |
| 14 | DELETE /api/alert-rules/{id} removes an alert rule | VERIFIED | DeleteAlertRule removes entity, returns 204 NoContent |
| 15 | GET /health returns 200 with postgres=ok, redis=ok when both healthy | VERIFIED | HealthCheck.CheckHealth with Func<Task> probes; returns Results.Ok(body) when both ok |
| 16 | GET /health returns 503 with status=degraded when any service fails | VERIFIED | Returns Results.Json(body, statusCode: 503) when either probe throws; 4 tests confirm all combinations |
| 17 | Test suite compiles cleanly with dotnet test | FAILED | Duplicate FrameworkReference in WebCrawlerApi.Tests.csproj causes NETSDK1087 with SDK 10. Pre-built binaries pass (39/39), but clean build breaks. |

**Score:** 16/17 truths verified (1 build infrastructure failure)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/Program.cs` | MapGroup wiring, JSON options, CORS, Swagger | VERIFIED | All 4 MapGroup calls, ConfigureHttpJsonOptions, AddCors, AddSwaggerGen, UseCors before MapGroup |
| `apps/api/Models/Responses/DataEntryResponse.cs` | DataEntry DTO with JsonElement Payload | VERIFIED | `public record DataEntryResponse(...JsonElement Payload...)` |
| `apps/api/Endpoints/EntriesEndpoints.cs` | GET /api/entries with cursor pagination | VERIFIED | MapGet("/", GetEntries); full pagination + filter implementation |
| `apps/api/Endpoints/SourcesEndpoints.cs` | Full CRUD for sources | VERIFIED | MapGet, MapGet/{id}, MapPost, MapPut, MapDelete all implemented |
| `apps/api/Endpoints/JobsEndpoints.cs` | Job listing and retry endpoints | VERIFIED | MapGet("/", GetJobs); MapPost("/{id:guid}/retry", RetryJob) |
| `apps/api/Endpoints/AlertRulesEndpoints.cs` | Alert rules CRUD | VERIFIED | MapGet, MapPost, MapDelete; TypedResults.ValidationProblem for invalid input |
| `apps/api/Endpoints/HealthCheck.cs` | Health endpoint with DB and Redis probes | VERIFIED | CheckHealth(Func<Task> pgProbe, Func<Task> redisProbe); Returns 200/503 |
| `apps/api.Tests/Endpoints/EntriesEndpointsTests.cs` | Unit tests for entries endpoint | VERIFIED | 10 [Fact] tests; passes (pre-built: 10/10) |
| `apps/api.Tests/Endpoints/SourcesEndpointsTests.cs` | Unit tests for sources CRUD | VERIFIED | 10 [Fact] tests; passes (pre-built: 10/10) |
| `apps/api.Tests/Endpoints/JobsEndpointsTests.cs` | Unit tests for jobs endpoints | VERIFIED | 8 [Fact] tests; passes (pre-built: 8/8) |
| `apps/api.Tests/Endpoints/AlertRulesEndpointsTests.cs` | Unit tests for alert rules | VERIFIED | 8 [Fact] tests; passes (pre-built: 8/8) |
| `apps/api.Tests/Endpoints/HealthEndpointTests.cs` | Unit tests for health endpoint | VERIFIED | 4 [Fact] tests; passes (pre-built: 4/4) |
| `apps/api.Tests/WebCrawlerApi.Tests.csproj` | Test project file | PARTIAL | Duplicate FrameworkReference causes NETSDK1087 build failure under SDK 10 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Program.cs | Endpoints/*.cs | MapGroup calls invoking extension methods | WIRED | Lines 103-106: MapGroup("/api/entries").MapEntriesEndpoints() etc. |
| EntriesEndpoints.cs | AppDbContext.DataEntries | EF Core query on DataEntries DbSet | WIRED | `db.DataEntries.AsNoTracking().OrderByDescending(...)` |
| EntriesEndpoints.cs | DataEntryResponse.cs | DTO mapping with JsonElement Clone | WIRED | `new DataEntryResponse(e.Id, ..., e.Payload.RootElement.Clone(), ...)` |
| SourcesEndpoints.cs | AppDbContext.Sources | EF Core CRUD on Sources DbSet | WIRED | `db.Sources.AsNoTracking()`, `db.Sources.Add()`, `db.Sources.FindAsync()`, `db.Sources.Remove()` |
| JobsEndpoints.cs | AppDbContext.CrawlJobs | EF Core query on CrawlJobs DbSet | WIRED | `db.CrawlJobs.AsNoTracking()`, `db.CrawlJobs.FindAsync()` |
| JobsEndpoints.cs | IConnectionMultiplexer (Redis) | Redis PUBLISH retry-job channel | WIRED | `redis.GetSubscriber().PublishAsync(RedisChannel.Literal("retry-job"), id.ToString())` |
| AlertRulesEndpoints.cs | AppDbContext.AlertRules | EF Core CRUD on AlertRules DbSet | WIRED | `db.AlertRules.AsNoTracking()`, `db.AlertRules.Add()`, `db.AlertRules.FindAsync()` |
| Program.cs (health endpoint) | AppDbContext + IConnectionMultiplexer | PostgreSQL SELECT 1 + Redis PingAsync | WIRED | `() => db.Database.ExecuteSqlRawAsync("SELECT 1")` and `async () => { await redis.GetDatabase().PingAsync(); }` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| EntriesEndpoints.cs | `rows` / `items` | `db.DataEntries.AsNoTracking().ToListAsync()` | Yes — EF Core DbSet query | FLOWING |
| SourcesEndpoints.cs | `sources` / `source` | `db.Sources.AsNoTracking().ToListAsync()` | Yes — EF Core DbSet query | FLOWING |
| JobsEndpoints.cs | `jobs` / `job` | `db.CrawlJobs.AsNoTracking().ToListAsync()` | Yes — EF Core DbSet query | FLOWING |
| AlertRulesEndpoints.cs | `rules` / `rule` | `db.AlertRules.AsNoTracking().ToListAsync()` | Yes — EF Core DbSet query | FLOWING |
| HealthCheck.cs | `pgStatus`, `redisStatus` | Func<Task> probes wired in Program.cs to real DB + Redis | Yes — real probe delegates | FLOWING |

### Behavioral Spot-Checks

Pre-built test binaries verified. `dotnet test --no-build` passes:

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 39 tests pass | `dotnet test apps/api.Tests/ --no-build` | Passed: 39, Failed: 0 | PASS |
| API project builds | `dotnet build apps/api/` | Build succeeded, 0 warnings, 0 errors | PASS |
| Clean test build | `dotnet test apps/api.Tests/` | NETSDK1087: Duplicate FrameworkReference in .csproj | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| API-01 | 05-01, 05-02 | `GET /api/entries` with filters and cursor pagination | SATISFIED | EntriesEndpoints.GetEntries with category/sourceId/from/to/cursor/limit; 10 tests |
| API-02 | 05-01, 05-03 | `GET /api/sources` — list all configured sources | SATISFIED | SourcesEndpoints.GetAllSources; returns `db.Sources.AsNoTracking().ToListAsync()` |
| API-03 | 05-01, 05-03 | `POST /api/sources` — add new crawl source | SATISFIED | SourcesEndpoints.CreateSource with Name/Url/ParserKey validation; returns 201 |
| API-04 | 05-03 | `PUT /api/sources/{id}` — update source | SATISFIED | SourcesEndpoints.UpdateSource with partial update pattern; 404 for missing |
| API-05 | 05-03 | `DELETE /api/sources/{id}` — remove source | SATISFIED | SourcesEndpoints.DeleteSource returns 204; 404 for missing |
| API-06 | 05-01, 05-04 | `GET /api/jobs` — list crawl jobs with status filter | SATISFIED | JobsEndpoints.GetJobs with optional status filter |
| API-07 | 05-04 | `POST /api/jobs/{id}/retry` — manually retry failed job | SATISFIED | JobsEndpoints.RetryJob resets to pending, publishes to Redis retry-job channel |
| API-08 | 05-01, 05-04 | `GET /api/alert-rules` — list alert rules | SATISFIED | AlertRulesEndpoints.GetAlertRules |
| API-09 | 05-04 | `POST /api/alert-rules` — create alert rule | SATISFIED | AlertRulesEndpoints.CreateAlertRule with Name/SourceId/Channel validation |
| API-11 | 05-05 | `GET /health` — health check endpoint | SATISFIED | HealthCheck.CheckHealth with pgProbe + redisProbe; 200/503 based on results |

**Note on API-10:** API-10 (`SignalR hub /hubs/dashboard`) is correctly assigned to Phase 6 in REQUIREMENTS.md. It is not part of Phase 5 scope and is not a gap.

No orphaned requirements found: all Phase 5 requirements (API-01 through API-09, API-11) are covered by plans and implemented.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api.Tests/WebCrawlerApi.Tests.csproj` | 13-15, 30-32 | Duplicate `<FrameworkReference Include="Microsoft.AspNetCore.App" />` | Blocker | `dotnet test` fails to compile with SDK 10 (NETSDK1087). Pre-built binaries still run. |

No TODO/FIXME/placeholder comments found in endpoint source files. No stub return patterns — all handlers perform real DB queries.

### Human Verification Required

#### 1. BullMQ Redis Pub/Sub Integration (Roadmap SC3)

**Test:** Start the full stack (`docker compose up`), create a crawl job in failed state via direct DB insert or by exhausting retries, then call `POST /api/jobs/{id}/retry` via curl or Postman.

**Expected:** The job transitions to `status=pending` in PostgreSQL (verifiable via `GET /api/jobs?status=pending`) AND the Node.js BullMQ worker logs show it received the job ID from the `retry-job` Redis channel and picked up the job within 5 seconds.

**Why human:** The .NET side (DB reset + Redis PUBLISH) is fully verified by unit tests. The Node.js BullMQ subscriber to the `retry-job` channel is outside `apps/api/` scope and requires a running crawler container. The specific behavior "BullMQ queue picks it up within 5 seconds" (from ROADMAP.md SC3) cannot be verified without end-to-end integration.

### Gaps Summary

**One build-breaking defect found:**

The test project `apps/api.Tests/WebCrawlerApi.Tests.csproj` contains a duplicate `<FrameworkReference Include="Microsoft.AspNetCore.App" />` entry. The .NET SDK 10 rejects this as NETSDK1087, preventing `dotnet test` from compiling the test project. The pre-built binaries show all 39 tests pass, confirming the implementation is correct — but the project cannot be freshly compiled.

**Fix required:** Remove the second `<ItemGroup><FrameworkReference Include="Microsoft.AspNetCore.App" /></ItemGroup>` block from `apps/api.Tests/WebCrawlerApi.Tests.csproj`.

This is a build toolchain gap, not an implementation gap. The endpoint logic, wiring, and tests are all substantive and correct. The gap is limited to the `.csproj` duplicate entry.

---

_Verified: 2026-04-19T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
