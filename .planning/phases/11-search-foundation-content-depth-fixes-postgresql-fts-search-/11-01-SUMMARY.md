---
plan: 11-01
phase: 11
status: complete
completed_at: 2026-05-25T00:00:00Z
duration_minutes: 15
tasks_completed: 3
files_created: 1
files_modified: 2
requirements: [SC-1]
key_decisions:
  - "MangaDexWorker: single URL constant change adds includes[]=manga; existing parser code was already correct"
  - "AniListWorker: added status + averageScore to GraphQL selection set; updated AniListMedia interface"
  - "ParserDepthTests: synthetic raw JSON used in tests verifies parser correctness independent of live API"
  - "Pre-existing FootballDataWorker.ts TS2307 error is out of scope; deferred"
---

# Phase 11 Plan 01: Content Depth Fixes Summary

## One-liner

Parser content depth fixes: MangaDexWorker requests `includes[]=manga` (manga_title now populates) and AniListWorker GraphQL adds `status` + `averageScore` fields; 6 xUnit Unit tests validate all parsers produce non-empty key fields.

## What Was Done

- Created `apps/api.Tests/Parsers/ParserDepthTests.cs` with 6 [Trait("Category", "Unit")] tests — one per parser asserting non-empty key text fields
- Fixed `MangaDexWorker.ts` URL constant: added `&includes[]=manga` so the MangaDex API returns manga relationship inside each chapter; existing `MangaDexParser.cs` relationship extraction code (lines 84-106) now populates `manga_title`
- Fixed `AniListWorker.ts` GraphQL query: added `status` and `averageScore` to media selection set; updated `AniListMedia` interface with `status: string | null` and `averageScore: number | null`; existing `AniListParser.cs` defensive reads (lines 119-124) now receive actual values

## Verification Results

```
Passed!  - Failed: 0, Passed: 6, Skipped: 0, Total: 6, Duration: 70 ms
```

Tests: FootballParser_Match_HasHomeAwayTeam, FootballParser_Standings_HasTeam, GenshinParser_HasEventName, LolParser_HasChampion, AniListParser_HasTitleAndStatus, MangaDexParser_HasMangaTitle — all green.

MangaDex URL check: `includes[]=manga` present on exactly one line.
AniList status occurrences: 4 (outer filter, field selection, interface, status: 'done' in crawl job).
TypeScript compilation: pre-existing unrelated error in FootballDataWorker.ts (TS2307 @web-crawler/shared-types) — not caused by this plan, deferred.
.NET build: succeeded (dotnet test compiles both api and api.Tests projects).

## Files Modified

- `apps/crawler/src/workers/MangaDexWorker.ts` — URL constant: added `&includes[]=manga`
- `apps/crawler/src/workers/AniListWorker.ts` — ANILIST_QUERY: added `status` and `averageScore` fields; AniListMedia interface: added `status: string | null` and `averageScore: number | null`
- `apps/api.Tests/Parsers/ParserDepthTests.cs` — created, 6 Unit tests

## Commits

- `a42c730` — test(11-01): add ParserDepthTests with 6 Unit tests per parser
- `14faf3a` — feat(11-01): add includes[]=manga to MangaDexWorker API URL
- `1bde794` — feat(11-01): add status + averageScore to AniListWorker GraphQL query

## Deviations from Plan

### Deferred (Out of Scope)

**Pre-existing TypeScript error in FootballDataWorker.ts**
- Found during: Task 3 TypeScript verification
- Error: `TS2307: Cannot find module '@web-crawler/shared-types'`
- Status: Pre-existing before this plan (verified via git stash). Not caused by our changes. Logged to deferred-items.
- Our AniListWorker.ts changes introduce no new TypeScript errors.

## Known Stubs

None — all three changes wire real behavior: parser code was already correct for MangaDex and AniList; the worker fixes make live data flow through the existing extraction logic.

## Self-Check: PASSED

- `apps/api.Tests/Parsers/ParserDepthTests.cs` exists and contains 6 [Trait("Category", "Unit")] tests
- Commits a42c730, 14faf3a, 1bde794 exist in git log
- All 6 tests pass: `dotnet test --filter "FullyQualifiedName~ParserDepthTests"` → Passed 6
