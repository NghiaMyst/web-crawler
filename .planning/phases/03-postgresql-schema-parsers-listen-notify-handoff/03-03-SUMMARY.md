---
phase: 03-postgresql-schema-parsers-listen-notify-handoff
plan: "03"
subsystem: api-parser-listener
tags: [dotnet, npgsql, listen-notify, keyed-services, background-service, redis, upsert]
dependency_graph:
  requires:
    - 03-01 (AppDbContext, EF Core entities)
  provides:
    - IContentParser interface contract
    - ParsedEntry output record
    - CrawlerEventListener BackgroundService (LISTEN/NOTIFY receiver + parser dispatch + UPSERT)
    - 5 keyed parser stubs (Football, Genshin, LoL, AniList, MangaDex)
    - Program.cs DI wiring for Redis, parsers, and hosted service
  affects:
    - apps/api/Parsers/IContentParser.cs
    - apps/api/Parsers/ParsedEntry.cs
    - apps/api/Services/CrawlerEventListener.cs
    - apps/api/Parsers/FootballParser.cs
    - apps/api/Parsers/GenshinParser.cs
    - apps/api/Parsers/LolParser.cs
    - apps/api/Parsers/AniListParser.cs
    - apps/api/Parsers/MangaDexParser.cs
    - apps/api/Program.cs
tech_stack:
  added: []
  patterns:
    - BackgroundService with dedicated NpgsqlConnection + Keepalive=30 for LISTEN/NOTIFY
    - IServiceScopeFactory scope-per-notification to avoid captive dependency (singleton hosting scoped DbContext)
    - .NET 8 keyed services AddKeyedScoped<IContentParser, TParser>("key") for config-driven parser dispatch
    - GetRequiredKeyedService<IContentParser>(parserKey) inside created scope
    - ExecuteSqlRawAsync ON CONFLICT (source_id, entry_key) for idempotent UPSERT
    - Parameterized SQL placeholders {0}..{N} via EF Core — no string concatenation (T-03-07 mitigation)
key_files:
  created:
    - apps/api/Parsers/IContentParser.cs
    - apps/api/Parsers/ParsedEntry.cs
    - apps/api/Services/CrawlerEventListener.cs
    - apps/api/Parsers/FootballParser.cs
    - apps/api/Parsers/GenshinParser.cs
    - apps/api/Parsers/LolParser.cs
    - apps/api/Parsers/AniListParser.cs
    - apps/api/Parsers/MangaDexParser.cs
  modified:
    - apps/api/Program.cs
decisions:
  - "5 parser stubs created in this plan to satisfy build; plans 03-04 and 03-05 replace stubs with real implementations"
  - "CrawlerEventListener uses IServiceScopeFactory (not direct AppDbContext injection) to avoid singleton-holds-scoped captive dependency"
  - "Dedicated NpgsqlConnection with Keepalive=30 for LISTEN — not EF Core's pool (LISTEN is session-scoped)"
  - "NOTIFY payload deserializes to CrawlerNotification record with job_id, source_id, parser_key"
  - "UPSERT uses raw ExecuteSqlRawAsync with parameterized placeholders per T-03-07 threat mitigation"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-10"
  tasks: 2
  files: 9
---

# Phase 3 Plan 03: IContentParser Interface, CrawlerEventListener, and DI Wiring Summary

IContentParser interface + ParsedEntry record + CrawlerEventListener BackgroundService with dedicated LISTEN/NOTIFY connection, keyed parser dispatch, Redis raw content reads, and UPSERT to data_entries — all wired in Program.cs with 5 keyed scoped parser registrations.

## What Was Built

### Task 1: IContentParser Interface + ParsedEntry Record

| File | Purpose |
|------|---------|
| `apps/api/Parsers/IContentParser.cs` | Parser contract: `ParseAsync(rawContent, sourceId, ct)` returning `IReadOnlyList<ParsedEntry>` |
| `apps/api/Parsers/ParsedEntry.cs` | Output record: `SourceId`, `EntryKey`, `Category`, `Payload` |

### Task 2: CrawlerEventListener + DI Wiring

| File | Purpose |
|------|---------|
| `apps/api/Services/CrawlerEventListener.cs` | BackgroundService: LISTEN on `crawler_events`, resolve parser via keyed services, read Redis, UPSERT data_entries |
| `apps/api/Parsers/FootballParser.cs` | Stub — replaced in 03-04 |
| `apps/api/Parsers/GenshinParser.cs` | Stub — replaced in 03-05 |
| `apps/api/Parsers/LolParser.cs` | Stub — replaced in 03-05 |
| `apps/api/Parsers/AniListParser.cs` | Stub — replaced in 03-05 |
| `apps/api/Parsers/MangaDexParser.cs` | Stub — replaced in 03-05 |
| `apps/api/Program.cs` | Added Redis singleton, 5 keyed parser registrations, AddHostedService<CrawlerEventListener> |

### CrawlerEventListener Architecture

The key architectural properties of the listener:

1. **Dedicated connection with keepalive** — `connStr += ";Keepalive=30"` prevents idle TCP drops. NOT from EF Core's connection pool (LISTEN is session-scoped — pooled connections cannot hold LISTEN state across checkouts).

2. **IServiceScopeFactory pattern** — `CrawlerEventListener` is a singleton-lifetime `BackgroundService`. It cannot directly inject `AppDbContext` (scoped lifetime) without creating a captive dependency. Per-notification scopes are created via `scopeFactory.CreateScope()`.

3. **Keyed service dispatch** — `scope.ServiceProvider.GetRequiredKeyedService<IContentParser>(msg.ParserKey)` resolves the correct parser without a switch statement. Satisfies PARSE-02.

4. **Data flow per notification:**
   - Deserialize NOTIFY payload → `CrawlerNotification { JobId, SourceId, ParserKey }`
   - Create scope
   - Resolve `IContentParser` by `ParserKey`
   - Read `job:raw:{JobId}` from Redis
   - Call `parser.ParseAsync(raw, sourceId)`
   - UPSERT each `ParsedEntry` to `data_entries` via `ON CONFLICT (source_id, entry_key)`

### Program.cs Additions

```csharp
// Redis connection for raw content reads (D-03)
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect(redisEndpoint));

// 5 keyed parser registrations (PARSE-02)
builder.Services.AddKeyedScoped<IContentParser, FootballParser>("football");
builder.Services.AddKeyedScoped<IContentParser, GenshinParser>("genshin");
builder.Services.AddKeyedScoped<IContentParser, LolParser>("lol");
builder.Services.AddKeyedScoped<IContentParser, AniListParser>("anilist");
builder.Services.AddKeyedScoped<IContentParser, MangaDexParser>("mangadex");

// LISTEN/NOTIFY background service
builder.Services.AddHostedService<CrawlerEventListener>();
```

## Verification Passed

- `dotnet build` — 0 errors, 0 warnings
- `CrawlerEventListener` extends `BackgroundService` (confirmed)
- Constructor takes `IServiceScopeFactory scopeFactory` (not `AppDbContext`)
- `Keepalive=30` appended to connection string (confirmed)
- `LISTEN {Channel}` command executed at startup (confirmed)
- `conn.WaitAsync(stoppingToken)` loop (confirmed)
- `scopeFactory.CreateScope()` per notification (confirmed)
- `GetRequiredKeyedService<IContentParser>` dispatch (confirmed)
- `ON CONFLICT (source_id, entry_key)` in UPSERT SQL (confirmed)
- `StringGetAsync($"job:raw:{msg.JobId}")` Redis read (confirmed)
- All 5 `AddKeyedScoped` registrations in Program.cs (confirmed)
- `AddHostedService<CrawlerEventListener>` in Program.cs (confirmed)
- `AddSingleton<IConnectionMultiplexer>` in Program.cs (confirmed)

## Deviations from Plan

None — plan executed exactly as written. Parser stubs were explicitly prescribed in the plan's BUILD NOTE to unblock compilation for plans 03-04 and 03-05.

## Known Stubs

| File | Stub Description | Resolution |
|------|-----------------|------------|
| `apps/api/Parsers/FootballParser.cs` | Returns empty list, logs WARN | Plan 03-04 replaces with real implementation |
| `apps/api/Parsers/GenshinParser.cs` | Returns empty list, logs WARN | Plan 03-05 replaces with real implementation |
| `apps/api/Parsers/LolParser.cs` | Returns empty list, logs WARN | Plan 03-05 replaces with real implementation |
| `apps/api/Parsers/AniListParser.cs` | Returns empty list, logs WARN | Plan 03-05 replaces with real implementation |
| `apps/api/Parsers/MangaDexParser.cs` | Returns empty list, logs WARN | Plan 03-05 replaces with real implementation |

These stubs are intentional compilation scaffolding — `CrawlerEventListener` is fully functional; it will receive NOTIFY, resolve the parser via keyed services, read Redis, and attempt to parse. The stubs return empty lists until replaced. The plan's goal (LISTEN/NOTIFY handoff architecture) is achieved; the stub data-source gap is tracked and resolved in 03-04/03-05.

## Threat Flags

None. No new network endpoints introduced. UPSERT uses EF Core parameterized placeholders per T-03-07 mitigation. LISTEN channel is internal-only (T-03-08 accepted).

## Self-Check: PASSED

| Item | Status |
|------|--------|
| apps/api/Parsers/IContentParser.cs | FOUND |
| apps/api/Parsers/ParsedEntry.cs | FOUND |
| apps/api/Services/CrawlerEventListener.cs | FOUND |
| apps/api/Parsers/FootballParser.cs | FOUND |
| apps/api/Parsers/GenshinParser.cs | FOUND |
| apps/api/Parsers/LolParser.cs | FOUND |
| apps/api/Parsers/AniListParser.cs | FOUND |
| apps/api/Parsers/MangaDexParser.cs | FOUND |
| apps/api/Program.cs updated | FOUND |
| Task 1 commit d9627a3 | FOUND |
| Task 2 commit f30c51b | FOUND |
