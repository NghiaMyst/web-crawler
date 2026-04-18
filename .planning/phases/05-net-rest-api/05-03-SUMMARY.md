---
phase: 05-net-rest-api
plan: "03"
subsystem: api
tags: [crud, sources, endpoints, efcore, validation, tdd]
dependency_graph:
  requires: [05-01]
  provides: [sources-crud-api]
  affects: [dashboard-source-management]
tech_stack:
  added: []
  patterns: [minimal-api-handler, ef-core-inmemory-tests, results-validation-problem, internals-visible-to]
key_files:
  created:
    - apps/api.Tests/Endpoints/SourcesEndpointsTests.cs
  modified:
    - apps/api/Endpoints/SourcesEndpoints.cs
    - apps/api/WebCrawlerApi.csproj
key_decisions:
  - "Results.ValidationProblem() returns ProblemHttpResult (not ValidationProblem type) — tests assert ProblemHttpResult with HttpValidationProblemDetails cast"
  - "InternalsVisibleTo added via csproj AssemblyAttribute (no Properties/AssemblyInfo.cs in project)"
  - "TDD flow: RED commit (c6c4515) then GREEN commit (7e3da5c)"
metrics:
  duration_seconds: 420
  completed_date: "2026-04-18"
  tasks_completed: 1
  files_changed: 3
requirements: [API-02, API-03, API-04, API-05]
---

# Phase 05 Plan 03: Sources CRUD Endpoints Summary

Full CRUD for `/api/sources` using EF Core InMemory-tested static handler methods with manual validation returning RFC 7807 `ValidationProblem` on bad input.

## What Was Built

### Sources CRUD Endpoints (`apps/api/Endpoints/SourcesEndpoints.cs`)

Five endpoint handlers wired via `MapSourcesEndpoints` extension on `RouteGroupBuilder`:

| Method | Route | Handler | Response |
|--------|-------|---------|----------|
| GET | `/` | `GetAllSources` | 200 with `List<Source>` |
| GET | `/{id:guid}` | `GetSourceById` | 200 or 404 |
| POST | `/` | `CreateSource` | 201 Created with Location header, or 400 ValidationProblem |
| PUT | `/{id:guid}` | `UpdateSource` | 200 with updated source, or 404 |
| DELETE | `/{id:guid}` | `DeleteSource` | 204 No Content, or 404 |

Request records in the same file:
- `CreateSourceRequest`: required `Name`, `Url`, `ParserKey`; optional `DisplayName`, `Category`, `CrawlerType`, `CrawlInterval`, `Priority`, `IsActive`
- `UpdateSourceRequest`: all nullable — `DisplayName`, `Url`, `CrawlInterval`, `Priority`, `IsActive`

### Test Suite (`apps/api.Tests/Endpoints/SourcesEndpointsTests.cs`)

10 `[Fact]` tests via TDD (RED first, then GREEN):

1. `GetAllSources_NoSources_ReturnsEmptyList`
2. `GetAllSources_WithSources_ReturnsAllSources`
3. `CreateSource_ValidRequest_Returns201WithSource`
4. `CreateSource_MissingName_Returns400WithNameError`
5. `CreateSource_MissingUrl_Returns400WithUrlError`
6. `CreateSource_MissingParserKey_Returns400WithParserKeyError`
7. `UpdateSource_ExistingId_UpdatesFields`
8. `UpdateSource_NonExistentId_Returns404`
9. `DeleteSource_ExistingId_RemovesSource`
10. `DeleteSource_NonExistentId_Returns404`

Each test uses a unique EF InMemory database name to prevent cross-test interference.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test assertions for ValidationProblem result type**
- **Found during:** GREEN phase — 3 tests failing
- **Issue:** Tests expected `Assert.IsType<ValidationProblem>(result)` but `Results.ValidationProblem()` actually returns `ProblemHttpResult` wrapping `HttpValidationProblemDetails`. The `ValidationProblem` typed result type is only returned when using `TypedResults.ValidationProblem()`.
- **Fix:** Changed assertions to `Assert.IsType<ProblemHttpResult>` then cast `problem.ProblemDetails` to `HttpValidationProblemDetails` to access `.Errors` dictionary.
- **Files modified:** `apps/api.Tests/Endpoints/SourcesEndpointsTests.cs`
- **Commit:** 7e3da5c (included in GREEN commit)

## Known Stubs

None — all handlers are fully implemented and wired to `AppDbContext.Sources` DbSet.

## Threat Flags

No new trust boundaries introduced beyond what was modeled in the plan threat register. All mitigations applied:
- T-05-08: `CreateSource` validates Name, Url, ParserKey with `Results.ValidationProblem`
- T-05-09: `UpdateSource`/`DeleteSource` use `FindAsync` returning null → 404; Guid route constraint on `/{id:guid}`
- T-05-10: All queries through EF Core parameterized — no raw SQL
- T-05-11: Nav properties not included in queries (`AsNoTracking()`, `FindAsync` returns entity without nav props loaded)

## Commits

| Hash | Type | Description |
|------|------|-------------|
| c6c4515 | test | RED: add failing tests for sources CRUD endpoints |
| 7e3da5c | feat | GREEN: implement sources CRUD + InternalsVisibleTo fix |

## Self-Check: PASSED

- `apps/api/Endpoints/SourcesEndpoints.cs` — exists, contains `MapGet`, `MapPost`, `MapPut`, `MapDelete`, `Results.ValidationProblem`, `Results.Created`, `record CreateSourceRequest`, `record UpdateSourceRequest`
- `apps/api.Tests/Endpoints/SourcesEndpointsTests.cs` — exists, 10 `[Fact]` methods
- `dotnet test --filter SourcesEndpoints` — 10/10 passed
- `dotnet build apps/api/` — succeeded, 0 warnings, 0 errors
- Commits c6c4515 and 7e3da5c verified in git log
