---
phase: 04-notification-engine
plan: "04"
subsystem: notification-sender
tags: [discord, webhook, http-client, tdd, security]
dependency_graph:
  requires: ["04-01"]
  provides: ["DiscordSender", "INotificationSender"]
  affects: ["04-05"]
tech_stack:
  added: []
  patterns: ["Primary-constructor DI", "HttpClient factory pattern", "MockHttpMessageHandler test helper"]
key_files:
  created:
    - apps/api/Services/INotificationSender.cs
    - apps/api/Services/DiscordSender.cs
    - apps/api.Tests/Services/DiscordSenderTests.cs
    - apps/api.Tests/Helpers/MockHttpMessageHandler.cs
  modified: []
decisions:
  - "Discord webhook uses content field (not text) for plain text messages"
  - "DISCORD_WEBHOOK_URL never logged — only presence/absence logged (threat T-04-09)"
  - "Any 2xx response treated as success; Discord returns 204 No Content on success"
metrics:
  duration_seconds: 420
  completed_date: "2026-04-15"
  tasks_completed: 1
  files_created: 4
  files_modified: 0
---

# Phase 04 Plan 04: DiscordSender Summary

**One-liner:** Discord Webhook sender using HttpClient PostAsJsonAsync with `content` JSON field, returns true on 2xx, never logs webhook URL token.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | DiscordSenderTests - failing tests | db334e7 | INotificationSender.cs, DiscordSenderTests.cs, MockHttpMessageHandler.cs |
| 1 (GREEN) | DiscordSender implementation | f92ee1b | DiscordSender.cs |

## What Was Built

**INotificationSender** (`apps/api/Services/INotificationSender.cs`)
- Shared interface with `SendAsync(string message, CancellationToken ct): Task<bool>` and `string ChannelName` property
- Created here since Plan 03 (same wave) had not yet run

**DiscordSender** (`apps/api/Services/DiscordSender.cs`)
- Primary-constructor DI: `HttpClient httpClient, ILogger<DiscordSender> logger`
- Posts `{ "content": message }` JSON to `DISCORD_WEBHOOK_URL` env var
- Returns `true` on any 2xx response (Discord returns 204 No Content on success)
- Returns `false` on HTTP errors, 429 rate limit, or missing webhook URL — never throws
- Never logs the webhook URL value (only logs presence/absence)

**MockHttpMessageHandler** (`apps/api.Tests/Helpers/MockHttpMessageHandler.cs`)
- Shared test helper for HttpClient mocking
- Captures `LastRequest` and `LastRequestBody` for body content assertions

**DiscordSenderTests** (`apps/api.Tests/Services/DiscordSenderTests.cs`)
- 5 test cases, all passing:
  1. `SendAsync_Success_ReturnsTrue` — 204 response returns true
  2. `SendAsync_PostsCorrectBody` — body contains `"content"` field with message
  3. `SendAsync_HttpError_ReturnsFalse` — 500 response returns false without throwing
  4. `SendAsync_MissingWebhookUrl_ReturnsFalse` — no HTTP call made when env var absent
  5. `SendAsync_429RateLimit_ReturnsFalse` — rate limit returns false with warning log

## Verification

```
dotnet test apps/api.Tests --filter "FullyQualifiedName~DiscordSenderTests"
Test Run Successful.
Total tests: 5
     Passed: 5
```

## Security

Threat T-04-09 (Information Disclosure - webhook URL logging) fully mitigated:
- `DiscordSender.cs` logs only `"Discord webhook not configured (DISCORD_WEBHOOK_URL missing)"` and `"Discord webhook returned {StatusCode}"` — no URL value appears in any log statement.

## Deviations from Plan

**None** - Plan executed exactly as written.

Note: The early build failure (`MSBUILD error: Building target CoreCompile completely`) was a transient MSBuild cache issue resolved by `dotnet clean`. No code changes required.

## Threat Flags

None. All surfaces in this plan were covered by the plan's own threat model (T-04-09 mitigated, T-04-10 and T-04-11 accepted).

## Self-Check: PASSED

- `apps/api/Services/INotificationSender.cs` — exists
- `apps/api/Services/DiscordSender.cs` — exists, contains `class DiscordSender`, `INotificationSender`, `PostAsJsonAsync(webhookUrl, body, ct)`, `new { content = message }`
- `apps/api.Tests/Services/DiscordSenderTests.cs` — exists, contains all 5 test methods
- `apps/api.Tests/Helpers/MockHttpMessageHandler.cs` — exists
- Commits db334e7 and f92ee1b — verified in git log
- 5 tests pass
