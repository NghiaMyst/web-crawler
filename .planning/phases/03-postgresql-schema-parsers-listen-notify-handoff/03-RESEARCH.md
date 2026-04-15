# Phase 3: PostgreSQL Schema, Parsers & LISTEN/NOTIFY Handoff - Research

**Researched:** 2026-04-10
**Domain:** EF Core 8 + Npgsql, PostgreSQL LISTEN/NOTIFY, .NET 8 keyed services, Node.js pg client, StackExchange.Redis
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Node.js inserts a `crawl_jobs` row (source_id, url, status, content_hash) into PostgreSQL directly using a `pg` client, then emits `NOTIFY crawler_events '{"job_id":"...","source_id":"...","parser_key":"..."}'`. Node.js is NOT DB-free — it owns its job audit log.
- **D-02:** NOTIFY message carries exactly: `{ job_id, source_id, parser_key }`. Minimal routing signal — enough for .NET to resolve the correct parser immediately without a DB lookup. Raw content is NOT in the NOTIFY payload (PostgreSQL NOTIFY limit is 8000 bytes).
- **D-03:** Node.js writes raw crawl content to Redis under key `job:raw:{job_id}` with TTL 5 minutes. .NET reads from this key after receiving NOTIFY, runs the parser, then the key naturally expires. No `raw_content` column added to `crawl_jobs` schema.
- **D-04:** UPSERT on `data_entries`: `ON CONFLICT (source_id, entry_key) DO UPDATE SET payload = EXCLUDED.payload, crawled_at = NOW()`. Migration must define a `UNIQUE (source_id, entry_key)` constraint. One row per logical entity.
- **D-05:** Happy-path parsers. On missing/null fields: log a `WARN` with source context and skip that entry (do not throw). No schema validation library.
- **D-06:** Phase 3 wires a complete working `AppDbContext` (models, DbSets for all 5 entities, connection string from env `DATABASE_URL`). Not deferred to Phase 5.

### Claude's Discretion
- `pg` npm package vs `postgres` library choice for Node.js
- Npgsql LISTEN/NOTIFY implementation pattern (IHostedService with `WaitAsync` loop or event-based)
- Redis key naming for raw content staging beyond the `job:raw:{job_id}` prefix
- Migration timestamp values (`YYYYMMDD_description` naming convention is fixed, timestamp value is Claude's choice)
- EF Core entity property naming conventions (C# PascalCase → PostgreSQL snake_case via convention)

### Deferred Ideas (OUT OF SCOPE)
- Defensive null-checks / schema validation in parsers — deferred to Phase 4+
- `raw_content` column on `crawl_jobs` — decided against; Redis staging chosen instead
- Per-domain BullMQ queue approach for raw content handoff — already decided against; LISTEN/NOTIFY confirmed
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STORE-01 | Raw crawl metadata (URL, status, content hash, timestamps) stored in `crawl_jobs` table | EF Core entity + migration covers all columns in SCHEMA.md |
| STORE-02 | Parsed domain data stored in `data_entries` with JSONB payload, GIN-indexed | `HasColumnType("jsonb")` + `HasIndex().HasMethod("gin")` in Fluent API |
| STORE-03 | Each entry has a stable `entry_key` for diff comparison | `UNIQUE (source_id, entry_key)` constraint + UPSERT pattern via `ExecuteSqlRawAsync` |
| STORE-04 | PostgreSQL schema managed via Entity Framework Core Migrations | `dotnet ef migrations add` / `dotnet ef database update` — `dotnet-ef 8.0.11` installed globally |
| PARSE-01 | Each domain has a dedicated parser class implementing `IContentParser` interface (.NET) | Interface design + 5 parser classes (Football, Genshin, LoL, AniList, MangaDex) |
| PARSE-02 | Parser selection is config-driven via .NET 8 keyed services (no hardcoded switch) | `AddKeyedScoped<IContentParser, FootballParser>("football")` + `IKeyedServiceProvider.GetRequiredKeyedService` |
| PARSE-03 | Parsers are triggered via PostgreSQL LISTEN/NOTIFY from Node.js crawler to .NET API | `pg` client INSERT + `pg_notify` in Node.js; `NpgsqlConnection.Notification` + `WaitAsync` loop in .NET |
</phase_requirements>

---

## Summary

Phase 3 bridges Node.js and .NET via PostgreSQL's LISTEN/NOTIFY mechanism. The data flow is: Node.js crawler fetches content → stores raw in Redis (`job:raw:{job_id}`, TTL 5min) → inserts `crawl_jobs` row → emits `NOTIFY crawler_events` with `{job_id, source_id, parser_key}` → .NET `IHostedService` receives notification → resolves correct `IContentParser` via keyed services → reads Redis → parses → upserts `data_entries`.

The .NET side requires three additions to `WebCrawlerApi.csproj`: `Npgsql.EntityFrameworkCore.PostgreSQL 8.0.11`, `EFCore.NamingConventions 8.0.3`, and `StackExchange.Redis 2.11.8`. The `Microsoft.EntityFrameworkCore.Design 8.0.22` package is also needed for the `dotnet-ef` CLI (globally installed at 8.0.11). The Node.js side requires adding the `pg 8.20.0` package (not yet in `apps/crawler/package.json`) with `@types/pg 8.20.0` as a dev dependency.

The installed `dotnet-ef` global tool is version 8.0.11. This locks the Npgsql EF Core provider to the 8.x line — Npgsql 10.x requires EF Core 10, which is incompatible with the project's `net8.0` target framework. Use `Npgsql.EntityFrameworkCore.PostgreSQL 8.0.11` to align with the installed tooling.

**Primary recommendation:** Use `pg` pool + dedicated client checkout for the Node.js INSERT + pg_notify transaction. Use `NpgsqlConnection.Notification` event + `WaitAsync` loop inside a `BackgroundService` with a dedicated (non-pooled) connection plus `Keepalive=30` in the connection string. Implement UPSERT via `context.Database.ExecuteSqlRawAsync` with raw ON CONFLICT SQL.

---

## Standard Stack

### Core (.NET API)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `Npgsql.EntityFrameworkCore.PostgreSQL` | 8.0.11 | EF Core provider for PostgreSQL | Official Npgsql EF Core provider; must match EF Core major version (8) |
| `EFCore.NamingConventions` | 8.0.3 | Auto snake_case column naming | Eliminates manual `[Column("snake_name")]` on every property; single call to `UseSnakeCaseNamingConvention()` |
| `Microsoft.EntityFrameworkCore.Design` | 8.0.22 | `dotnet ef` CLI tooling support | Required for migration generation; `PrivateAssets=all` so it doesn't ship in output |
| `StackExchange.Redis` | 2.11.8 | Read raw content from Redis | Industry standard .NET Redis client; `IConnectionMultiplexer` injectable via DI |

### Core (Node.js Crawler)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` | 8.20.0 | PostgreSQL client for INSERT + pg_notify | Official node-postgres; already widely used in ecosystem; Pool supports transaction checkout |
| `@types/pg` | 8.20.0 | TypeScript types for `pg` | Dev dependency aligned with pg version |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pg` (Node.js) | `postgres` (npm) | `postgres` has cleaner API but `pg` is more established and Pool.connect() transaction pattern is well-documented |
| raw `ExecuteSqlRawAsync` for upsert | `FlexLabs.EntityFrameworkCore.Upsert` | Additional dependency for a single operation; raw SQL is transparent and sufficient |
| `EFCore.NamingConventions` | Manual `[Column]` attributes | Attributes are verbose and error-prone across 5 entities with many columns |

**Installation:**

```bash
# .NET API — add to apps/api/WebCrawlerApi.csproj
dotnet add apps/api package Npgsql.EntityFrameworkCore.PostgreSQL --version 8.0.11
dotnet add apps/api package EFCore.NamingConventions --version 8.0.3
dotnet add apps/api package Microsoft.EntityFrameworkCore.Design --version 8.0.22
dotnet add apps/api package StackExchange.Redis --version 2.11.8

# Node.js crawler — pg not yet in package.json
cd apps/crawler && pnpm add pg@8.20.0 && pnpm add -D @types/pg@8.20.0
```

**Version verification:** All versions confirmed against NuGet registry and npm registry as of 2026-04-10.

---

## Architecture Patterns

### Recommended Project Structure

```
apps/api/
├── Data/
│   ├── AppDbContext.cs          # DbContext with all 5 DbSets
│   ├── Entities/
│   │   ├── Source.cs
│   │   ├── CrawlJob.cs
│   │   ├── DataEntry.cs
│   │   ├── AlertRule.cs
│   │   └── NotificationLog.cs
│   └── Migrations/
│       └── 20260410_InitialSchema.cs  (generated by dotnet ef)
├── Parsers/
│   ├── IContentParser.cs
│   ├── ParsedData.cs
│   ├── FootballParser.cs
│   ├── GenshinParser.cs
│   ├── LolParser.cs
│   ├── AniListParser.cs
│   └── MangaDexParser.cs
├── Services/
│   └── CrawlerEventListener.cs  # IHostedService for LISTEN/NOTIFY
├── Program.cs
└── WebCrawlerApi.csproj

apps/crawler/src/
├── db/
│   └── crawlJobsDb.ts           # pg Pool, INSERT crawl_jobs + pg_notify
└── workers/
    └── crawlWorker.ts           # integration point: call crawlJobsDb after fetch
```

---

### Pattern 1: EF Core AppDbContext with snake_case + Npgsql

```csharp
// Source: Npgsql EF Core docs (https://www.npgsql.org/efcore/)
// apps/api/Data/AppDbContext.cs
using Microsoft.EntityFrameworkCore;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Source> Sources => Set<Source>();
    public DbSet<CrawlJob> CrawlJobs => Set<CrawlJob>();
    public DbSet<DataEntry> DataEntries => Set<DataEntry>();
    public DbSet<AlertRule> AlertRules => Set<AlertRule>();
    public DbSet<NotificationLog> NotificationLogs => Set<NotificationLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // GIN index on data_entries.payload (JSONB) — STORE-02
        modelBuilder.Entity<DataEntry>()
            .HasIndex(e => e.Payload)
            .HasMethod("gin");

        // UNIQUE constraint on (source_id, entry_key) — STORE-03, D-04
        modelBuilder.Entity<DataEntry>()
            .HasIndex(e => new { e.SourceId, e.EntryKey })
            .IsUnique();

        // Partial index for active sources
        modelBuilder.Entity<Source>()
            .HasIndex(s => s.IsActive)
            .HasFilter("is_active = true");
    }
}
```

```csharp
// apps/api/Program.cs — AddDbContext registration
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(Environment.GetEnvironmentVariable("DATABASE_URL")
        ?? throw new InvalidOperationException("DATABASE_URL env var not set"))
       .UseSnakeCaseNamingConvention());
```

---

### Pattern 2: EF Core Entity for DataEntry with JSONB

```csharp
// Source: Npgsql JSONB docs — HasColumnType("jsonb")
// apps/api/Data/Entities/DataEntry.cs
using System.Text.Json;

public class DataEntry
{
    public Guid Id { get; set; }
    public Guid SourceId { get; set; }
    public Guid? JobId { get; set; }
    public string Category { get; set; } = string.Empty;
    public string? EntryKey { get; set; }

    [Column(TypeName = "jsonb")]
    public JsonDocument Payload { get; set; } = default!;

    public DateTimeOffset CrawledAt { get; set; }

    // Navigation
    public Source Source { get; set; } = default!;
    public CrawlJob? Job { get; set; }
}
```

Note: `[Column(TypeName = "jsonb")]` maps the property to PostgreSQL `jsonb`. EF Core maps `JsonDocument` to `jsonb` automatically when using Npgsql provider with `HasColumnType("jsonb")` in Fluent API OR the attribute. Either approach works; Fluent API in `OnModelCreating` is preferred for consistency with the rest of the model configuration.

---

### Pattern 3: EF Core Migration Commands

```bash
# From repo root — specify project (contains DbContext) and startup project (has DI config)
# dotnet-ef 8.0.11 is installed globally

dotnet ef migrations add 20260410_InitialSchema \
  --project apps/api \
  --startup-project apps/api

# Apply to the Compose PostgreSQL (postgres service exposed on localhost:5432)
dotnet ef database update \
  --project apps/api \
  --startup-project apps/api
```

The migration runs against the connection string in `DATABASE_URL` env var. When running outside Docker (from host), `DATABASE_URL` should point to `localhost:5432` (the mapped port). The Docker Compose PostgreSQL uses:
- Host: `localhost` (from host) or `postgres` (from inside containers)
- Port: `5432`
- DB: `webcrawler`
- User: `crawler`
- Password: from `POSTGRES_PASSWORD` env var (default: `changeme`)

Connection string format for `apps/api/.env`:
```
DATABASE_URL=Host=localhost;Port=5432;Database=webcrawler;Username=crawler;Password=changeme
```

---

### Pattern 4: PostgreSQL LISTEN/NOTIFY BackgroundService (.NET)

```csharp
// Source: Npgsql docs (https://www.npgsql.org/doc/wait.html) + bytefish.de pattern
// apps/api/Services/CrawlerEventListener.cs

public class CrawlerEventListener(
    IKeyedServiceProvider keyedServiceProvider,
    IConnectionMultiplexer redis,
    AppDbContext db,
    ILogger<CrawlerEventListener> logger) : BackgroundService
{
    private const string Channel = "crawler_events";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Dedicated connection — NOT from EF Core pool
        // Keepalive=30 prevents idle timeout during quiet periods
        var connStr = (Environment.GetEnvironmentVariable("DATABASE_URL") ?? "")
            + ";Keepalive=30";

        await using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync(stoppingToken);

        conn.Notification += (_, args) =>
        {
            // args.Payload is the JSON string from pg_notify
            logger.LogInformation("NOTIFY received on {Channel}: {Payload}",
                args.Channel, args.Payload);
            _ = HandleNotificationAsync(args.Payload, stoppingToken);
        };

        await using (var cmd = new NpgsqlCommand($"LISTEN {Channel}", conn))
        {
            await cmd.ExecuteNonQueryAsync(stoppingToken);
        }

        logger.LogInformation("Listening on PostgreSQL channel: {Channel}", Channel);

        // Block here, returning control on each notification arrival
        while (!stoppingToken.IsCancellationRequested)
        {
            await conn.WaitAsync(stoppingToken);
        }
    }

    private async Task HandleNotificationAsync(string payload, CancellationToken ct)
    {
        try
        {
            var msg = JsonSerializer.Deserialize<CrawlerNotification>(payload)!;
            logger.LogInformation("Dispatching parser for {ParserKey}", msg.ParserKey);

            var parser = keyedServiceProvider
                .GetRequiredKeyedService<IContentParser>(msg.ParserKey);

            var redisDb = redis.GetDatabase();
            var raw = await redisDb.StringGetAsync($"job:raw:{msg.JobId}");
            if (raw.IsNullOrEmpty)
            {
                logger.LogWarning("Redis key job:raw:{JobId} missing or expired", msg.JobId);
                return;
            }

            var results = await parser.ParseAsync(raw!, msg.SourceId, ct);
            foreach (var entry in results)
            {
                await UpsertEntryAsync(entry, msg.JobId, ct);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed handling notification: {Payload}", payload);
        }
    }

    private async Task UpsertEntryAsync(ParsedEntry entry, string jobId, CancellationToken ct)
    {
        // Raw SQL upsert — ON CONFLICT on UNIQUE(source_id, entry_key)
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO data_entries (id, source_id, job_id, category, entry_key, payload, crawled_at)
            VALUES (gen_random_uuid(), {0}::uuid, {1}::uuid, {2}, {3}, {4}::jsonb, NOW())
            ON CONFLICT (source_id, entry_key)
            DO UPDATE SET
                payload = EXCLUDED.payload,
                job_id = EXCLUDED.job_id,
                crawled_at = NOW()
            """,
            entry.SourceId, jobId, entry.Category, entry.EntryKey,
            JsonSerializer.Serialize(entry.Payload), ct);
    }
}

public record CrawlerNotification(
    [property: JsonPropertyName("job_id")] string JobId,
    [property: JsonPropertyName("source_id")] string SourceId,
    [property: JsonPropertyName("parser_key")] string ParserKey);
```

**Important:** The LISTEN connection must be separate from EF Core's connection pool. LISTEN subscriptions are session-scoped — they cannot be shared across pooled connections, and the pool may recycle the connection. The `Keepalive=30` parameter (seconds) sends periodic ping roundtrips to prevent idle timeout.

---

### Pattern 5: Node.js INSERT + pg_notify Transaction

```typescript
// Source: node-postgres docs (https://node-postgres.com/features/transactions)
// apps/crawler/src/db/crawlJobsDb.ts

import { Pool } from 'pg';
import { logger } from '../logger.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://crawler:changeme@localhost:5432/webcrawler',
});

export interface CrawlJobInsert {
  sourceId: string;
  url: string;
  status: string;
  contentHash: string | null;
  parserKey: string;
}

export async function insertCrawlJobAndNotify(data: CrawlJobInsert): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query<{ id: string }>(
      `INSERT INTO crawl_jobs (id, source_id, url, status, content_hash, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
       RETURNING id`,
      [data.sourceId, data.url, data.status, data.contentHash]
    );
    const jobId = result.rows[0].id;

    const notifyPayload = JSON.stringify({
      job_id: jobId,
      source_id: data.sourceId,
      parser_key: data.parserKey,
    });

    // pg_notify is atomic with the INSERT — NOTIFY only fires on COMMIT
    await client.query(`SELECT pg_notify('crawler_events', $1)`, [notifyPayload]);

    await client.query('COMMIT');
    logger.info('crawl_jobs INSERT + NOTIFY committed', { jobId, sourceId: data.sourceId });
    return jobId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

**Key rules from node-postgres docs:** You MUST use the same client instance for all statements within a transaction. Using `pool.query()` in a transaction causes problems because it can distribute statements across different connections. Use `pool.connect()` to get a dedicated client, run all transaction statements on it, then `client.release()`.

---

### Pattern 6: IContentParser Interface + Keyed Service Registration

```csharp
// Source: .NET 8 keyed services docs (https://andrewlock.net/exploring-the-dotnet-8-preview-keyed-services-dependency-injection-support/)
// apps/api/Parsers/IContentParser.cs

public interface IContentParser
{
    Task<IReadOnlyList<ParsedEntry>> ParseAsync(
        string rawContent,
        string sourceId,
        CancellationToken ct = default);
}

public record ParsedEntry(
    string SourceId,
    string EntryKey,
    string Category,
    object Payload);   // will be JsonSerializer.Serialize'd before storage
```

```csharp
// apps/api/Program.cs — keyed service registrations (PARSE-02)
builder.Services.AddKeyedScoped<IContentParser, FootballParser>("football");
builder.Services.AddKeyedScoped<IContentParser, GenshinParser>("genshin");
builder.Services.AddKeyedScoped<IContentParser, LolParser>("lol");
builder.Services.AddKeyedScoped<IContentParser, AniListParser>("anilist");
builder.Services.AddKeyedScoped<IContentParser, MangaDexParser>("mangadex");

// IKeyedServiceProvider is automatically resolvable from IServiceProvider in .NET 8 RTM
// (the preview limitation noted in Andrew Lock's blog was resolved before RTM)
builder.Services.AddHostedService<CrawlerEventListener>();
```

Dynamic resolution in `CrawlerEventListener`:
```csharp
// Inject IKeyedServiceProvider via constructor — it is registered by .NET 8 DI container
var parser = keyedServiceProvider.GetRequiredKeyedService<IContentParser>(msg.ParserKey);
logger.LogInformation("Resolved parser: {ParserType}", parser.GetType().Name);
```

---

### Pattern 7: StackExchange.Redis DI Registration

```csharp
// apps/api/Program.cs
var redisConnStr = Environment.GetEnvironmentVariable("REDIS_URL") ?? "localhost:6379";
// StackExchange.Redis uses comma-separated "host:port" format, not redis:// URI
// Convert redis://host:port → host:port
var redisEndpoint = redisConnStr.Replace("redis://", "");
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect(redisEndpoint));
```

Read pattern in parser/listener:
```csharp
var db = redis.GetDatabase();
var raw = await db.StringGetAsync($"job:raw:{jobId}");
```

---

### Pattern 8: Happy-Path Parser (D-05 compliance)

```csharp
// apps/api/Parsers/FootballParser.cs
public class FootballParser(ILogger<FootballParser> logger) : IContentParser
{
    public Task<IReadOnlyList<ParsedEntry>> ParseAsync(
        string rawContent, string sourceId, CancellationToken ct = default)
    {
        var results = new List<ParsedEntry>();
        try
        {
            using var doc = JsonDocument.Parse(rawContent);
            var matches = doc.RootElement.GetProperty("matches");

            foreach (var match in matches.EnumerateArray())
            {
                if (!match.TryGetProperty("id", out var idEl))
                {
                    logger.LogWarning("FootballParser: match missing 'id' field, skipping. SourceId={SourceId}", sourceId);
                    continue;
                }

                var entryKey = $"match_{idEl.GetInt32()}";
                var payload = new
                {
                    home_team = match.GetProperty("homeTeam").GetProperty("name").GetString(),
                    away_team = match.GetProperty("awayTeam").GetProperty("name").GetString(),
                    // ...other fields
                };

                results.Add(new ParsedEntry(sourceId, entryKey, "football", payload));
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "FootballParser: parse failed for sourceId={SourceId}", sourceId);
        }

        return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
    }
}
```

---

### Anti-Patterns to Avoid

- **Sharing the LISTEN connection with EF Core pool:** PostgreSQL LISTEN subscriptions are session-scoped. If the connection is returned to the pool, the LISTEN subscription is lost. Always open a dedicated `NpgsqlConnection` for the listener.
- **Using `pool.query()` inside a transaction in Node.js:** The pool distributes queries across connections. A `BEGIN` on one connection and `INSERT` on another breaks the transaction. Always use `pool.connect()` to get a single client, run all transaction statements on it, and `client.release()` in finally.
- **Putting raw content in the NOTIFY payload:** PostgreSQL NOTIFY payload limit is 8000 bytes. A full HTML page easily exceeds this. The Redis staging approach (D-03) is the correct solution.
- **Registering `CrawlerEventListener` as `AddScoped`:** `IHostedService` implementations must be registered as singletons or via `AddHostedService`. Scoped registration does not work for hosted services.
- **Npgsql 10.x on a net8.0 project:** Version 10.x of `Npgsql.EntityFrameworkCore.PostgreSQL` requires EF Core 10.x, which targets net10.0. The project targets net8.0 with `dotnet-ef 8.0.11`. Use version 8.0.11 of the Npgsql provider.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| snake_case column naming | `[Column("source_id")]` on every property | `EFCore.NamingConventions` `UseSnakeCaseNamingConvention()` | 5 entities × ~8 columns each = 40 manual annotations, all error-prone |
| PostgreSQL UPSERT | Separate SELECT then INSERT/UPDATE | Raw SQL `INSERT ... ON CONFLICT DO UPDATE` via `ExecuteSqlRawAsync` | Race condition without atomicity; ON CONFLICT is the correct primitive |
| Parser dispatch | `switch (parserKey)` or `if/else` chains | .NET 8 `AddKeyedScoped` + `GetRequiredKeyedService` | Keyed services are the exact .NET 8 DI feature designed for this pattern (PARSE-02) |
| Redis client | Manual TCP socket | `StackExchange.Redis` `IConnectionMultiplexer` | Connection multiplexing, reconnect logic, pipelining all handled |
| PostgreSQL keepalive | Application-level ping timer | `Keepalive=30` in connection string | Built into Npgsql; avoids reinventing infrastructure |

**Key insight:** The LISTEN/NOTIFY handoff with keyed-service dispatch is the architectural centerpiece of this phase. EF Core migrations + Npgsql handle all schema complexity so implementation can focus on the data flow logic.

---

## Common Pitfalls

### Pitfall 1: Version Mismatch between dotnet-ef and Npgsql provider
**What goes wrong:** `dotnet ef migrations add` fails with "The 'dotnet-ef' tool version does not match the version of the EF Core runtime being used."
**Why it happens:** `dotnet-ef 8.0.11` is globally installed. If `Npgsql.EntityFrameworkCore.PostgreSQL 10.x` is added (which pulls in EF Core 10.x), there is a version mismatch.
**How to avoid:** Always use `Npgsql.EntityFrameworkCore.PostgreSQL 8.0.11` (matches `dotnet-ef 8.0.11`). The NuGet major version must match the EF Core major version must match the `dotnet-ef` tool version.
**Warning signs:** Error message mentioning "tool version" mismatch during `dotnet ef migrations add`.

### Pitfall 2: LISTEN subscription lost on connection pool recycle
**What goes wrong:** .NET receives some notifications but then silently stops receiving them without error.
**Why it happens:** If the EF Core `AppDbContext` connection pool is used for LISTEN instead of a dedicated connection, the pool may close and reopen the connection, discarding the LISTEN subscription.
**How to avoid:** `CrawlerEventListener` opens its own `new NpgsqlConnection(connStr)` — never shares EF Core's pooled connections. The dedicated connection stays open for the process lifetime.
**Warning signs:** Notifications working initially then going quiet; no error logged.

### Pitfall 3: pg_notify fires before crawl content is written to Redis
**What goes wrong:** .NET receives the NOTIFY, looks up `job:raw:{job_id}` in Redis, finds nothing (or stale data).
**Why it happens:** If the Node.js code writes Redis AFTER the pg_notify, there is a race condition. The NOTIFY and Redis write are not atomic.
**How to avoid:** In Node.js, write to Redis BEFORE beginning the database transaction. Order: (1) `redis.set(key, content, 'EX', 300)`, (2) `BEGIN`, (3) `INSERT crawl_jobs`, (4) `pg_notify`, (5) `COMMIT`. Because NOTIFY only fires on COMMIT, by the time .NET reads Redis the key is guaranteed to exist.
**Warning signs:** `.NET warns "Redis key job:raw:{JobId} missing"` intermittently.

### Pitfall 4: GIN index not used in EXPLAIN ANALYZE
**What goes wrong:** `EXPLAIN ANALYZE` on a JSONB `@>` query shows `Seq Scan` instead of `Bitmap Index Scan`.
**Why it happens:** PostgreSQL only uses a GIN index when the query uses GIN-compatible operators (`@>`, `?`, `?|`, `?&`). Simple `payload ->> 'key' = 'value'` equality does NOT use the GIN index.
**How to avoid:** For the success criterion EXPLAIN ANALYZE test, use the `@>` operator: `WHERE payload @> '{"is_active": true}'`. This is guaranteed to trigger the GIN index.
**Warning signs:** EXPLAIN shows sequential scan even with GIN index in place.

### Pitfall 5: JsonDocument disposal before serialization
**What goes wrong:** `JsonDocument` from `JsonDocument.Parse(rawContent)` is disposed before the payload is serialized to string for the UPSERT.
**Why it happens:** `JsonDocument` implements `IDisposable`. Using `using var doc = JsonDocument.Parse(...)` then capturing a `JsonElement` (reference into the doc) after the using block ends causes use-after-free behavior.
**How to avoid:** Serialize the payload to a `string` (via `JsonSerializer.Serialize(...)`) while the `JsonDocument` is still in scope. Pass the string to `ExecuteSqlRawAsync`, not the `JsonElement`.
**Warning signs:** `ObjectDisposedException` or corrupted JSON in `data_entries.payload`.

### Pitfall 6: StackExchange.Redis connection string format
**What goes wrong:** `ConnectionMultiplexer.Connect("redis://localhost:6379")` throws a connection error.
**Why it happens:** StackExchange.Redis uses its own connection string format (`host:port,password=xxx`), NOT the `redis://` URI scheme that ioredis uses.
**How to avoid:** Strip the `redis://` prefix. If `REDIS_URL=redis://localhost:6379`, extract `localhost:6379` before passing to `ConnectionMultiplexer.Connect()`.
**Warning signs:** `RedisConnectionException: No connection is available to service this operation` on startup.

---

## Code Examples

### GIN Index + UNIQUE Constraint in EF Core Fluent API

```csharp
// Source: [VERIFIED: npgsql.org/efcore/modeling/indexes.html]
modelBuilder.Entity<DataEntry>()
    .HasIndex(e => e.Payload)
    .HasMethod("gin");  // Creates: CREATE INDEX ... USING gin(payload)

modelBuilder.Entity<DataEntry>()
    .HasIndex(e => new { e.SourceId, e.EntryKey })
    .IsUnique();        // Creates: CREATE UNIQUE INDEX ... ON data_entries(source_id, entry_key)
```

### JSONB Column Mapping

```csharp
// Source: [VERIFIED: Npgsql EF Core provider — HasColumnType]
// Option A: Attribute
[Column(TypeName = "jsonb")]
public JsonDocument Payload { get; set; } = default!;

// Option B: Fluent API in OnModelCreating (recommended for consistency)
modelBuilder.Entity<DataEntry>()
    .Property(e => e.Payload)
    .HasColumnType("jsonb");
```

### UPSERT via ExecuteSqlRawAsync

```csharp
// Source: [VERIFIED: PostgreSQL docs INSERT ON CONFLICT syntax]
await db.Database.ExecuteSqlRawAsync("""
    INSERT INTO data_entries
        (id, source_id, job_id, category, entry_key, payload, crawled_at)
    VALUES
        (gen_random_uuid(), {0}::uuid, {1}::uuid, {2}, {3}, {4}::jsonb, NOW())
    ON CONFLICT (source_id, entry_key)
    DO UPDATE SET
        payload    = EXCLUDED.payload,
        job_id     = EXCLUDED.job_id,
        crawled_at = NOW()
    """,
    entry.SourceId, jobId, entry.Category, entry.EntryKey,
    JsonSerializer.Serialize(entry.Payload));
```

### EXPLAIN ANALYZE for GIN index verification (Success Criterion 5)

```sql
-- Run after migration + sample data inserted
EXPLAIN ANALYZE
SELECT * FROM data_entries
WHERE payload @> '{"is_active": true}';
-- Expected: "Bitmap Index Scan on idx_data_entries_payload"
```

### Node.js Redis staging before transaction

```typescript
// ORDERING: Redis write MUST happen before the pg transaction BEGIN
// so the key is always available when .NET reads it after COMMIT
await redis.set(`job:raw:${jobId}`, rawContent, 'EX', 300);

const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... INSERT crawl_jobs ...
  await client.query(`SELECT pg_notify('crawler_events', $1)`, [payload]);
  await client.query('COMMIT');
} catch {
  await client.query('ROLLBACK');
  throw;
} finally {
  client.release();
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `new NpgsqlConnection()` directly | `NpgsqlDataSource` as starting point | Npgsql 7.0 | Better pooling; for the listener we still use `new NpgsqlConnection()` because we intentionally want a dedicated non-pooled connection |
| `IKeyedServiceProvider` not registered in DI (preview limitation) | `IKeyedServiceProvider` registered by default in .NET 8 RTM | .NET 8 GA | Can inject directly in constructor; `[FromKeyedServices]` attribute also available |
| Npgsql major version independent of EF Core | Npgsql major version mirrors EF Core major version | Npgsql 5.0+ | Version 8 = EF Core 8; version 10 = EF Core 10; cannot mix |

**Deprecated/outdated:**
- `Database.EnsureCreated()`: Creates tables but does NOT run migrations. Never use this — always `dotnet ef database update`.
- `Notification` event only (without `WaitAsync` loop): The event fires asynchronously but you need `WaitAsync` to keep the connection alive and process notifications.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `IKeyedServiceProvider` is injectable via constructor in .NET 8 RTM (the preview limitation was resolved before GA) | Pattern 6 | If wrong, inject `IServiceProvider` and cast: `((IKeyedServiceProvider)sp).GetRequiredKeyedService<>()` |
| A2 | `EFCore.NamingConventions 8.0.3` is the latest 8.x version (observed on NuGet search results) | Standard Stack | Minor: could be a newer 8.x patch; check `dotnet add package EFCore.NamingConventions` for latest |
| A3 | `DATA_URL` env var format `Host=localhost;Port=5432;Database=webcrawler;Username=crawler;Password=changeme` is the Npgsql connection string format (not a PostgreSQL URI) | Pattern 3 | Npgsql also accepts PostgreSQL URI format `postgresql://user:pass@host/db`; either works |

---

## Open Questions

1. **Should `AppDbContext` be used from `CrawlerEventListener` or should parsers get their own scoped context?**
   - What we know: `CrawlerEventListener` is registered as a singleton (via `AddHostedService`). `AppDbContext` is registered as `AddDbContext` (scoped by default).
   - What's unclear: Injecting a scoped service into a singleton is the "captive dependency" anti-pattern and will throw at startup.
   - Recommendation: Use `IServiceScopeFactory` to create a new scope per notification, or register `AppDbContext` with `AddDbContextPool` which behaves differently. The simplest fix: inject `IServiceScopeFactory` into `CrawlerEventListener`, create a scope inside `HandleNotificationAsync`, and resolve `AppDbContext` from the scope. This is the standard pattern for using scoped services in singletons.

2. **Should `sources` table be seeded with initial data in the migration?**
   - What we know: Parsers are keyed to `parser_key` values like `"football"`, `"genshin"`, etc. The `sources` table must have rows with these keys for the system to function.
   - What's unclear: Whether seed data belongs in the EF Core migration or in a separate seeding step.
   - Recommendation: Add a data seeder class that runs at app startup (after `database update`) using `context.Database.EnsureExists()` pattern, seeding sources if the table is empty. This keeps migrations schema-only and avoids environment-specific data in migrations.

3. **`parser_key` column on `sources` table — not in SCHEMA.md**
   - What we know: CONTEXT.md specifics section says "Parser key convention: lowercase hyphenated source name stored in `sources.parser_key` column (new column to add to sources migration)". SCHEMA.md `sources` table does not have a `parser_key` column.
   - What's unclear: Whether the column should be TEXT NOT NULL with a unique constraint or allow null.
   - Recommendation: Add `parser_key TEXT NOT NULL` to the `Source` entity; the migration will include it. Add a `UNIQUE` index on `sources.parser_key` since each parser maps to exactly one source type.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `dotnet` SDK | EF Core migrations + API build | Yes | 10.0.104 | — |
| `dotnet-ef` global tool | `dotnet ef migrations add/update` | Yes | 8.0.11 | — |
| PostgreSQL (Docker) | Schema creation, LISTEN/NOTIFY | Yes (via docker-compose) | 16-alpine | Run `docker compose up postgres -d` |
| Redis (Docker) | Raw content staging | Yes (via docker-compose) | 7-alpine | Run `docker compose up redis -d` |
| `pg` npm package | Node.js crawl_jobs INSERT + pg_notify | **MISSING** | Not in apps/crawler/package.json | Add via `pnpm add pg@8.20.0` |
| `ioredis` npm package | Redis staging write (Node.js) | Yes | 5.10.1 | Already in connection.ts |

**Missing dependencies with no fallback:**
- `pg` npm package must be added to `apps/crawler` before any Node.js DB integration code is written.

**Missing dependencies with fallback:**
- None (all other dependencies are present or available via Docker Compose).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (Node.js) + manual integration verification (.NET — no xUnit yet in project) |
| Config file | `apps/crawler/vitest.config.ts` (if exists) or inline in package.json |
| Quick run command | `pnpm --filter @web-crawler/crawler test` |
| Full suite command | `pnpm --filter @web-crawler/crawler test` |

### Phase Success Criteria → Validation Map

| Criterion | Behavior | Validation Type | Command / Method |
|-----------|----------|-----------------|-----------------|
| SC-1 | `dotnet ef database update` creates all 5 tables with correct schema | Integration (manual + automated) | `docker compose exec postgres psql -U crawler -d webcrawler -c "\dt"` then `\d data_entries` — verify columns, indexes, constraints |
| SC-2 | Node.js NOTIFY triggers .NET log within 1 second | Integration (manual log inspection) | Start services, trigger a crawl job, observe .NET container logs for `"NOTIFY received on crawler_events"` timestamp delta vs Node.js log |
| SC-3 | Correct parser resolved by `parser_key` | Integration (log verification) | Observe .NET logs for `"Resolved parser: FootballParser"` (or similar) matching the source's parser_key |
| SC-4 | EPL fixtures produce `data_entries` row with valid JSONB + stable `entry_key` | Integration (DB query) | `SELECT entry_key, payload FROM data_entries WHERE category = 'football' LIMIT 5` — verify `entry_key` looks like `match_NNNNN` |
| SC-5 | GIN index used for JSONB filter query | DB plan inspection | `EXPLAIN ANALYZE SELECT * FROM data_entries WHERE payload @> '{"status":"finished"}'` — must show `Bitmap Index Scan on idx_data_entries_payload` |

### Wave 0 Gaps (test infrastructure needed before implementation)
- [ ] `apps/crawler/src/db/crawlJobsDb.test.ts` — unit tests for INSERT + pg_notify logic (requires `pg` package + postgres test DB or mock)
- [ ] `apps/crawler/src/db/crawlJobsDb.ts` — new file, doesn't exist yet
- [ ] Integration test harness for .NET side is out of scope for this phase (manual log verification per success criteria)

*(SC-2 through SC-5 are integration validations confirmed by direct observation / SQL queries, not automated unit tests)*

---

## Security Domain

> `security_enforcement` not explicitly set to false in config — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No user auth in this phase |
| V3 Session Management | No | No user sessions |
| V4 Access Control | No | Internal service-to-service only |
| V5 Input Validation | Yes (LOW risk) | Parser happy-path + `JsonDocument.Parse` safe parsing; no user input reaches parsers |
| V6 Cryptography | No | No crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed NOTIFY payload crashing listener | Tampering | `try/catch` around `JsonSerializer.Deserialize` in `HandleNotificationAsync`; log + skip |
| Redis key collision between job IDs | Tampering | UUIDs used as job IDs (from PostgreSQL `gen_random_uuid()`) — collision probability negligible |
| SQL injection in raw UPSERT | Tampering | `ExecuteSqlRawAsync` with positional `{0}` parameters uses parameterized queries internally — not string interpolation |
| Oversized NOTIFY payload (>8KB) | Denial of Service | D-02 ensures only `{job_id, source_id, parser_key}` in payload — well under 8KB limit |

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: nuget.org] — `Npgsql.EntityFrameworkCore.PostgreSQL 8.0.11`, `EFCore.NamingConventions 8.0.3`, `Microsoft.EntityFrameworkCore.Design 8.0.22`, `StackExchange.Redis 2.11.8`
- [VERIFIED: npm registry via `npm view`] — `pg 8.20.0`, `@types/pg 8.20.0`, `ioredis 5.10.1`
- [VERIFIED: local CLI] — `dotnet --version = 10.0.104`, `dotnet-ef = 8.0.11`
- [CITED: https://www.npgsql.org/doc/wait.html] — `WaitAsync`, `Notification` event API
- [CITED: https://www.npgsql.org/efcore/modeling/indexes.html] — `HasMethod("gin")` syntax
- [CITED: https://node-postgres.com/features/transactions] — `pool.connect()` + transaction pattern
- [CITED: https://andrewlock.net/exploring-the-dotnet-8-preview-keyed-services-dependency-injection-support/] — keyed service registration and `[FromKeyedServices]`

### Secondary (MEDIUM confidence)
- [CITED: https://www.bytefish.de/blog/postgres_listen_notify_dotnet.html] — `BackgroundService` + `WaitAsync` loop pattern
- [CITED: https://www.npgsql.org/doc/keepalive.html] — `Keepalive=30` connection string parameter for LISTEN connections
- [CITED: https://iifx.dev/en/articles/457546143/resolving-keyed-services-at-runtime-in-net-8] — `IKeyedServiceProvider` dynamic resolution in hosted services

### Tertiary (LOW confidence / ASSUMED)
- [ASSUMED] `IKeyedServiceProvider` constructor injection works in .NET 8 RTM (preview limitation confirmed resolved, but not verified against final RTM docs in this session) — see Assumptions Log A1

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions verified against NuGet and npm registries
- Architecture: HIGH — patterns drawn from official Npgsql, node-postgres, and .NET 8 docs
- Pitfalls: HIGH — version mismatch, LISTEN connection pooling, Redis race condition are documented issues from official sources
- Open questions: MEDIUM — captive dependency (scoped in singleton) is well-known EF Core pattern; seeds/parser_key column need design decision

**Research date:** 2026-04-10
**Valid until:** 2026-07-10 (stable ecosystem — Npgsql 8.x is LTS-aligned with .NET 8)
