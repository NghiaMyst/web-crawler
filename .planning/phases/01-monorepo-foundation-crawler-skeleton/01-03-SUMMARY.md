---
phase: "01"
plan: "03"
subsystem: logging
tags: [winston, serilog, structured-logging, observability]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [structured-logging-crawler, structured-logging-api]
  affects: [all future crawler tasks, all future api tasks]
tech_stack:
  added:
    - winston@3.19.0 (Node.js structured logging)
    - Serilog.AspNetCore@8.x (.NET structured logging host integration)
    - Serilog.Sinks.Console@6.x (console sink for Serilog)
    - Serilog.Settings.Configuration@8.x (appsettings.json-driven config)
  patterns:
    - Winston JSON-in-production / colored-pretty-print-in-development
    - Serilog bootstrap logger pattern for pre-host startup errors
    - Serilog ReadFrom.Configuration for environment-driven log levels
    - Context fields { url, sourceId, jobId } convention for crawler logs
key_files:
  created:
    - apps/crawler/src/logger.ts
    - apps/api/appsettings.json
    - apps/api/appsettings.Development.json
  modified:
    - apps/crawler/src/index.ts
    - apps/crawler/package.json
    - apps/api/Program.cs
    - apps/api/WebCrawlerApi.csproj
    - pnpm-lock.yaml
decisions:
  - Winston format switches on NODE_ENV so same binary works in dev and prod without code changes
  - Serilog bootstrap logger catches startup failures before DI container is available
  - appsettings.Development.json overrides to plain console (no JSON) for readable local dev output
  - Business code uses ILogger<T> from Microsoft.Extensions.Logging, not Serilog directly, for DI compatibility
metrics:
  duration: "108 seconds"
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_changed: 7
---

# Phase 01 Plan 03: Structured Logging Setup Summary

**One-liner:** Winston (JSON/pretty-print) for the Node.js crawler and Serilog bootstrap pattern with JSON console for the .NET API.

## What Was Built

### apps/crawler — Winston logger

`apps/crawler/src/logger.ts` exports a singleton `logger` that:
- Uses `winston.format.json()` + timestamp in production (`NODE_ENV=production`)
- Uses colorized `printf` format in development for human readability
- Defaults to `LOG_LEVEL` env var or `info`
- Sets `defaultMeta: { service: 'crawler' }` on every log entry
- Documents the `{ url, sourceId, jobId }` context field convention and the error serialization pattern

`apps/crawler/src/index.ts` updated to import the logger and emit the first structured log line instead of `console.log`.

### apps/api — Serilog

`WebCrawlerApi.csproj` adds three Serilog packages:
- `Serilog.AspNetCore@8.*`
- `Serilog.Sinks.Console@6.*`
- `Serilog.Settings.Configuration@8.*`

`Program.cs` replaced with:
- Bootstrap logger created before host build (catches startup errors)
- `builder.Host.UseSerilog(...)` wires `ReadFrom.Configuration` + `ReadFrom.Services` + `Enrich.FromLogContext`
- `app.UseSerilogRequestLogging()` logs every HTTP request with timing
- Try/catch/finally with `Log.Fatal` and `Log.CloseAndFlush` for clean shutdown

`appsettings.json` — production: JSON formatter (`Serilog.Formatting.Json.JsonFormatter`), minimum level Information, Microsoft/System namespaces suppressed to Warning.

`appsettings.Development.json` — development: plain console sink, minimum level Debug, Microsoft promoted to Information.

## Build Verification

**Crawler (`pnpm build`):** Success — 0 TypeScript errors, dist files emitted for `index.ts` and `logger.ts`.

**.NET API (`dotnet build --configuration Release`):** Success — 0 warnings, 0 errors.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| a3a8e5c | feat(01-03): add winston logger for crawler |
| 719fa56 | feat(01-03): bootstrap .NET API with Serilog JSON logging |

## Self-Check: PASSED

Files verified present:
- apps/crawler/src/logger.ts — FOUND
- apps/crawler/src/index.ts — FOUND (modified)
- apps/api/Program.cs — FOUND (modified)
- apps/api/appsettings.json — FOUND
- apps/api/appsettings.Development.json — FOUND

Commits verified:
- a3a8e5c — in git log
- 719fa56 — in git log
