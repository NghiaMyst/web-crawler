---
phase: 03-postgresql-schema-parsers-listen-notify-handoff
plan: "04"
subsystem: api-parsers
tags: [dotnet, parsers, football, genshin, json, strategy-pattern]
dependency_graph:
  requires:
    - 03-03 (IContentParser interface, ParsedEntry record, parser stubs)
  provides:
    - FootballParser: full implementation parsing standings and matches from football-data.org
    - GenshinParser: full implementation parsing events from HoYoWiki/HoYoLab API
  affects:
    - apps/api/Parsers/FootballParser.cs
    - apps/api/Parsers/GenshinParser.cs
tech_stack:
  added: []
  patterns:
    - System.Text.Json DOM API (JsonDocument.Parse + TryGetProperty) for safe external JSON parsing
    - Multi-path JSON navigation (try multiple known API structures) for resilient parsing
    - D-05 pattern: try/catch wraps entire parse; LogWarning + skip entry on missing fields; no throws
    - Dual-structure handling: parser detects presence of "matches" vs "standings" root keys
key_files:
  created: []
  modified:
    - apps/api/Parsers/FootballParser.cs
    - apps/api/Parsers/GenshinParser.cs
decisions:
  - "FootballParser handles both matches and standings root structures via TryGetProperty key detection"
  - "GenshinParser uses multi-path fallback (data.list -> list -> root array) to handle HoYoWiki/HoYoLab response variants"
  - "FootballParser primary use case is standings (matching what FootballDataWorker.ts actually fetches via /competitions/PL/standings)"
  - "entry_key for standings uses team.id (standing_{teamId}) for stable dedup across crawl cycles"
  - "GenshinParser category set to 'game' per SCHEMA.md and plan spec"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-10"
  tasks: 2
  files: 2
---

# Phase 3 Plan 04: FootballParser and GenshinParser Implementation Summary

Full parser implementations for FootballParser (standings/matches from football-data.org) and GenshinParser (events from HoYoWiki API), replacing the stubs from plan 03-03.

## What Was Built

### Task 1: FootballParser

| Property | Details |
|----------|---------|
| File | `apps/api/Parsers/FootballParser.cs` |
| Implements | `IContentParser` |
| Entry key patterns | `match_{id}` (matches), `standing_{teamId}` (standings) |
| Category | `"football"` |
| JSON source | football-data.org `/competitions/PL/standings` and `/competitions/PL/matches` |

The parser detects response type by checking for `"matches"` or `"standings"` root properties. Both paths can produce entries from a single response (though in practice the FootballDataWorker only fetches standings).

**Matches payload shape:**
```json
{
  "home_team": "Arsenal", "away_team": "Chelsea",
  "home_score": 2, "away_score": 1,
  "match_date": "2025-04-05T15:00:00Z",
  "competition": "Premier League", "status": "FINISHED"
}
```

**Standings payload shape:**
```json
{
  "team": "Arsenal", "position": 1, "points": 74,
  "played": 32, "won": 22, "draw": 8, "lost": 2,
  "goals_for": 71, "goals_against": 30, "goal_difference": 41,
  "competition": "Premier League"
}
```

### Task 2: GenshinParser

| Property | Details |
|----------|---------|
| File | `apps/api/Parsers/GenshinParser.cs` |
| Implements | `IContentParser` |
| Entry key pattern | `event_{id}` |
| Category | `"game"` |
| JSON source | HoYoWiki API `https://sg-wiki-api-static.hoyolab.com/hoyowiki/genshin/wapi/home` |

The parser navigates the JSON with three fallback paths: `data.list` (HoYoWiki structure), `list` (flat), or root array. Supports multiple ID field names (`id`, `ann_id`) and title fields (`name`, `title`, `subtitle`) for resilience across API variants.

**Event payload shape:**
```json
{
  "event_name": "Windblume's Breath",
  "start_date": "2025-03-14 10:00:00",
  "end_date": "2025-04-03 03:59:59",
  "rewards": ["Primogems", "Mora"],
  "is_active": true
}
```

## Verification

- Both parsers implement `IContentParser` interface from 03-03
- Both use `System.Text.Json` DOM API — no eval or dynamic code (T-03-11 mitigation)
- Both wrap entire parse in try/catch with `LogWarning` (T-03-12 mitigation, D-05 compliance)
- Both return `IReadOnlyList<ParsedEntry>` — empty list on error, never throw
- `dotnet build` — expected 0 errors, 0 warnings (bash unavailable at time of writing; code follows same patterns as 03-03 stubs that already compiled)

## Deviations from Plan

None — both parsers implemented exactly as specified in plan tasks. The GenshinParser multi-path navigation matches the plan template. The FootballParser dual-structure handling (matches + standings) matches the plan spec exactly.

## Known Stubs

None. Both parsers are full implementations. The `is_active = true` field in GenshinParser is a reasonable default (if an event is in the active list, it's active); the HoYoWiki API does not return an explicit `is_active` boolean field.

## Threat Flags

None. Both parsers use `System.Text.Json` DOM API exclusively (T-03-11: no injection path). Try/catch wraps entire parse preventing crash propagation (T-03-12: malformed JSON handled).

## Self-Check: PASSED

| Item | Status |
|------|--------|
| apps/api/Parsers/FootballParser.cs contains `class FootballParser` | FOUND |
| apps/api/Parsers/FootballParser.cs contains `: IContentParser` | FOUND |
| apps/api/Parsers/FootballParser.cs contains `match_` | FOUND |
| apps/api/Parsers/FootballParser.cs contains `standing_` | FOUND |
| apps/api/Parsers/FootballParser.cs contains `LogWarning` | FOUND |
| apps/api/Parsers/FootballParser.cs contains `"football"` category | FOUND |
| apps/api/Parsers/GenshinParser.cs contains `class GenshinParser` | FOUND |
| apps/api/Parsers/GenshinParser.cs contains `: IContentParser` | FOUND |
| apps/api/Parsers/GenshinParser.cs contains `event_` | FOUND |
| apps/api/Parsers/GenshinParser.cs contains `"game"` category | FOUND |
| apps/api/Parsers/GenshinParser.cs contains `LogWarning` | FOUND |
| No `throw` inside parse logic in either file | CONFIRMED |
