---
phase: 08-next-js-dashboard-alerts-charts
plan: "04"
subsystem: api
tags: [dotnet, minimal-api, ef-core, groupby, aggregation, stats]
dependency_graph:
  requires:
    - 08-02 (Program.cs /api/stats group already registered)
  provides:
    - GET /api/stats/volume?groupBy=day&range={7d|30d|90d} endpoint
    - VolumeDataPoint TypeScript type (added in 08-02)
    - fetchVolumeStats() helper (added in 08-02)
key_files:
  created:
    - apps/api/Endpoints/StatsEndpoints.cs
metrics:
  completed_date: "2026-05-14"
  tasks_completed: 1
  files_changed: 1
---

# Phase 08 Plan 04: Chart Data Endpoint Summary

## One-liner

GET /api/stats/volume EF Core GroupBy aggregation endpoint returning per-source per-day entry counts for 7d/30d/90d ranges.

## What Was Built

Created `StatsEndpoints.cs` with a `GET /api/stats/volume` handler. Uses EF Core `GroupBy` on `DataEntries`, grouping by `SourceId + DisplayName + CrawledAt.Date`. Supports `range` query param (`7d`, `30d`, `90d`, default 7d). Returns ordered list of `{ sourceId, sourceName, date, count }` anonymous objects. The `/api/stats` group registration was added to Program.cs alongside the notifications group in plan 08-02.

## Verification Results

- `dotnet build apps/api/WebCrawlerApi.csproj` — Build succeeded, 0 warnings, 0 errors

## Self-Check: PASSED
