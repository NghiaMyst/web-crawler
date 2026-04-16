---
phase: 04-notification-engine
plan: 05
subsystem: notification-pipeline
tags: [notification, dispatcher, dedup, retry, di, crawler-event-listener]
dependency_graph:
  requires: ["04-01", "04-02", "04-03", "04-04"]
  provides: ["end-to-end-notification-pipeline"]
  affects: ["apps/api/Services/CrawlerEventListener.cs", "apps/api/Program.cs"]
tech_stack:
  added: ["Microsoft.EntityFrameworkCore.InMemory 8.0.11 (tests)", "Microsoft.EntityFrameworkCore.Relational 8.0.22 (tests)"]
  patterns: ["SELECT-before-UPSERT for diff capture", "inline notification dispatch in parse loop", "IEnumerable<INotificationSender> for multi-channel dispatch", "dedup guard via notification_logs query", "linear backoff retry (1s, 2s)"]
key_files:
  created:
    - apps/api/Services/NotificationDispatcher.cs
    - apps/api.Tests/Services/NotificationDispatcherTests.cs
  modified:
    - apps/api/Services/CrawlerEventListener.cs
    - apps/api/Program.cs
    - docker-compose.yml
    - apps/api/Data/AppDbContext.cs
    - apps/api.Tests/WebCrawlerApi.Tests.csproj
decisions:
  - "JsonDocument value converter (string) added to AppDbContext for InMemory EF test provider compatibility"
  - "EF Core InMemory 8.0.11 + Relational 8.0.22 pinned in test project to resolve transitive version conflict from Npgsql 8.0.11"
  - "dispatchPayload cloned from newPayloadJson string to avoid ObjectDisposedException after using block disposes original"
  - "EvaluateAndNotifyAsync catches all exceptions to guarantee notification failure never breaks the parse loop"
metrics:
  duration: "~25 minutes"
  completed_date: "2026-04-16"
  tasks_completed: 2
  files_changed: 7
---

# Phase 04 Plan 05: Notification Pipeline Integration Summary

**One-liner:** End-to-end notification pipeline wired: CrawlerEventListener performs SELECT-before-UPSERT diff capture, calls NotificationDispatcher which evaluates rules, builds messages, sends via Telegram/Discord with dedup guard and 2-retry backoff, and logs every outcome to notification_logs.

## What Was Built

### Task 1: NotificationDispatcher (TDD)

`apps/api/Services/NotificationDispatcher.cs` orchestrates the full notification pipeline:

1. Calls `AlertRuleEvaluator.EvaluateForSourceAsync` to get matching rules
2. Calls `MessageBuilder.BuildMessage` — skips if result is null (empty template guard)
3. Dedup guard: queries `notification_logs` for same `(alert_rule_id, data_entry_id, status=sent)` within 5-minute window — skips if found
4. Resolves sender by `ChannelName` from `IEnumerable<INotificationSender>`
5. Retry loop: up to `MaxRetries=2` additional attempts (total 3) with linear backoff (1s, 2s)
6. Writes one `NotificationLog` row per rule match after retries exhausted or success

**6 TDD tests in `NotificationDispatcherTests.cs`:**
- `DispatchAsync_NewItemRule_TelegramSent_LogsSuccess`
- `DispatchAsync_FieldChangedRule_DiscordSent_LogsSuccess`
- `DispatchAsync_DeliveryFails_LogsFailed`
- `DispatchAsync_DedupGuard_SkipsDuplicate`
- `DispatchAsync_RetryOnFailure_UpTo2Retries`
- `DispatchAsync_EmptyMessage_SkipsSend`

All 6 pass. Total test suite: 35 pass, 0 fail.

### Task 2: CrawlerEventListener + DI + docker-compose

**CrawlerEventListener.cs** modified:
- SELECT-before-UPSERT using `AsNoTracking()` captures existing payload before overwrite
- `oldPayload` cloned via `JsonDocument.Parse(GetRawText())` to avoid ObjectDisposedException
- `EvaluateAndNotifyAsync` called after every `UpsertEntryAsync` in the parse loop
- All exceptions caught in `EvaluateAndNotifyAsync` — notification failure never breaks parser
- `oldPayload?.Dispose()` in finally block

**Program.cs** DI additions:
- `AddHttpClient<TelegramSender>().AddStandardResilienceHandler()`
- `AddHttpClient<DiscordSender>().AddStandardResilienceHandler()`
- `AddScoped<INotificationSender, TelegramSender>` + `AddScoped<INotificationSender, DiscordSender>` (factory delegates for multi-registration)
- `AddScoped<AlertRuleEvaluator>` + `AddScoped<NotificationDispatcher>`

**docker-compose.yml** env vars added to `api` service:
- `TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}`
- `TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID:-}`
- `DISCORD_WEBHOOK_URL: ${DISCORD_WEBHOOK_URL:-}`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] EF Core InMemory does not support JsonDocument property type**
- **Found during:** Task 1 (RED -> GREEN transition)
- **Issue:** `AppDbContext` uses `JsonDocument` for `AlertRule.Condition` and `DataEntry.Payload`, which the InMemory provider cannot map (no JSONB equivalent)
- **Fix:** Added `ValueConverter<JsonDocument, string>` in `AppDbContext.OnModelCreating` using a static helper method `ParseJsonDocument` (required because `JsonDocument.Parse` has optional args incompatible with expression trees). Applied to both `AlertRule.Condition` and `DataEntry.Payload`. The `HasColumnType("jsonb")` is preserved for the real Postgres provider.
- **Files modified:** `apps/api/Data/AppDbContext.cs`
- **Commit:** 66f230b

**2. [Rule 3 - Blocking] EF Core version conflict in test project**
- **Found during:** Task 1 (adding InMemory package)
- **Issue:** `Npgsql.EntityFrameworkCore.PostgreSQL 8.0.11` brings `EFCore.Relational 8.0.11`; api project's `Microsoft.EntityFrameworkCore.Design 8.0.22` brings `EFCore 8.0.22`; test project got MSB3277 version conflict treated as build error
- **Fix:** Added explicit `Microsoft.EntityFrameworkCore.Relational 8.0.22` and `InMemory 8.0.22` references to test csproj to force resolution to 8.0.22 across all assemblies. Also added `Microsoft.EntityFrameworkCore 8.0.22` direct reference (was already present from earlier plans).
- **Files modified:** `apps/api.Tests/WebCrawlerApi.Tests.csproj`
- **Commit:** 66f230b

**3. [Rule 3 - Blocking] Transient MSBuild cache file lock on Windows**
- **Found during:** Task 1 test runs
- **Issue:** `MSB3492: Could not read existing file obj\Debug\net8.0\*.cache` — Windows file locking prevents incremental build cache reads on rapid successive `dotnet test` calls
- **Fix:** Delete `obj/` folder before full rebuild when this occurs. Tests confirmed passing with `dotnet build` then `dotnet test --no-build`, and clean `dotnet test` after obj clean. Not a code issue.

## Known Stubs

None — all pipeline components are wired end-to-end.

## Threat Surface Scan

No new network endpoints or auth paths introduced. The `EvaluateAndNotifyAsync` path makes outbound HTTP calls via existing `TelegramSender`/`DiscordSender` — already covered by T-04-06 and T-04-09 in prior plans. Env var handling uses `${VAR:-}` syntax per T-04-12 mitigation. Retry loop capped at MaxRetries=2 per T-04-13 mitigation.

## Self-Check

- [x] `apps/api/Services/NotificationDispatcher.cs` exists
- [x] `apps/api.Tests/Services/NotificationDispatcherTests.cs` exists
- [x] `apps/api/Services/CrawlerEventListener.cs` contains `EvaluateAndNotifyAsync`
- [x] `apps/api/Program.cs` contains `AddHttpClient<TelegramSender>()`
- [x] `docker-compose.yml` contains `TELEGRAM_BOT_TOKEN`
- [x] 35 tests pass, 0 fail
- [x] `dotnet build apps/api/WebCrawlerApi.csproj` exits 0

## Self-Check: PASSED
