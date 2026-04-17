# Phase 5: .NET REST API - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

All dashboard data needs are served by a documented .NET API with full CRUD for sources and
alert rules, paginated entries query, job management endpoints, and a health check.

Covers: API-01 through API-09, API-11 (sources CRUD, entries query, jobs list + retry,
alert rules CRUD, health check).

Not in scope: SignalR real-time push (Phase 6), Next.js dashboard UI (Phase 7+).

</domain>

<decisions>
## Implementation Decisions

### API Structure
- **D-01:** Minimal API style (consistent with existing `/health` MapGet) — NOT controllers.
- **D-02:** Split into route extension files per resource (e.g., `SourcesEndpoints.cs`,
  `EntriesEndpoints.cs`, `JobsEndpoints.cs`, `AlertRulesEndpoints.cs`). Program.cs calls each
  extension. Avoids stuffing 11 endpoints into one file.
- **D-03:** Use `MapGroup` per resource prefix — e.g., `app.MapGroup("/api/sources").MapSourcesEndpoints()`.
  DRY prefix, clean extension method signatures. ASP.NET Core 7+ / .NET 8 feature.

### Cursor Pagination (GET /api/entries)
- **D-04:** Opaque base64 cursor encoding `(crawled_at DESC, id DESC)` — keyset pagination.
  - Cursor is base64-encoded JSON: `{"at":"<ISO timestamp>","id":"<uuid>"}`.
  - WHERE clause: `(crawled_at, id) < (decoded_at, decoded_id)` (both DESC).
  - Stable across concurrent inserts; handles timestamp ties via secondary sort on `id`.
- **D-05:** Default page size 20, max 100. `?limit` param, capped server-side.
  Aligns with success criteria ("20 entries and a next-page cursor").
  Response includes `nextCursor: null` when no more pages.

### Job Retry Mechanics (POST /api/jobs/{id}/retry)
- **D-06:** Two-step trigger:
  1. Set `crawl_jobs.status = 'pending'` and `attempt_count = 0` in PostgreSQL via EF Core.
  2. `PUBLISH retry-job <job_id>` on Redis Pub/Sub channel.
  Node.js crawler subscribes to `retry-job` channel and immediately enqueues the BullMQ job.
  Satisfies "within 5 seconds" success criterion without polling.
- **D-07:** Reset `attempt_count = 0` on manual retry — fresh 3-attempt budget, clean UX.

### Response Shape / DTOs
- **D-08:** Minimal DTO strategy:
  - Sources, AlertRules, CrawlJobs: return EF Core entities directly. Add
    `ReferenceHandler.IgnoreCycles` to JSON options to suppress circular nav-property warnings.
  - DataEntry: use a `DataEntryResponse` DTO with `Payload` as `JsonElement` (not `JsonDocument`)
    to avoid double-serialization and circular refs through `Source` navigation property.
- **D-09:** JSONB fields (`Payload`, `Condition`) serialize as raw inline JSON — not escaped
  strings. Clients receive `{"payload": {"match_id": 1}}`, not `{"payload": "{...}"}`.
  Implement via `JsonDocument` → `JsonElement.Clone()` passthrough or custom `JsonConverter`.

### Health Check
- **D-10:** `/health` endpoint (already exists) must be extended to probe PostgreSQL and Redis:
  - PostgreSQL: `SELECT 1` via `dbContext.Database.ExecuteSqlRawAsync`.
  - Redis: `IConnectionMultiplexer.GetDatabase().PingAsync()`.
  - Response JSON: `{ "status": "ok"|"degraded", "postgres": "ok"|"error", "redis": "ok"|"error" }`.
  - Returns 200 if both healthy, 503 if either fails.

### Claude's Discretion
- Exact Swagger/OpenAPI setup (whether to add `AddEndpointsApiExplorer` + `AddSwaggerGen`)
- Error response shape for validation failures (ProblemDetails vs custom error object)
- Input validation approach (DataAnnotations vs FluentValidation vs manual checks)
- Exact EF Core query structure for entries filters (category, source, date range)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — API-01 through API-09, API-11 (exact endpoint specs,
  success criteria, filter parameters)

### Schema
- `SCHEMA.md` — `sources`, `crawl_jobs`, `data_entries`, `alert_rules` tables.
  Column types, indexes, and constraints that endpoints must respect.

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — API layer description, Data Flow (steps 8-10),
  how Node.js and .NET interact, Redis Pub/Sub for job retry signaling

### Roadmap
- `.planning/ROADMAP.md` — Phase 5 success criteria (5 items, especially SC-3 for retry timing
  and SC-1 for cursor pagination sequential call verification)

### Existing Source Files (must read before implementing)
- `apps/api/Program.cs` — Current Program.cs (minimal API /health, DI registrations, Serilog) —
  Phase 5 adds MapGroup calls here
- `apps/api/Data/AppDbContext.cs` — EF Core DbContext with all 5 entities and model config
- `apps/api/Data/Entities/Source.cs` — Source entity (fields available for CRUD)
- `apps/api/Data/Entities/CrawlJob.cs` — CrawlJob entity (status values: pending/running/done/failed/skipped)
- `apps/api/Data/Entities/DataEntry.cs` — DataEntry entity (Payload JsonDocument, entry_key, category)
- `apps/api/Data/Entities/AlertRule.cs` — AlertRule entity (Condition JsonDocument, Channel, MessageTpl)
- `apps/api/WebCrawlerApi.csproj` — Current NuGet packages (add StackExchange.Redis already present)

### Prior Phase Context
- `.planning/phases/03-postgresql-schema-parsers-listen-notify-handoff/03-CONTEXT.md` — D-06
  (AppDbContext fully wired), D-04 (UPSERT unique constraint on data_entries)
- `.planning/phases/04-notification-engine/04-CONTEXT.md` — D-04 (global env vars pattern),
  Redis connection already registered as IConnectionMultiplexer singleton in Program.cs

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AppDbContext` with all 5 DbSets — ready for EF Core queries, no setup needed
- `IConnectionMultiplexer` singleton — already registered in DI, use for Redis Pub/Sub PUBLISH
- Serilog `ILogger<T>` — established pattern for structured logging in service classes
- `app.MapGet("/health", ...)` — existing minimal API example to follow for route extension style

### Established Patterns
- Minimal API with `MapGet`/`MapPost` — do not introduce controllers
- `Environment.GetEnvironmentVariable(...)` for config — no `IConfiguration` injection needed
- `builder.Services.AddScoped<T>()` for service registration — use for endpoint handler services
- `UseSnakeCaseNamingConvention()` — EF Core uses snake_case column names, C# entities use PascalCase

### Integration Points
- `Program.cs` — add `MapGroup` calls after `app.Build()`, before `app.Run()`
- `IConnectionMultiplexer` — already registered, inject into retry endpoint handler to `PUBLISH`
- `AppDbContext` — inject as scoped service in route handler lambdas or dedicated service classes

</code_context>

<specifics>
## Specific Ideas

No specific UI/interaction references discussed — API phase, no visual concerns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-net-rest-api*
*Context gathered: 2026-04-17*
