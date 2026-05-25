---
plan: 11-03
status: complete
completed_at: 2026-05-25T07:30:00Z
---

# Plan 11-03 Summary: Search API Endpoint

## What Was Done

- Created `apps/api.Tests/Endpoints/EntriesSearchTests.cs` with:
  - 2 `[Trait("Category", "Unit")]` guard tests (null q and whitespace q → no FTS filter applied)
  - 4 `[Trait("Category", "Integration")]` stubs (skip-marked, for future Postgres test container wiring)
- Extended `GetEntries` in `apps/api/Endpoints/EntriesEndpoints.cs`:
  - Added `string? q = null` parameter before `cursor`
  - Added FTS filter: `e.SearchVector != null && e.SearchVector.Matches(EF.Functions.PlainToTsQuery("english", q))`
  - IsNullOrWhiteSpace guard skips filter when q is absent/empty
- Fixed `apps/api/Data/AppDbContext.cs` InMemory provider compatibility:
  - Used `options.Extensions.Any(e => e.GetType().Name.Contains("InMemory"))` to detect InMemory provider safely in `OnModelCreating` (avoids circular init from `Database.ProviderName`)
  - When InMemory: `entity.Ignore(e => e.SearchVector)` + no `text[]` column type annotation
  - When Postgres: `entity.Property(e => e.SearchVector).HasColumnType("tsvector")`

## Verification Results

```
Passed! - Failed: 0, Passed: 8, Skipped: 4, Total: 12
(6 ParserDepth + 2 EntriesSearch unit guards pass; 4 Integration stubs skipped)
```

All non-Integration tests: 94 passing, 2 pre-existing failures in NotificationDispatcherTests / MessageBuilderTests (not caused by Phase 11).

## Deviation: AppDbContext InMemory Fix

The committed Plan 11-02 AppDbContext had `HasColumnType("tsvector")` unconditionally, which caused 44 test failures because `NpgsqlTsVector` is unsupported by the InMemory provider. The fix uses the constructor `options` parameter to detect the provider — this is the EF Core-safe pattern that avoids the circular initialization that results from accessing `Database.ProviderName` inside `OnModelCreating`.

## Files Modified

- `apps/api/Data/AppDbContext.cs` — InMemory provider guard for SearchVector + JsonPaths
- `apps/api/Endpoints/EntriesEndpoints.cs` — added q param + PlainToTsQuery FTS filter
- `apps/api.Tests/Endpoints/EntriesSearchTests.cs` (created)

## Commit

`0df2d01` feat(phase-11): search API endpoint + InMemory provider compatibility (11-03)
