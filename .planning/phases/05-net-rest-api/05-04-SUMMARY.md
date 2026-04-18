---
phase: 05-net-rest-api
plan: 04
subsystem: api
tags: [dotnet, ef-core, minimal-api, redis, postgresql, xunit, tdd]

# Dependency graph
requires:
  - phase: 05-01
    provides: API infrastructure, AppDbContext, entity models, Program.cs with route groups

provides:
  - GET /api/jobs endpoint with optional status filter
  - POST /api/jobs/{id}/retry endpoint resetting failed jobs and publishing Redis retry-job
  - GET /api/alert-rules endpoint returning all alert rules
  - POST /api/alert-rules endpoint with validation and 201 Created response
  - DELETE /api/alert-rules/{id} endpoint returning 204 NoContent
  - Unit tests for all jobs and alert rules endpoint handlers

affects: [05-05, dashboard, node-crawler]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TypedResults over Results for strongly-typed IResult returns (enables Assert.IsType in tests)
    - Manual validation dictionary + TypedResults.ValidationProblem for request validation
    - EF Core InMemory provider for endpoint unit tests (no integration test infra needed)
    - Redis Pub/Sub via IConnectionMultiplexer.GetSubscriber().PublishAsync for cross-process signaling

key-files:
  created:
    - apps/api/Endpoints/AlertRulesEndpoints.cs
    - apps/api.Tests/Endpoints/JobsEndpointsTests.cs
    - apps/api.Tests/Endpoints/AlertRulesEndpointsTests.cs
  modified:
    - apps/api/Endpoints/JobsEndpoints.cs

key-decisions:
  - "Use TypedResults.ValidationProblem() instead of Results.ValidationProblem() — the latter returns ProblemHttpResult in .NET 8, not ValidationProblem; TypedResults gives the concrete type tests can Assert.IsType on"
  - "AttemptCount reset to 0 on retry (D-07) gives fresh 3-attempt budget to the Node.js crawler"
  - "ErrorMessage set to null on retry clears previous failure context"
  - "Redis channel name is exactly 'retry-job' via RedisChannel.Literal to match Node.js subscriber"
  - "DELETE /api/alert-rules/{id} implemented per Phase 5 success criterion 4, even though only API-08/API-09 are in REQUIREMENTS.md"

patterns-established:
  - "TypedResults pattern: use TypedResults.X() for all returns that tests need to Assert.IsType<> on"
  - "Validation pattern: manual errors dictionary + TypedResults.ValidationProblem(errors) consistent with sources endpoint"
  - "Redis bridge pattern: .NET resets DB state first, then publishes to Redis channel for Node.js pickup"

requirements-completed: [API-06, API-07, API-08, API-09]

# Metrics
duration: 25min
completed: 2026-04-18
---

# Phase 05 Plan 04: Jobs and Alert Rules Endpoints Summary

**Jobs list/retry and alert rules CRUD endpoints via EF Core + Redis Pub/Sub bridge, with 16 passing TDD unit tests**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-18T00:00:00Z
- **Completed:** 2026-04-18T00:25:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Implemented GET /api/jobs (filterable by status) and POST /api/jobs/{id}/retry (D-06/D-07 Redis bridge)
- Implemented full alert rules CRUD: GET list, POST create with validation, DELETE by ID
- All 16 unit tests pass across both endpoint files using EF Core InMemory + Moq

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: Jobs endpoints RED** - `ab5fbd0` (test)
2. **Task 1: Jobs endpoints GREEN** - `cd5fc6b` (feat)
3. **Task 2: Alert rules endpoints RED** - `8067a00` (test)
4. **Task 2: Alert rules endpoints GREEN** - `365127e` (feat)

## Files Created/Modified

- `apps/api/Endpoints/JobsEndpoints.cs` - GET / and POST /{id}/retry handlers with Redis PUBLISH
- `apps/api/Endpoints/AlertRulesEndpoints.cs` - GET /, POST /, DELETE /{id} handlers with validation; CreateAlertRuleRequest record
- `apps/api.Tests/Endpoints/JobsEndpointsTests.cs` - 8 unit tests covering filter, retry state, Redis publish, error cases
- `apps/api.Tests/Endpoints/AlertRulesEndpointsTests.cs` - 8 unit tests covering list, create with validation, delete cases

## Decisions Made

- Used `TypedResults.ValidationProblem()` instead of `Results.ValidationProblem()` — in .NET 8, `Results.ValidationProblem()` returns `ProblemHttpResult` which breaks `Assert.IsType<ValidationProblem>()`. `TypedResults` returns the concrete typed result.
- Redis channel name `"retry-job"` via `RedisChannel.Literal(...)` — exact string match required by Node.js subscriber.
- `AttemptCount = 0` on retry per D-07 design decision to give fresh 3-attempt budget.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypedResults.ValidationProblem instead of Results.ValidationProblem**
- **Found during:** Task 2 (Alert rules endpoints GREEN phase — test run)
- **Issue:** `Results.ValidationProblem()` in .NET 8 returns `ProblemHttpResult`, not the `ValidationProblem` concrete type. Tests using `Assert.IsType<ValidationProblem>()` failed with 3/8 tests failing.
- **Fix:** Changed `Results.ValidationProblem(errors)` to `TypedResults.ValidationProblem(errors)` in AlertRulesEndpoints.cs
- **Files modified:** `apps/api/Endpoints/AlertRulesEndpoints.cs`
- **Verification:** All 8 alert rules tests pass after fix
- **Committed in:** `365127e` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug — wrong Results method returning unexpected concrete type)
**Impact on plan:** Fix necessary for test correctness. No scope creep. Same behavior at runtime, stronger typing.

## Issues Encountered

- `Results.ValidationProblem()` vs `TypedResults.ValidationProblem()` return type difference in .NET 8 — resolved by switching to TypedResults (see Deviations).

## Known Stubs

None — all endpoints are fully wired to AppDbContext and IConnectionMultiplexer.

## Threat Flags

No new security-relevant surface beyond what the plan's threat model covered (T-05-12 through T-05-15).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Jobs and alert rules endpoints complete and tested
- Redis Pub/Sub bridge to Node.js crawler is wired (retry-job channel)
- Ready for Phase 05-05 (remaining endpoints or integration work)

---
*Phase: 05-net-rest-api*
*Completed: 2026-04-18*
