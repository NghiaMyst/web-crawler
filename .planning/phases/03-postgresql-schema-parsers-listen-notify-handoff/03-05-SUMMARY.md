---
phase: 03-postgresql-schema-parsers-listen-notify-handoff
plan: "05"
subsystem: api-parsers
tags: [dotnet, parsers, lol, anilist, mangadex, jsonb, strategy-pattern]
dependency_graph:
  requires:
    - 03-03 (IContentParser interface, ParsedEntry record, parser stubs)
  provides:
    - LolParser: champion tier data extractor (entry_key champion_{name}_{role})
    - AniListParser: anime airing schedule extractor (entry_key anime_{id})
    - MangaDexParser: manga chapter extractor (entry_key chapter_{id})
  affects:
    - apps/api/Parsers/LolParser.cs
    - apps/api/Parsers/AniListParser.cs
    - apps/api/Parsers/MangaDexParser.cs
tech_stack:
  added: []
  patterns:
    - System.Text.Json DOM API (JsonDocument.Parse) for external JSON — no dynamic compilation (T-03-13 mitigation)
    - Try/catch + LogWarning + return empty list on parse failure (D-05 compliance, T-03-14 mitigation)
    - Per-entry skip with LogWarning on missing required fields (D-05 compliance)
    - Multi-path JSON navigation for resilience against u.gg __NEXT_DATA__ structure variations
key_files:
  created: []
  modified:
    - apps/api/Parsers/LolParser.cs
    - apps/api/Parsers/AniListParser.cs
    - apps/api/Parsers/MangaDexParser.cs
decisions:
  - "LolParser navigates multiple possible __NEXT_DATA__ paths (data, tierList, championData) because u.gg Next.js structure varies by page version"
  - "AniListParser reads status and averageScore defensively — Phase 2 AniListWorker query does not include those fields, so they will be null until worker is updated in a future phase"
  - "MangaDexParser reads manga title from relationships defensively — Phase 2 MangaDexWorker does not pass includes[]=manga so manga_title will be null; tracked as known stub"
  - "All 3 parsers use separate JsonException + Exception catch blocks for precise error classification"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-10"
  tasks: 2
  files: 3
---

# Phase 3 Plan 05: LolParser, AniListParser, MangaDexParser Summary

Replaced 3 parser stubs with real implementations: LolParser (u.gg __NEXT_DATA__ champion tier data), AniListParser (AniList GraphQL airing schedule), MangaDexParser (MangaDex REST API chapter feed). All 5 parsers are now implemented, completing the Phase 3 parser set.

## What Was Built

### Task 1: LolParser

Replaces the stub in `apps/api/Parsers/LolParser.cs` with a real implementation that:

- Navigates u.gg `__NEXT_DATA__` JSON structure via multiple possible paths (`props.pageProps.data`, `props.pageProps.tierList`, `props.pageProps.championData`, root array, `data` array)
- Extracts champion name from `championName`, `champion`, or `name` fields
- Extracts role from `role` or `position` fields (defaults to `"unknown"`)
- Produces `entry_key = champion_{name}_{role}` (lowercase)
- JSONB payload: `{ champion, role, tier, win_rate, pick_rate, patch }`
- Category: `"game"`
- Skips entries with missing champion name + LogWarning (D-05)
- Try/catch wraps entire parse; returns empty list on failure

### Task 2: AniListParser and MangaDexParser

**AniListParser** (`apps/api/Parsers/AniListParser.cs`):

- Navigates AniList GraphQL shape: `data.Page.media[]`
- Skips entries missing `id` or `title` with LogWarning (D-05)
- Title: prefers English, falls back to romaji
- `nextAiringEpisode` decoded: episode number + Unix timestamp → `yyyy-MM-dd` air date
- `status` and `averageScore` read defensively (Phase 2 worker query omits them — will be null)
- `averageScore` converted from 0–100 to 0–10 scale (SCHEMA.md alignment)
- Entry key: `anime_{id}`; Category: `"anime"`

**MangaDexParser** (`apps/api/Parsers/MangaDexParser.cs`):

- Navigates MangaDex REST shape: `data[]` top-level array
- Skips entries missing or empty `id` with LogWarning (D-05)
- Extracts from `attributes`: `chapter`, `title`, `volume`, `translatedLanguage`, `publishAt`
- Reads manga title from `relationships[type=manga].attributes.title.en` defensively (Phase 2 worker does not include `includes[]=manga` — `manga_title` will be null)
- Entry key: `chapter_{id}`; Category: `"manga"`

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written. The implementations match the prescribed structures while adapting to observed worker behavior.

### Observations (Non-breaking)

**1. AniListWorker Phase 2 query omits `status` and `averageScore`**
- The plan's expected payload shape includes `status` and `mal_score`
- AniListWorker.ts GraphQL query only requests: `id`, `title { romaji english }`, `nextAiringEpisode { airingAt episode }`
- Fix: parser reads these fields defensively — they serialize as `null` until the worker query is expanded in a future phase
- No deviation from plan required; behavior is correct per D-05 (skip missing fields, not crash)

**2. MangaDexWorker Phase 2 does not request manga relationship data**
- MangaDexWorker fetches `https://api.mangadex.org/chapter?order[publishAt]=desc&limit=10` with no `includes[]=manga`
- Plan expected `relationships[].attributes.title` to be present
- Fix: parser reads relationships defensively — `manga_title` will be null until worker is updated
- Tracked as Known Stub below

## Known Stubs

| File | Field | Reason | Resolution |
|------|-------|--------|------------|
| `apps/api/Parsers/AniListParser.cs` | `status`, `mal_score` | AniListWorker GraphQL query (Phase 2) does not request these fields | Future phase expands AniListWorker query to include `status` and `averageScore` |
| `apps/api/Parsers/MangaDexParser.cs` | `manga_title` | MangaDexWorker does not pass `includes[]=manga` parameter | Future phase adds `includes[]=manga` to MangaDexWorker URL |

These stubs do NOT prevent the plan's goal — parsers produce valid `ParsedEntry` objects with correct `entry_key` values. The null fields are cosmetic gaps in payload richness, not correctness failures.

## Threat Flags

None. All three parsers use System.Text.Json DOM API only — no `eval`, no dynamic compilation (T-03-13 mitigated). All three wrap parse failures in try/catch + LogWarning + return empty list (T-03-14 mitigated). No new network endpoints introduced.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| apps/api/Parsers/LolParser.cs contains `class LolParser` and `: IContentParser` | FOUND |
| apps/api/Parsers/LolParser.cs contains `champion_` | FOUND |
| apps/api/Parsers/LolParser.cs contains `"game"` | FOUND |
| apps/api/Parsers/LolParser.cs contains `LogWarning` | FOUND |
| apps/api/Parsers/AniListParser.cs contains `class AniListParser` and `: IContentParser` | FOUND |
| apps/api/Parsers/AniListParser.cs contains `anime_` | FOUND |
| apps/api/Parsers/AniListParser.cs contains `"anime"` | FOUND |
| apps/api/Parsers/AniListParser.cs contains `LogWarning` | FOUND |
| apps/api/Parsers/MangaDexParser.cs contains `class MangaDexParser` and `: IContentParser` | FOUND |
| apps/api/Parsers/MangaDexParser.cs contains `chapter_` | FOUND |
| apps/api/Parsers/MangaDexParser.cs contains `"manga"` | FOUND |
| apps/api/Parsers/MangaDexParser.cs contains `LogWarning` | FOUND |
| No `throw` in parse logic body (all 3 parsers) | CONFIRMED — only catch blocks rethrow-free |
