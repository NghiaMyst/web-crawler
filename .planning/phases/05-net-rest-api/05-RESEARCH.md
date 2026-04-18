# Phase 5: .NET REST API - Research

**Researched:** 2026-04-17
**Domain:** ASP.NET Core 8 Minimal API — CRUD endpoints, cursor pagination, Redis pub/sub job retry, health checks
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Minimal API style (consistent with existing `/health` MapGet) — NOT controllers.
- **D-02:** Split into route extension files per resource (`SourcesEndpoints.cs`, `EntriesEndpoints.cs`, `JobsEndpoints.cs`, `AlertRulesEndpoints.cs`). Program.cs calls each extension.
- **D-03:** Use `MapGroup` per resource prefix — e.g., `app.MapGroup("/api/sources").MapSourcesEndpoints()`. DRY prefix, clean extension method signatures. ASP.NET Core 7+ / .NET 8 feature.
- **D-04:** Opaque base64 cursor encoding `(crawled_at DESC, id DESC)` — keyset pagination. Cursor is base64-encoded JSON: `{"at":"<ISO timestamp>","id":"<uuid>"}`. WHERE clause: `(crawled_at, id) < (decoded_at, decoded_id)` (both DESC). Stable across concurrent inserts; handles timestamp ties via secondary sort on `id`.
- **D-05:** Default page size 20, max 100. `?limit` param, capped server-side. Response includes `nextCursor: null` when no more pages.
- **D-06:** Job retry: (1) Set `crawl_jobs.status = 'pending'` and `attempt_count = 0` in PostgreSQL via EF Core. (2) `PUBLISH retry-job <job_id>` on Redis Pub/Sub. Node.js crawler subscribes and immediately enqueues the BullMQ job. Satisfies "within 5 seconds" criterion without polling.
- **D-07:** Reset `attempt_count = 0` on manual retry — fresh 3-attempt budget.
- **D-08:** Minimal DTO strategy: Sources, AlertRules, CrawlJobs return EF Core entities directly with `ReferenceHandler.IgnoreCycles`. DataEntry uses `DataEntryResponse` DTO with `Payload` as `JsonElement`.
- **D-09:** JSONB fields (`Payload`, `Condition`) serialize as raw inline JSON, not escaped strings.
- **D-10:** `/health` endpoint extended to probe PostgreSQL (`SELECT 1` via `ExecuteSqlRawAsync`) and Redis (`PingAsync`). Returns `{ "status": "ok"|"degraded", "postgres": "ok"|"error", "redis": "ok"|"error" }`. Returns 200 if both healthy, 503 if either fails.

### Claude's Discretion

- Exact Swagger/OpenAPI setup (whether to add `AddEndpointsApiExplorer` + `AddSwaggerGen`)
- Error response shape for validation failures (ProblemDetails vs custom error object)
- Input validation approach (DataAnnotations vs FluentValidation vs manual checks)
- Exact EF Core query structure for entries filters (category, source, date range)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-01 | `GET /api/entries` — query parsed data with filters (category, source, date range, cursor pagination) | D-04/D-05: keyset cursor pattern; EF Core WHERE + OrderBy on (crawled_at DESC, id DESC) |
| API-02 | `GET /api/sources` — list all configured sources | EF Core `ToListAsync()` on `Sources` DbSet |
| API-03 | `POST /api/sources` — add new crawl source | EF Core `Add` + `SaveChangesAsync`; validation on required fields |
| API-04 | `PUT /api/sources/{id}` — update source (interval, priority, enable/disable) | EF Core `FindAsync` + field update + `SaveChangesAsync` |
| API-05 | `DELETE /api/sources/{id}` — remove source | EF Core `Remove` + `SaveChangesAsync` |
| API-06 | `GET /api/jobs` — list crawl jobs with status filter | EF Core filtered `ToListAsync` with optional `?status=` query param |
| API-07 | `POST /api/jobs/{id}/retry` — manually retry failed job | D-06: EF Core status update + Redis `PUBLISH retry-job <id>` |
| API-08 | `GET /api/alert-rules` — list alert rules | EF Core `ToListAsync()` on `AlertRules` DbSet |
| API-09 | `POST /api/alert-rules` — create alert rule | EF Core `Add` + validation for required Condition JSONB |
| API-11 | `GET /health` — health check endpoint (extended) | D-10: PostgreSQL ping + Redis ping, structured JSON, 503 on failure |
</phase_requirements>

---

## Summary

Phase 5 adds 11 REST endpoints to an already-functioning ASP.NET Core 8 minimal API project. The project structure (Program.cs, AppDbContext, entity classes, IConnectionMultiplexer, Serilog) is fully established by Phases 3 and 4. This phase is additive: it adds endpoint files and wires them into Program.cs, with no schema changes needed.

The most technically nuanced work is (1) the keyset cursor pagination for `GET /api/entries` — the compound `(crawled_at, id)` tuple comparison in PostgreSQL must be expressed in EF Core using `Where` + `OrderBy` since EF Core does not support tuple comparison syntax natively, and (2) the job retry Redis pub/sub bridge that must signal Node.js within 5 seconds. Everything else is standard EF Core CRUD.

The test project (`apps/api.Tests`) already uses xUnit + Moq + EF InMemory, establishing patterns for unit testing new service/handler classes. Swagger/OpenAPI setup (Claude's discretion) is recommended via `Swashbuckle.AspNetCore` 6.x (compatible with .NET 8) — a single `AddEndpointsApiExplorer` + `AddSwaggerGen` call exposes all MapGroup endpoints.

**Primary recommendation:** Implement each resource group as a static extension class on `RouteGroupBuilder`, use `MapGroup` in Program.cs, add `Swashbuckle.AspNetCore` for documentation, and validate inputs with manual checks + `Results.ValidationProblem` for a zero-dependency approach consistent with the existing codebase.

---

## Standard Stack

### Core (already present — no new installs required)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ASP.NET Core 8 Minimal API | net8.0 (SDK) | HTTP routing, DI, middleware | Project target framework [VERIFIED: WebCrawlerApi.csproj] |
| Npgsql.EntityFrameworkCore.PostgreSQL | 8.0.11 | EF Core PostgreSQL provider | Already in csproj [VERIFIED: WebCrawlerApi.csproj] |
| EFCore.NamingConventions | 8.0.3 | snake_case column mapping | Already in csproj [VERIFIED: WebCrawlerApi.csproj] |
| StackExchange.Redis | 2.11.8 | Redis Pub/Sub PUBLISH for job retry | Already in csproj [VERIFIED: WebCrawlerApi.csproj] |
| Serilog.AspNetCore | 8.* | Structured HTTP request logging | Already in csproj [VERIFIED: WebCrawlerApi.csproj] |

### New Addition (Claude's discretion — recommended)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Swashbuckle.AspNetCore | 6.9.0 (net8 compat) | Swagger UI + OpenAPI JSON | For this project's .NET 8 target; 10.x requires .NET 9+ [VERIFIED: nuget.org search] |

**Installation (only new package):**
```bash
cd apps/api
dotnet add package Swashbuckle.AspNetCore --version 6.9.0
```

**Version note:** Swashbuckle 10.x series targets .NET 9+. For .NET 8, use 6.x (6.9.0 is the latest 6.x stable). [VERIFIED: nuget.org — latest is 10.1.7 but 6.9.0 is the last .NET 8 compatible release. Cross-check: project targets net8.0.]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Swashbuckle 6.x | Microsoft.AspNetCore.OpenApi (built-in) | Built-in is .NET 9+ only; not available for net8.0 [ASSUMED] |
| Manual validation checks | FluentValidation | FluentValidation adds a NuGet dependency; manual checks are lighter and sufficient for 3-5 field validation in a personal project |
| Redis PUBLISH for retry | HTTP callback to Node.js | PUBLISH is simpler, Node.js already subscribes (per D-06 design) |

---

## Architecture Patterns

### Recommended Project Structure (additions for Phase 5)
```
apps/api/
├── Program.cs                      # Add MapGroup calls here (after app.Build())
├── Endpoints/
│   ├── EntriesEndpoints.cs         # GET /api/entries with cursor pagination
│   ├── SourcesEndpoints.cs         # GET/POST/PUT/DELETE /api/sources
│   ├── JobsEndpoints.cs            # GET /api/jobs, POST /api/jobs/{id}/retry
│   └── AlertRulesEndpoints.cs      # GET/POST/DELETE /api/alert-rules
├── Models/
│   └── Responses/
│       └── DataEntryResponse.cs    # DTO for entries (Payload as JsonElement)
└── (existing files unchanged)
```

### Pattern 1: MapGroup + RouteGroupBuilder Extension Method

**What:** Each resource's endpoints are defined as a static extension on `RouteGroupBuilder`. Program.cs creates a group and calls the extension.

**When to use:** D-02 and D-03 — mandated by locked decisions.

**Example:**
```csharp
// Source: [CITED: learn.microsoft.com/aspnet/core/fundamentals/minimal-apis]

// In Endpoints/SourcesEndpoints.cs
public static class SourcesEndpoints
{
    public static RouteGroupBuilder MapSourcesEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetAllSources);
        group.MapGet("/{id:guid}", GetSourceById);
        group.MapPost("/", CreateSource);
        group.MapPut("/{id:guid}", UpdateSource);
        group.MapDelete("/{id:guid}", DeleteSource);
        return group;
    }

    private static async Task<IResult> GetAllSources(AppDbContext db)
    {
        var sources = await db.Sources.ToListAsync();
        return Results.Ok(sources);
    }
    // ... other handlers
}

// In Program.cs (after app.Build())
app.MapGroup("/api/sources").MapSourcesEndpoints();
app.MapGroup("/api/entries").MapEntriesEndpoints();
app.MapGroup("/api/jobs").MapJobsEndpoints();
app.MapGroup("/api/alert-rules").MapAlertRulesEndpoints();
```

### Pattern 2: Keyset Cursor Pagination (EF Core workaround for tuple comparison)

**What:** PostgreSQL supports `(crawled_at, id) < ($1, $2)` but EF Core LINQ does NOT translate tuple comparisons. The correct workaround uses compound boolean expressions.

**When to use:** `GET /api/entries` with cursor token (D-04).

**Example:**
```csharp
// Source: [CITED: learn.microsoft.com/ef/core/querying/pagination]
// Keyset pagination with compound sort key (crawled_at DESC, id DESC)

var query = db.DataEntries
    .AsNoTracking()
    .Include(e => e.Source)  // avoid if navigation not needed — select projection instead
    .OrderByDescending(e => e.CrawledAt)
    .ThenByDescending(e => e.Id);

// Apply cursor filter (decoded from base64)
if (cursor != null)
{
    // EF Core CANNOT translate (crawled_at, id) < (at, id) tuple syntax.
    // Equivalent boolean expansion:
    query = query.Where(e =>
        e.CrawledAt < cursor.At ||
        (e.CrawledAt == cursor.At && e.Id.CompareTo(cursor.Id) < 0));
    // NOTE: Guid.CompareTo may not translate correctly to SQL.
    // Safe alternative: use string comparison on e.Id < cursor.Id
    // (valid only if UUIDs are v4 random — not time-ordered, so use explicit sort)
}

var entries = await query.Take(limit + 1).ToListAsync();
var hasNext = entries.Count > limit;
if (hasNext) entries = entries.Take(limit).ToList();

var nextCursor = hasNext
    ? Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(new
      { at = entries.Last().CrawledAt.ToString("O"), id = entries.Last().Id }))
    : null;
```

**Critical pitfall:** `Guid.CompareTo` does NOT translate to SQL in EF Core / Npgsql for UUID ordering. Use `.ToString()` comparison or switch to comparing `id` as a string. The compound boolean expansion IS safe and translates correctly. [VERIFIED: EF Core pagination docs + Npgsql GitHub issues]

### Pattern 3: Redis PUBLISH for Job Retry (D-06)

**What:** After updating the DB, publish to a Redis channel that Node.js subscribes to.

**When to use:** `POST /api/jobs/{id}/retry`.

**Example:**
```csharp
// Source: [CITED: stackexchange.redis docs]
private static async Task<IResult> RetryJob(
    Guid id, AppDbContext db, IConnectionMultiplexer redis,
    ILogger<JobsEndpoints> logger)
{
    var job = await db.CrawlJobs.FindAsync(id);
    if (job is null) return Results.NotFound();
    if (job.Status != "failed") return Results.BadRequest("Job is not in failed state");

    job.Status = "pending";
    job.AttemptCount = 0;  // D-07: fresh attempt budget
    await db.SaveChangesAsync();

    var pub = redis.GetSubscriber();
    await pub.PublishAsync(
        RedisChannel.Literal("retry-job"),
        id.ToString());

    logger.LogInformation("Job {JobId} reset to pending and published to retry-job channel", id);
    return Results.Ok(new { jobId = id, status = "pending" });
}
```

### Pattern 4: DataEntryResponse DTO with JsonElement (D-08, D-09)

**What:** Return `DataEntry` entries via a DTO that uses `JsonElement` for `Payload` to avoid double-serialization.

**Why:** `JsonDocument` is disposable and causes serialization issues if returned directly. `JsonElement` is a value type clone that serializes inline as raw JSON.

```csharp
// In Models/Responses/DataEntryResponse.cs
public record DataEntryResponse(
    Guid Id,
    Guid SourceId,
    string Category,
    string? EntryKey,
    JsonElement Payload,       // serializes as inline JSON object, not escaped string
    DateTimeOffset CrawledAt
);

// Mapping from entity:
var response = new DataEntryResponse(
    e.Id, e.SourceId, e.Category, e.EntryKey,
    e.Payload.RootElement.Clone(),   // Clone() detaches from JsonDocument lifetime
    e.CrawledAt
);
```

### Pattern 5: Health Check Extension (D-10)

**What:** Extend the existing `/health` handler to probe PostgreSQL and Redis connectivity.

```csharp
// Replace existing health MapGet in Program.cs with:
app.MapGet("/health", async (AppDbContext db, IConnectionMultiplexer redis) =>
{
    string pgStatus, redisStatus;

    try
    {
        await db.Database.ExecuteSqlRawAsync("SELECT 1");
        pgStatus = "ok";
    }
    catch { pgStatus = "error"; }

    try
    {
        await redis.GetDatabase().PingAsync();
        redisStatus = "ok";
    }
    catch { redisStatus = "error"; }

    var overall = (pgStatus == "ok" && redisStatus == "ok") ? "ok" : "degraded";
    var body = new { status = overall, postgres = pgStatus, redis = redisStatus };

    return overall == "ok" ? Results.Ok(body) : Results.Json(body, statusCode: 503);
});
```

### Pattern 6: JSON Options for IgnoreCycles (D-08)

**What:** When returning EF Core entities directly (Sources, AlertRules, CrawlJobs), circular nav-property references (e.g., `Source.CrawlJobs[].Source`) would cause a serialization exception. Configure `ReferenceHandler.IgnoreCycles`.

```csharp
// In Program.cs, after builder.Services.AddDbContext:
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});
```

**Note:** `ConfigureHttpJsonOptions` (not `AddJsonOptions`) is the correct method for ASP.NET Core minimal APIs. `AddJsonOptions` targets MVC controllers. [CITED: learn.microsoft.com/aspnet/core/fundamentals/minimal-apis]

### Pattern 7: Swagger Setup (Claude's discretion — recommended)

```csharp
// In Program.cs
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// After app.Build():
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
```

**Note:** `AddEndpointsApiExplorer` is required for minimal APIs (NOT needed for MVC controllers). [CITED: learn.microsoft.com — minimal APIs OpenAPI guide]

### Pattern 8: CORS Setup

For the Next.js dashboard (Phase 7) to call this API from a different origin:

```csharp
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(
                Environment.GetEnvironmentVariable("CORS_ORIGINS")?.Split(',')
                    ?? ["http://localhost:3000"])
              .AllowAnyHeader()
              .AllowAnyMethod());
});

// In middleware pipeline (after app.Build(), before MapGroup calls):
app.UseCors();
```

### Pattern 9: Input Validation (Claude's discretion — manual checks recommended)

For a personal project with simple validation requirements, manual checks returning `Results.ValidationProblem` keep zero extra dependencies:

```csharp
// Example for POST /api/sources
private static async Task<IResult> CreateSource(CreateSourceRequest req, AppDbContext db)
{
    var errors = new Dictionary<string, string[]>();
    if (string.IsNullOrWhiteSpace(req.Name)) errors["name"] = ["Name is required"];
    if (string.IsNullOrWhiteSpace(req.Url)) errors["url"] = ["URL is required"];
    if (string.IsNullOrWhiteSpace(req.ParserKey)) errors["parserKey"] = ["ParserKey is required"];
    if (errors.Count > 0) return Results.ValidationProblem(errors);

    // ... proceed with creation
}
```

`Results.ValidationProblem` returns an RFC 7807 `application/problem+json` response with 400 status. [CITED: learn.microsoft.com — minimal APIs Results]

### Anti-Patterns to Avoid

- **Inject `IConfiguration` for env vars:** Established project pattern uses `Environment.GetEnvironmentVariable(...)` directly. Do not introduce `IConfiguration` injection.
- **Returning `JsonDocument` directly from endpoints:** `JsonDocument` is `IDisposable`; return `JsonElement` via `.Clone()` instead.
- **Including navigation properties in entity returns for `DataEntry`:** The `Source` navigation property causes circular JSON when returning entities directly. Use `DataEntryResponse` DTO as decided in D-08.
- **Using `Skip()/Take()` offset pagination:** Offset pagination degrades at scale. Keyset pagination is locked (D-04).
- **EF Core tuple comparisons in LINQ:** EF Core / Npgsql does not translate `(e.CrawledAt, e.Id) < (at, id)` tuple syntax. Use the compound boolean OR expansion.
- **Calling `AddJsonOptions` instead of `ConfigureHttpJsonOptions`:** `AddJsonOptions` is for MVC controllers. Minimal API JSON options require `ConfigureHttpJsonOptions`.
- **Returning 204 No Content for POST creates:** Prefer `Results.Created($"/api/sources/{id}", entity)` to return the created resource and a Location header.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Swagger UI documentation | Custom API docs page | `Swashbuckle.AspNetCore` (6.9.0) | Handles OpenAPI schema generation from endpoint metadata automatically |
| Base64 cursor encode/decode | Custom binary format | `Convert.ToBase64String` + `JsonSerializer` | Standard library, no extra package needed |
| Health check probing | Custom TCP/port checks | `db.Database.ExecuteSqlRawAsync("SELECT 1")` + `redis.GetDatabase().PingAsync()` | Uses existing registered services; EF Core and StackExchange.Redis already handle connection management |
| Circular JSON handling | Manual DTO flattening of all entities | `ReferenceHandler.IgnoreCycles` in JSON options | One-line config, no per-entity mapping needed for simple cases |

**Key insight:** All infrastructure (EF Core, Redis client, Serilog) is already registered in DI from Phases 3 and 4. Phase 5 only adds endpoint route handler files — it does not require new services or infrastructure.

---

## Common Pitfalls

### Pitfall 1: EF Core GUID Comparison Does Not Translate to SQL
**What goes wrong:** `e.Id.CompareTo(cursor.Id) < 0` throws at runtime because `Guid.CompareTo` has no SQL translation in Npgsql.
**Why it happens:** Guid ordering is not defined the same way in PostgreSQL UUID type vs .NET Guid. EF Core/Npgsql cannot translate it.
**How to avoid:** For the secondary sort tie-break in cursor pagination, use string comparison: `string.Compare(e.Id.ToString(), cursor.Id.ToString()) < 0`. Or rely on the fact that timestamp precision is sufficient to avoid ties in practice (DateTimeOffset has microsecond precision in Postgres) and only include `id` in the cursor for completeness without relying on its ORDER comparability.
**Warning signs:** `InvalidOperationException: The LINQ expression ... could not be translated` at query execution time.

### Pitfall 2: ConfigureHttpJsonOptions vs AddJsonOptions
**What goes wrong:** `ReferenceHandler.IgnoreCycles` set via `AddJsonOptions` has no effect on minimal API responses. Circular reference exception occurs at runtime.
**Why it happens:** `AddJsonOptions` configures `Microsoft.AspNetCore.Mvc.JsonOptions`, which only affects MVC controller responses. Minimal API serialization uses `Microsoft.AspNetCore.Http.Json.JsonOptions`, configured via `ConfigureHttpJsonOptions`.
**How to avoid:** Use `builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.ReferenceHandler = ...)`.
**Warning signs:** Entities return correctly in isolation but throw `JsonException: A possible object cycle was detected` when navigation properties are populated.

### Pitfall 3: JsonDocument Disposed Before Serialization
**What goes wrong:** Returning `entry.Payload` (a `JsonDocument`) directly from a handler causes `ObjectDisposedException` if the DbContext is disposed before serialization completes, or returns `null` payload after disposal.
**Why it happens:** `JsonDocument` pooled memory is returned on `Dispose()`. EF Core scoped context disposes after the handler completes, which may race with ASP.NET Core's async serialization.
**How to avoid:** Always call `.RootElement.Clone()` before the DbContext scope closes. The `DataEntryResponse` DTO with `JsonElement` (detached from document lifetime) is the correct pattern (D-08).
**Warning signs:** Intermittent null or garbage payloads in entry responses under load.

### Pitfall 4: Redis PUBLISH Channel Name Mismatch
**What goes wrong:** Node.js does not receive the retry signal; BullMQ job is never re-enqueued.
**Why it happens:** `.NET` publishes to `"retry-job"` but Node.js subscribes to a different channel name (e.g., `"retry_job"` or `"retryJob"`).
**How to avoid:** Use `RedisChannel.Literal("retry-job")` in .NET. Verify Node.js subscription code uses the exact same string `"retry-job"`. Add a log line in .NET that records the channel name and job ID to confirm delivery.
**Warning signs:** Job stays in `failed` status; no Redis SUBSCRIBE messages observed.

### Pitfall 5: Missing `AddEndpointsApiExplorer` for Swagger
**What goes wrong:** Swagger UI loads but shows 0 endpoints.
**Why it happens:** `AddEndpointsApiExplorer` is required for minimal API endpoint discovery. `AddControllers` implicitly registers it for MVC, but minimal APIs do not.
**How to avoid:** Always pair `AddEndpointsApiExplorer()` + `AddSwaggerGen()`.
**Warning signs:** Swagger UI renders with an empty endpoint list.

### Pitfall 6: CORS Not Applied Before MapGroup Calls
**What goes wrong:** Browser OPTIONS preflight requests to `/api/sources` return 404 or CORS errors.
**Why it happens:** `UseCors()` must be called before route mapping middleware.
**How to avoid:** Call `app.UseCors()` immediately after `app.UseSerilogRequestLogging()` and before any `app.MapGroup(...)` calls.
**Warning signs:** `Access-Control-Allow-Origin` header missing from API responses in browser Network tab.

---

## Code Examples

### Entries Endpoint with Cursor Pagination

```csharp
// Source: Pattern based on [CITED: learn.microsoft.com/ef/core/querying/pagination]
public static class EntriesEndpoints
{
    public static RouteGroupBuilder MapEntriesEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetEntries);
        return group;
    }

    private static async Task<IResult> GetEntries(
        AppDbContext db,
        string? category = null,
        Guid? sourceId = null,
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        string? cursor = null,
        int limit = 20)
    {
        limit = Math.Clamp(limit, 1, 100);  // D-05: cap at 100

        var query = db.DataEntries
            .AsNoTracking()
            .OrderByDescending(e => e.CrawledAt)
            .ThenByDescending(e => e.Id)
            .AsQueryable();

        if (category is not null)
            query = query.Where(e => e.Category == category);
        if (sourceId.HasValue)
            query = query.Where(e => e.SourceId == sourceId.Value);
        if (from.HasValue)
            query = query.Where(e => e.CrawledAt >= from.Value);
        if (to.HasValue)
            query = query.Where(e => e.CrawledAt <= to.Value);

        if (cursor is not null)
        {
            try
            {
                var decoded = JsonSerializer.Deserialize<CursorToken>(
                    Convert.FromBase64String(cursor));
                if (decoded is not null)
                {
                    query = query.Where(e =>
                        e.CrawledAt < decoded.At ||
                        (e.CrawledAt == decoded.At &&
                         string.Compare(e.Id.ToString(), decoded.Id.ToString()) < 0));
                }
            }
            catch { /* invalid cursor — ignore, return first page */ }
        }

        var rows = await query.Take(limit + 1).ToListAsync();
        var hasNext = rows.Count > limit;
        if (hasNext) rows = rows.Take(limit).ToList();

        var nextCursor = hasNext
            ? Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(new CursorToken
              { At = rows.Last().CrawledAt, Id = rows.Last().Id }))
            : null;

        var items = rows.Select(e => new DataEntryResponse(
            e.Id, e.SourceId, e.Category, e.EntryKey,
            e.Payload.RootElement.Clone(), e.CrawledAt)).ToList();

        return Results.Ok(new { items, nextCursor });
    }

    private record CursorToken
    {
        [JsonPropertyName("at")] public DateTimeOffset At { get; init; }
        [JsonPropertyName("id")] public Guid Id { get; init; }
    }
}
```

### Sources CRUD — Request Records

```csharp
// Lightweight records for request body binding (no external validation library needed)
public record CreateSourceRequest(
    string Name,
    string DisplayName,
    string Url,
    string Category,
    string ParserKey,
    string CrawlerType = "cheerio",
    int CrawlInterval = 3600,
    int Priority = 5,
    bool IsActive = true
);

public record UpdateSourceRequest(
    string? DisplayName,
    string? Url,
    int? CrawlInterval,
    int? Priority,
    bool? IsActive
);
```

### Program.cs Additions (after app.Build())

```csharp
// After app.Build(), before app.Run():
app.UseCors();  // Must precede route mapping

app.MapGroup("/api/entries").MapEntriesEndpoints();
app.MapGroup("/api/sources").MapSourcesEndpoints();
app.MapGroup("/api/jobs").MapJobsEndpoints();
app.MapGroup("/api/alert-rules").MapAlertRulesEndpoints();
// Replace existing /health MapGet (or update in-place)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Offset pagination (`Skip`/`Take`) | Keyset cursor pagination | EF Core 7+ docs updated | Avoids page drift and O(N) DB scans on large datasets |
| `AddJsonOptions` for minimal API JSON config | `ConfigureHttpJsonOptions` | ASP.NET Core 7 | `AddJsonOptions` only affects MVC; minimal API has its own JSON options service |
| Controllers for REST APIs | Minimal API `MapGroup` + extension methods | ASP.NET Core 7+ | Less ceremony, better performance, consistent with D-01 locked decision |
| Swashbuckle auto-included in templates | Manual NuGet add (net8) or built-in OpenAPI (net9+) | .NET 9 | For net8.0, Swashbuckle 6.x must be added manually |

**Deprecated/outdated:**
- `app.UseEndpoints(...)`: Replaced by top-level `app.MapGet(...)` / `app.MapGroup(...)`. Not needed in .NET 8 minimal APIs.
- `[ApiController]` + `ControllerBase`: Controller style is out of scope per D-01.
- `AddJsonOptions(...)` for minimal APIs: Use `ConfigureHttpJsonOptions` instead.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Swashbuckle 6.9.0 is the latest 6.x stable compatible with net8.0; versions 10.x require .NET 9+ | Standard Stack | Could use wrong version — verify with `dotnet add package Swashbuckle.AspNetCore --version 6.9.0` and check nuget.org |
| A2 | Node.js crawler subscribes to `"retry-job"` Redis Pub/Sub channel for BullMQ re-enqueue | Pattern 3 (job retry) | Redis PUBLISH succeeds but Node.js never picks up job — need to verify Node.js channel name in crawler code before implementing |
| A3 | `string.Compare(e.Id.ToString(), ...)` translates correctly in EF Core/Npgsql for GUID string ordering | Pattern 2 (cursor pagination) | Tie-break sort may be wrong — in practice DateTimeOffset microsecond precision makes GUID ties rare; test with sequential inserts at same timestamp |

---

## Open Questions (RESOLVED)

1. **Node.js retry-job channel name**
   - What we know: D-06 specifies `PUBLISH retry-job <job_id>`. Node.js crawler "subscribes to `retry-job` channel" per CONTEXT.md.
   - What's unclear: The exact channel name used in the Node.js crawler subscription code (not yet implemented in Phase 2/3). The .NET implementation must match it exactly.
   - Recommendation: In Plan 05-04 (jobs endpoint), add a TODO comment noting that the channel name `"retry-job"` must be verified against the Node.js crawler subscription when Phase 2 is implemented. For Phase 5 purposes, use `"retry-job"` as specified.
   - RESOLVED: Use `"retry-job"` as specified in D-06. Plan 05-04 includes a TODO comment for Phase 2 verification.

2. **DELETE /api/alert-rules missing from REQUIREMENTS.md**
   - What we know: REQUIREMENTS.md defines API-08 (GET) and API-09 (POST) for alert rules — no DELETE listed. CONTEXT.md success criterion 4 says "DELETE removes it."
   - What's unclear: Whether DELETE /api/alert-rules/{id} should be added as an unlisted endpoint or if success criterion 4 refers only to POST/GET.
   - Recommendation: Implement DELETE /api/alert-rules/{id} as part of Plan 05-04 since success criterion 4 explicitly requires it. It is likely an omission in REQUIREMENTS.md.
   - RESOLVED: DELETE /api/alert-rules/{id} implemented in Plan 05-04 per ROADMAP.md success criterion 4. REQUIREMENTS.md omission does not override the roadmap.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| .NET SDK | Build + run API | ✓ | 10.0.104 | — |
| PostgreSQL (local) | Test against live DB | ✓ | 17.5 | EF InMemory provider for unit tests |
| Redis CLI | Manual pub/sub verification | ✗ | — | Use StackExchange.Redis in integration test or verify via logs |
| Docker | Container-based integration tests | Not checked | — | Unit tests with mocks sufficient for Phase 5 |

**Missing dependencies with no fallback:** None that block Phase 5 execution.

**Missing dependencies with fallback:**
- Redis CLI: Not needed for implementation. .NET `IConnectionMultiplexer` (already registered) is used directly. Manual retry verification done via logs + job status check.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | xUnit 2.5.3 + Moq 4.20.72 |
| Config file | `apps/api.Tests/WebCrawlerApi.Tests.csproj` |
| Quick run command | `dotnet test apps/api.Tests --no-build -x` |
| Full suite command | `dotnet test apps/api.Tests` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | Cursor pagination returns correct page + nextCursor | unit | `dotnet test apps/api.Tests --filter "EntriesEndpoints"` | ❌ Wave 0 |
| API-02 | GET /sources returns all sources | unit | `dotnet test apps/api.Tests --filter "SourcesEndpoints"` | ❌ Wave 0 |
| API-03 | POST /sources persists new source | unit | `dotnet test apps/api.Tests --filter "SourcesEndpoints"` | ❌ Wave 0 |
| API-04 | PUT /sources/{id} updates fields | unit | `dotnet test apps/api.Tests --filter "SourcesEndpoints"` | ❌ Wave 0 |
| API-05 | DELETE /sources/{id} removes source | unit | `dotnet test apps/api.Tests --filter "SourcesEndpoints"` | ❌ Wave 0 |
| API-06 | GET /jobs with status filter | unit | `dotnet test apps/api.Tests --filter "JobsEndpoints"` | ❌ Wave 0 |
| API-07 | POST /jobs/{id}/retry: DB updated + Redis PUBLISH called | unit | `dotnet test apps/api.Tests --filter "JobsEndpoints"` | ❌ Wave 0 |
| API-08 | GET /alert-rules returns all rules | unit | `dotnet test apps/api.Tests --filter "AlertRulesEndpoints"` | ❌ Wave 0 |
| API-09 | POST /alert-rules persists new rule | unit | `dotnet test apps/api.Tests --filter "AlertRulesEndpoints"` | ❌ Wave 0 |
| API-11 | /health returns 200 with postgres+redis ok | unit | `dotnet test apps/api.Tests --filter "HealthEndpoint"` | ❌ Wave 0 |
| API-11 | /health returns 503 when postgres fails | unit | `dotnet test apps/api.Tests --filter "HealthEndpoint"` | ❌ Wave 0 |

**Test approach for endpoint handlers:** Since endpoints are static methods taking AppDbContext + other DI parameters, test them directly by calling the static handler method with EF InMemory + Moq'd `IConnectionMultiplexer`. This matches the existing test pattern in `api.Tests/Services/`.

**Testing IConnectionMultiplexer PUBLISH:** Use `Mock<IConnectionMultiplexer>` + `Mock<IDatabase>`, verify `PublishAsync` is called with the correct channel and job ID.

### Sampling Rate
- **Per task commit:** `dotnet test apps/api.Tests --no-build`
- **Per wave merge:** `dotnet test apps/api.Tests`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/api.Tests/Endpoints/EntriesEndpointsTests.cs` — covers API-01
- [ ] `apps/api.Tests/Endpoints/SourcesEndpointsTests.cs` — covers API-02, API-03, API-04, API-05
- [ ] `apps/api.Tests/Endpoints/JobsEndpointsTests.cs` — covers API-06, API-07
- [ ] `apps/api.Tests/Endpoints/AlertRulesEndpointsTests.cs` — covers API-08, API-09
- [ ] `apps/api.Tests/Endpoints/HealthEndpointTests.cs` — covers API-11

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth required (personal project, single user per REQUIREMENTS.md out-of-scope) |
| V3 Session Management | no | No sessions — stateless REST API |
| V4 Access Control | no | Single-user personal project |
| V5 Input Validation | yes | Manual validation checks + `Results.ValidationProblem` for 400 responses |
| V6 Cryptography | no | No crypto operations; cursor tokens use base64 (encoding, not encryption — acceptable for non-sensitive pagination tokens) |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed cursor token causing exception | Tampering | Wrap base64 decode + JSON parse in try/catch; return first page on invalid cursor |
| Oversized limit param causing OOM | DoS | Cap at 100 server-side (D-05) |
| JSONB injection via Condition field | Tampering | EF Core parameterized queries prevent SQL injection; JSONB stored as opaque value |
| Circular nav reference causing server crash | Tampering | `ReferenceHandler.IgnoreCycles` prevents `JsonException` (D-08) |

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: apps/api/WebCrawlerApi.csproj] — all existing NuGet packages and versions
- [VERIFIED: apps/api/Program.cs] — DI registrations, existing /health endpoint pattern, Serilog setup
- [VERIFIED: apps/api/Data/AppDbContext.cs] — entity model config, all DbSets, JsonDocument converter
- [VERIFIED: apps/api/Data/Entities/*.cs] — all entity field names, types, navigation properties
- [VERIFIED: apps/api.Tests/WebCrawlerApi.Tests.csproj] — test framework: xUnit 2.5.3 + Moq 4.20.72 + EF InMemory

### Secondary (MEDIUM confidence)
- [CITED: learn.microsoft.com/aspnet/core/fundamentals/minimal-apis] — MapGroup, RouteGroupBuilder extension, AddEndpointsApiExplorer requirement
- [CITED: learn.microsoft.com/ef/core/querying/pagination] — keyset pagination pattern, compound boolean OR expansion
- [CITED: learn.microsoft.com/aspnet/core/security/cors] — CORS setup for minimal APIs
- [VERIFIED: nuget.org — Swashbuckle.AspNetCore 10.1.7 latest; 6.9.0 for net8 compatibility]

### Tertiary (LOW confidence)
- [ASSUMED] Swashbuckle 10.x requires .NET 9+ — cross-check against nuget.org targets before installing

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing packages verified from csproj; only Swashbuckle version has a LOW-confidence assumption
- Architecture: HIGH — MapGroup patterns from official docs; endpoint structure matches locked decisions in CONTEXT.md
- Pitfalls: HIGH — EF Core GUID comparison and JsonDocument disposal are well-documented issues in official repos and docs
- Cursor pagination: MEDIUM — compound boolean OR expansion is the documented workaround; Guid string comparison tie-break has a LOW-confidence assumption (A3)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable ASP.NET Core 8 — no breaking changes expected)
