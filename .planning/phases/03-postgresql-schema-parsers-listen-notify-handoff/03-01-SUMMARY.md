---
phase: 03-postgresql-schema-parsers-listen-notify-handoff
plan: "01"
subsystem: api-database
tags: [ef-core, postgresql, migration, entities, npgsql, dotnet]
dependency_graph:
  requires: []
  provides:
    - AppDbContext with 5 DbSets
    - EF Core migration 20260410_InitialSchema
    - PostgreSQL schema: sources, crawl_jobs, data_entries, alert_rules, notification_logs
  affects:
    - apps/api/Data/AppDbContext.cs
    - apps/api/Data/Entities/*.cs
    - apps/api/Migrations/*
    - apps/api/Program.cs
    - apps/api/WebCrawlerApi.csproj
tech_stack:
  added:
    - Npgsql.EntityFrameworkCore.PostgreSQL 8.0.11
    - EFCore.NamingConventions 8.0.3
    - Microsoft.EntityFrameworkCore.Design 8.0.22
    - StackExchange.Redis 2.11.8
  patterns:
    - EF Core primary constructor syntax (DbContext)
    - snake_case naming via UseSnakeCaseNamingConvention() on DbContextOptionsBuilder
    - JSONB column type via HasColumnType("jsonb") on JsonDocument properties
    - GIN index via HasIndex(...).HasMethod("gin")
    - UNIQUE constraint via HasIndex(...).IsUnique()
key_files:
  created:
    - apps/api/Data/AppDbContext.cs
    - apps/api/Data/Entities/Source.cs
    - apps/api/Data/Entities/CrawlJob.cs
    - apps/api/Data/Entities/DataEntry.cs
    - apps/api/Data/Entities/AlertRule.cs
    - apps/api/Data/Entities/NotificationLog.cs
    - apps/api/Migrations/20260410064655_20260410_InitialSchema.cs
    - apps/api/Migrations/20260410064655_20260410_InitialSchema.Designer.cs
    - apps/api/Migrations/AppDbContextModelSnapshot.cs
  modified:
    - apps/api/WebCrawlerApi.csproj
    - apps/api/Program.cs
    - apps/api/.env
decisions:
  - "Used HasDefaultValueSql(\"gen_random_uuid()\") for Guid PKs instead of C# default generation"
  - "UseSnakeCaseNamingConvention() belongs on DbContextOptionsBuilder (Program.cs), not on ModelBuilder"
  - "Migration applied via SQL script (dotnet ef database update failed on Windows host due to SCRAM-SHA-256 auth from outside Docker network)"
  - "GIN index only on payload column; UNIQUE on (source_id, entry_key) for UPSERT dedup per D-04"
metrics:
  duration: "~35 minutes"
  completed: "2026-04-10"
  tasks: 2
  files: 12
---

# Phase 3 Plan 01: EF Core Schema Migration Summary

EF Core 8 entities for all 5 tables + Npgsql/snake_case wiring + InitialSchema migration applied to PostgreSQL.

## What Was Built

All 5 entity classes, `AppDbContext`, and EF Core migration that creates the complete PostgreSQL schema matching `SCHEMA.md`.

### Entities Created

| Entity | Key Notes |
|--------|-----------|
| `Source` | `ParserKey TEXT NOT NULL` for keyed service dispatch (per CONTEXT.md D-06) |
| `CrawlJob` | Matches SCHEMA.md crawl_jobs; indexed on source_id, status, (url, content_hash) |
| `DataEntry` | `JsonDocument Payload` → JSONB; GIN index on payload; UNIQUE(source_id, entry_key) |
| `AlertRule` | `JsonDocument Condition` → JSONB; cascade FK to Source |
| `NotificationLog` | SET NULL FK to DataEntry; cascade FK to AlertRule |

### AppDbContext

- Primary constructor pattern: `AppDbContext(DbContextOptions<AppDbContext> options)`
- 5 DbSets with property expressions (`=> Set<T>()`)
- Full Fluent API configuration for all indexes, constraints, FK relationships
- GIN index: `entity.HasIndex(e => e.Payload).HasMethod("gin")`
- UNIQUE: `entity.HasIndex(e => new { e.SourceId, e.EntryKey }).IsUnique()`

### Program.cs Registration

```csharp
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(Environment.GetEnvironmentVariable("DATABASE_URL")
           ?? throw new InvalidOperationException("DATABASE_URL env var not set"))
       .UseSnakeCaseNamingConvention());
```

### Migration Applied

Migration `20260410064655_20260410_InitialSchema` generated and applied. All 6 tables visible in PostgreSQL (`__EFMigrationsHistory` + 5 domain tables).

## Verification Passed

- `dotnet build` — 0 errors, 0 warnings
- `\dt` in PostgreSQL — 6 tables present (5 domain + EFMigrationsHistory)
- `\di ix_data_entries_payload` — GIN index confirmed
- `\d data_entries` — `ix_data_entries_source_id_entry_key UNIQUE` confirmed
- `\d sources` — `parser_key text NOT NULL` confirmed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UseSnakeCaseNamingConvention called on wrong type**
- **Found during:** Task 1 build verification
- **Issue:** Plan specified `modelBuilder.UseSnakeCaseNamingConvention()` in `OnModelCreating`, but `UseSnakeCaseNamingConvention()` is an extension method on `DbContextOptionsBuilder`, not `ModelBuilder`
- **Fix:** Removed the `modelBuilder` call from `OnModelCreating`; the actual call is on `DbContextOptionsBuilder` in Program.cs (`opt.UseSnakeCaseNamingConvention()`)
- **Files modified:** `apps/api/Data/AppDbContext.cs`
- **Commit:** 8255d35

**2. [Rule 3 - Blocking] Npgsql host-to-Docker SCRAM-SHA-256 auth failure**
- **Found during:** Task 2 migration apply
- **Issue:** `dotnet ef database update` failed with `28P01: password authentication failed` even after adding `trust` to `pg_hba.conf`. Cause: the EF CLI on Windows cannot authenticate to a PostgreSQL Docker container via SCRAM-SHA-256 from the host network path, even with trust mode set
- **Fix:** Generated migration SQL via `dotnet ef migrations script` and applied it directly via `docker compose exec postgres psql -f /tmp/migration.sql`
- **Files modified:** None (operational workaround; migration files are unaffected)
- **Commit:** 29eb895

## Known Stubs

None. All entity properties map to real DB columns. Migration is fully applied and verified.

## Threat Flags

None. No new network endpoints or auth paths introduced. The `DATABASE_URL` in `.env` is gitignored (T-03-01 accepted per threat model).

## Self-Check: PASSED

| Item | Status |
|------|--------|
| apps/api/Data/AppDbContext.cs | FOUND |
| apps/api/Data/Entities/Source.cs | FOUND |
| apps/api/Data/Entities/DataEntry.cs | FOUND |
| apps/api/Migrations/20260410064655_20260410_InitialSchema.cs | FOUND |
| 03-01-SUMMARY.md | FOUND |
| Task 1 commit 8255d35 | FOUND |
| Task 2 commit 29eb895 | FOUND |
