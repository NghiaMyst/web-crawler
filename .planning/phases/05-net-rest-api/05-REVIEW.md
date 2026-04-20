---
phase: 05-net-rest-api
reviewed: 2026-04-18T10:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - apps/api.Tests/Endpoints/HealthEndpointTests.cs
  - apps/api/Endpoints/AlertRulesEndpoints.cs
  - apps/api/Endpoints/EntriesEndpoints.cs
  - apps/api/Endpoints/HealthCheck.cs
  - apps/api/Endpoints/JobsEndpoints.cs
  - apps/api/Endpoints/SourcesEndpoints.cs
  - apps/api/Models/Responses/DataEntryResponse.cs
  - apps/api/Program.cs
  - apps/api/WebCrawlerApi.csproj
findings:
  critical: 3
  warning: 5
  info: 4
  total: 12
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-04-18T10:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the Phase 05 REST API layer: five endpoint modules, the health check handler, a response DTO, `Program.cs` startup wiring, and the project file. The overall structure is clean — minimal endpoints API, correct use of `AsNoTracking`, and consistent input validation patterns. Three critical issues were found: a test project build failure caused by a duplicate `FrameworkReference` (all tests are currently un-runnable), a `JsonDocument` disposal leak in `AlertRulesEndpoints` that accumulates unmanaged memory, and a fragile Redis URL parser that will break on any credential-bearing or TLS URL. Five warnings cover missing URL validation on create/update, an unbounded jobs query, a TOCTOU race on retry, and a cursor ordering correctness issue. Four informational items address code quality: bare catch-all in the health check, raw entity exposure in list endpoints, a duplicate `InternalsVisibleTo` declaration, and magic status strings.

---

## Critical Issues

### CR-01: Duplicate `FrameworkReference` in test project causes build failure — all tests are un-runnable

**File:** `apps/api.Tests/WebCrawlerApi.Tests.csproj:13` and `:32`
**Issue:** `<FrameworkReference Include="Microsoft.AspNetCore.App" />` appears twice in the test project file — once at line 13 and again at line 32 in a separate `<ItemGroup>`. This produces a fatal MSBuild error:

```
NETSDK1087: Multiple FrameworkReference items for 'Microsoft.AspNetCore.App' were included in the project.
```

The test suite cannot be built or run in its current state. All four health-check tests are unreachable.

**Fix:** Remove one of the two duplicate `<ItemGroup>` blocks containing the `FrameworkReference`. Keep only a single declaration:

```xml
<ItemGroup>
  <FrameworkReference Include="Microsoft.AspNetCore.App" />
</ItemGroup>
```

Delete lines 32-34 (the second occurrence).

---

### CR-02: `JsonDocument` objects created in `CreateAlertRule` are never disposed — unmanaged memory leak

**File:** `apps/api/Endpoints/AlertRulesEndpoints.cs:37-39`
**Issue:** `JsonDocument.Parse(...)` returns an `IDisposable` that holds a pooled `ArrayPool<byte>` buffer. Both call sites on lines 37 and 39 assign the result directly into `rule.Condition` (an EF entity property) without disposing:

```csharp
Condition = req.Condition is not null
    ? JsonDocument.Parse(req.Condition.Value.GetRawText())   // never disposed
    : JsonDocument.Parse("{}"),                              // never disposed
```

EF Core does not own or dispose the `JsonDocument` stored in a navigation/column property. Under load, each `POST /api/alert-rules` call leaks a pooled buffer until the GC finalises the `JsonDocument`, bypassing the pool and causing GC pressure.

**Fix:** Use `JsonSerializer.SerializeToDocument` or clone the element using `JsonElement.Clone()` (which creates a self-contained copy that does not require disposal), or wrap in a `using` and copy the raw bytes:

```csharp
// Option A: store as raw string (if the entity column is text/jsonb):
Condition = req.Condition is not null
    ? req.Condition.Value.GetRawText()
    : "{}",

// Option B: if the entity requires JsonDocument, use Clone to avoid pool leak:
using var doc = req.Condition is not null
    ? JsonDocument.Parse(req.Condition.Value.GetRawText())
    : JsonDocument.Parse("{}");
rule.Condition = doc.RootElement.Clone();  // returns a JsonElement, adjust entity type accordingly
```

---

### CR-03: Redis URL parsing with `string.Replace` breaks on credential-bearing or TLS URLs

**File:** `apps/api/Program.cs:36-37`
**Issue:** The URL is sanitised with:

```csharp
var redisEndpoint = redisConnStr.Replace("redis://", "");
```

This fails silently for any of the following real-world values:

- `redis://:s3cr3t@redis-host:6379` — becomes `:s3cr3t@redis-host:6379`, which is an invalid StackExchange.Redis configuration string that causes a startup crash or connects without authentication.
- `rediss://redis-host:6380` (TLS) — the `rediss://` prefix is not stripped; the literal string `rediss://redis-host:6380` is passed to `Connect`, which fails.
- A URL without any scheme (already a raw config string like `redis-host:6379,password=x`) — the `Replace` is a no-op and works by accident.

**Fix:** Parse with `Uri` and reconstruct a proper StackExchange.Redis configuration string:

```csharp
var redisConnStr = Environment.GetEnvironmentVariable("REDIS_URL") ?? "localhost:6379";
string redisEndpoint;
if (Uri.TryCreate(redisConnStr, UriKind.Absolute, out var redisUri)
    && (redisUri.Scheme is "redis" or "rediss"))
{
    var host = redisUri.Host;
    var port = redisUri.IsDefaultPort ? 6379 : redisUri.Port;
    var password = Uri.UnescapeDataString(redisUri.UserInfo.TrimStart(':'));
    var ssl = redisUri.Scheme == "rediss";
    redisEndpoint = $"{host}:{port}"
        + (string.IsNullOrEmpty(password) ? "" : $",password={password}")
        + (ssl ? ",ssl=true" : "");
}
else
{
    redisEndpoint = redisConnStr; // already a StackExchange.Redis config string
}
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect(redisEndpoint));
```

---

## Warnings

### WR-01: `GetJobs` returns all rows with no pagination — unbounded query on a high-growth table

**File:** `apps/api/Endpoints/JobsEndpoints.cs:17-25`
**Issue:** `GetJobs` fetches every row in `CrawlJobs` with no `Take()` limit. A long-running system accumulates thousands of job records; this endpoint will either time out or return megabytes of JSON. The same gap exists in `GetAlertRules` (line 20) and `GetAllSources` (line 21), but jobs are the most likely table to grow unboundedly at high throughput.

**Fix:** Add a `limit` parameter with a sane cap:

```csharp
internal static async Task<IResult> GetJobs(
    AppDbContext db, string? status = null, int limit = 100)
{
    limit = Math.Clamp(limit, 1, 500);
    var query = db.CrawlJobs.AsNoTracking().AsQueryable();
    if (status is not null)
        query = query.Where(j => j.Status == status);
    var jobs = await query
        .OrderByDescending(j => j.CreatedAt)
        .Take(limit)
        .ToListAsync();
    return Results.Ok(jobs);
}
```

---

### WR-02: `RetryJob` has a TOCTOU race — two concurrent retries on the same job are both accepted

**File:** `apps/api/Endpoints/JobsEndpoints.cs:31-46`
**Issue:** Two simultaneous POST requests to `/api/jobs/{id}/retry` will both pass the `job.Status != "failed"` guard because both `FindAsync` calls read the same committed row before either write. Both will reset `AttemptCount = 0` and publish to Redis, queuing the job twice and consuming two of the three retry attempts at once.

**Fix:** Replace the read-modify-write with a single atomic conditional UPDATE:

```csharp
var updated = await db.CrawlJobs
    .Where(j => j.Id == id && j.Status == "failed")
    .ExecuteUpdateAsync(s => s
        .SetProperty(j => j.Status, "pending")
        .SetProperty(j => j.AttemptCount, 0)
        .SetProperty(j => j.ErrorMessage, (string?)null));

if (updated == 0)
    return Results.NotFound(); // not found or not in failed state
```

Then publish to Redis only after confirming `updated == 1`.

---

### WR-03: `CreateSource` and `UpdateSource` do not validate that `Url` is a well-formed HTTP/HTTPS URI

**File:** `apps/api/Endpoints/SourcesEndpoints.cs:35`, `65`
**Issue:** `CreateSource` checks `IsNullOrWhiteSpace(req.Url)` but any string passes — including `"not-a-url"`, `"javascript:alert(1)"`, or `"file:///etc/passwd"`. The crawler will store and later attempt to crawl the malformed URL, causing confusing downstream errors. `UpdateSource` applies `req.Url` (line 65) with no validation at all.

**Fix:** Add URI scheme validation to both handlers:

```csharp
if (!Uri.TryCreate(req.Url, UriKind.Absolute, out var parsedUri)
    || parsedUri.Scheme is not ("http" or "https"))
    errors["url"] = new[] { "URL must be an absolute http or https URI" };
```

---

### WR-04: Cursor secondary sort uses string-lexicographic GUID comparison — can skip or repeat rows on timestamp collision

**File:** `apps/api/Endpoints/EntriesEndpoints.cs:56-59`
**Issue:** The cursor tiebreaker compares GUIDs as strings:

```csharp
string.Compare(e.Id.ToString(), decoded.Id) < 0
```

String-lexicographic order of the hyphenated GUID representation (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) does not equal byte-level UUID order. When multiple rows share the same `CrawledAt` timestamp, the page boundary may land in the wrong place, causing rows to be silently omitted or returned twice across pages. The code comment acknowledges EF Core translation difficulties but does not resolve the semantic issue.

**Fix:** Store a deterministic integer sequence number as a secondary sort column, or rely on the Npgsql-native `uuid`-to-`uuid` comparison (EF Core with Npgsql 8 can translate `Guid` ordering in `OrderBy`/`Where` without calling `ToString()`):

```csharp
// Remove the .ToString() calls; use Guid comparisons directly:
query = query.Where(e =>
    e.CrawledAt < decoded.At ||
    (e.CrawledAt == decoded.At && e.Id < decoded.GuidId));
// Update CursorToken.Id type to Guid
```

---

### WR-05: `CORS_ORIGINS` env var split produces `[""]` when the variable is set to an empty string — CORS policy silently becomes permissive

**File:** `apps/api/Program.cs:73-74`
**Issue:**

```csharp
Environment.GetEnvironmentVariable("CORS_ORIGINS")?.Split(',')
    ?? new[] { "http://localhost:3000" }
```

If `CORS_ORIGINS` is set to an empty string (a common misconfiguration in CI/CD pipelines where a secret is defined but not populated), `Split(',')` returns `[""]`. ASP.NET Core's CORS middleware treats an empty-string origin as a wildcard match in some versions, or allows the literal empty-string origin, neither of which is the intended behaviour.

**Fix:** Guard against empty values before splitting:

```csharp
var originsEnv = Environment.GetEnvironmentVariable("CORS_ORIGINS");
var allowedOrigins = !string.IsNullOrWhiteSpace(originsEnv)
    ? originsEnv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    : new[] { "http://localhost:3000" };

policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
```

---

## Info

### IN-01: `HealthCheck.cs` bare `catch` blocks swallow non-recoverable CLR exceptions

**File:** `apps/api/Endpoints/HealthCheck.cs:18-21`, `28-31`
**Issue:** Both probe `catch` blocks use `catch` with no type filter. This catches `OutOfMemoryException` and `StackOverflowException`, masking fatal runtime failures as a "degraded" status instead of propagating them normally.

**Fix:** Constrain the catch to recoverable exceptions:

```csharp
catch (Exception ex) when (ex is not OutOfMemoryException and not StackOverflowException)
{
    pgStatus = "error";
}
```

---

### IN-02: `GetAlertRules` and `GetAllSources` return raw EF entity objects — DB internals exposed in API response

**File:** `apps/api/Endpoints/AlertRulesEndpoints.cs:20-21`, `apps/api/Endpoints/SourcesEndpoints.cs:21-22`
**Issue:** Both handlers return `db.AlertRules.ToListAsync()` and `db.Sources.ToListAsync()` directly. As entity models grow (concurrency tokens, shadow properties, navigation properties), those fields will silently appear in the public JSON response. `DataEntryResponse` already demonstrates the correct DTO projection pattern.

**Fix:** Define `AlertRuleResponse` and `SourceResponse` DTOs and project into them using `.Select(e => new SourceResponse(...))` inside the query.

---

### IN-03: `InternalsVisibleTo` is declared in both `EntriesEndpoints.cs` and `WebCrawlerApi.csproj` — redundant duplicate

**File:** `apps/api/Endpoints/EntriesEndpoints.cs:8`, `apps/api/WebCrawlerApi.csproj:9-11`
**Issue:** `[assembly: InternalsVisibleTo("WebCrawlerApi.Tests")]` appears as a C# assembly attribute at the top of `EntriesEndpoints.cs` AND as an `<AssemblyAttribute>` item in the `.csproj`. The MSBuild element generates the same attribute at compile time, so the source declaration is redundant and may produce a compiler warning about duplicate attributes in some SDK versions.

**Fix:** Remove the `[assembly: InternalsVisibleTo("WebCrawlerApi.Tests")]` line from `EntriesEndpoints.cs` (line 8). The `.csproj` declaration is the canonical location for generated assembly attributes.

---

### IN-04: Magic string literals for job status and crawler type should be named constants

**File:** `apps/api/Endpoints/JobsEndpoints.cs:33,38`, `apps/api/Endpoints/SourcesEndpoints.cs:46`, `apps/api/Program.cs:42-46`
**Issue:** Status strings `"failed"`, `"pending"`, and the default crawler type `"cheerio"` appear directly in business logic conditionals. A typo or future rename will silently mismatch against values stored in PostgreSQL without any compile-time error.

**Fix:** Define a shared constants class:

```csharp
public static class JobStatus
{
    public const string Failed  = "failed";
    public const string Pending = "pending";
}

public static class CrawlerType
{
    public const string Cheerio = "cheerio";
}
```

---

_Reviewed: 2026-04-18T10:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
