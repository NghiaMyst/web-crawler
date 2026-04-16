---
phase: 04-notification-engine
plan: 03
subsystem: api
tags: [telegram, http-client, notifications, tdd, resilience]

# Dependency graph
requires:
  - phase: 04-01
    provides: test project (apps/api.Tests) and INotificationSender stub
provides:
  - INotificationSender interface (SendAsync + ChannelName)
  - TelegramSender: posts to api.telegram.org/bot{token}/sendMessage via PostAsJsonAsync
  - 5 unit tests with MockHttpMessageHandler covering success, URL, body, error, and missing-token cases
affects: [04-05-di-registration, 04-06-notification-dispatch]

# Tech tracking
tech-stack:
  added: [Microsoft.Extensions.Http.Resilience 10.5.0]
  patterns: [typed-httpclient-primary-constructor, never-log-secret-token]

key-files:
  created:
    - apps/api/Services/INotificationSender.cs
    - apps/api/Services/TelegramSender.cs
    - apps/api.Tests/Services/TelegramSenderTests.cs
  modified:
    - apps/api/WebCrawlerApi.csproj

key-decisions:
  - "Used direct HttpClient (no Telegram.Bot NuGet) per RESEARCH.md recommendation — lighter dependency, easier mocking"
  - "TELEGRAM_BOT_TOKEN never passed as structured log parameter (T-04-06); only chatId is logged"
  - "TelegramSender reads env vars at call-time (not constructor-time) to support test env var manipulation"

patterns-established:
  - "Sender pattern: read credentials at call time, log warning + return false if missing, never throw"
  - "Test pattern: IDisposable class sets and clears env vars in constructor/Dispose; MockHttpMessageHandler from Helpers namespace"

requirements-completed: [NOTIF-05]

# Metrics
duration: 15min
completed: 2026-04-15
---

# Phase 04 Plan 03: INotificationSender + TelegramSender Summary

**Telegram Bot API sender via direct PostAsJsonAsync to api.telegram.org/bot{token}/sendMessage with token-safe logging and 5 passing unit tests**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-15T10:30:00Z
- **Completed:** 2026-04-15T10:45:00Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 4

## Accomplishments
- `INotificationSender` interface defined with `SendAsync(string, CancellationToken)` and `ChannelName` property
- `TelegramSender` posts correct JSON body `{chat_id, text}` to `https://api.telegram.org/bot{token}/sendMessage`
- Security: TELEGRAM_BOT_TOKEN value is never logged — only bool "configured" state inferred from warning message
- `Microsoft.Extensions.Http.Resilience` 10.5.0 added for `AddStandardResilienceHandler` support in Plan 05
- All 5 unit tests pass using existing `MockHttpMessageHandler` helper

## Task Commits

1. **Task 1: INotificationSender interface + TelegramSender (TDD)** - `0c795e8` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/api/Services/INotificationSender.cs` - Common interface for delivery channels (Telegram, Discord)
- `apps/api/Services/TelegramSender.cs` - Telegram Bot API sender with credential safety and error handling
- `apps/api.Tests/Services/TelegramSenderTests.cs` - 5 unit tests: success, URL, body, HTTP error, missing token
- `apps/api/WebCrawlerApi.csproj` - Added Microsoft.Extensions.Http.Resilience 10.5.0

## Decisions Made
- Used direct HttpClient (no Telegram.Bot NuGet) per RESEARCH.md: lighter, mockable, no hidden abstractions
- TELEGRAM_BOT_TOKEN never logged (T-04-06 mitigation); chatId logged instead
- TelegramSender reads env vars at call-time so test setUp/tearDown via `Environment.SetEnvironmentVariable` works reliably
- Existing `MockHttpMessageHandler` in `apps/api.Tests/Helpers/` was reused; no new helper class needed

## Deviations from Plan

None - plan executed exactly as written. The `MockHttpMessageHandler` already existed in the project's Helpers namespace (created by a prior plan), so no inline class was needed in the test file. Used the shared helper instead, which is the better pattern.

## Issues Encountered

A stale build cache caused an initial `dotnet test` run to show old errors from `AlertRuleEvaluatorTests.cs`. A clean `dotnet build` followed by `dotnet test --no-build` resolved this. No code changes were needed.

## User Setup Required

External services require manual configuration before TelegramSender can deliver notifications:

| Env Var | Source |
|---------|--------|
| `TELEGRAM_BOT_TOKEN` | BotFather in Telegram -> /newbot -> copy token |
| `TELEGRAM_CHAT_ID` | Send /start to your bot, then GET `https://api.telegram.org/bot{TOKEN}/getUpdates` -> result.message.chat.id |

## Next Phase Readiness
- `INotificationSender` interface is ready for `DiscordSender` (Plan 04) to implement
- `TelegramSender` is ready for DI registration in `Program.cs` (Plan 05)
- `Microsoft.Extensions.Http.Resilience` package is already added for `AddStandardResilienceHandler` wiring in Plan 05

---
*Phase: 04-notification-engine*
*Completed: 2026-04-15*
