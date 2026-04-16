---
phase: 4
slug: notification-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | xUnit (.NET) |
| **Config file** | apps/api.Tests/WebCrawlerApi.Tests.csproj (Wave 0 installs) |
| **Quick run command** | `dotnet test apps/api.Tests --no-build -q` |
| **Full suite command** | `dotnet test apps/api.Tests` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `dotnet test apps/api.Tests --no-build -q`
- **After every plan wave:** Run `dotnet test apps/api.Tests`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | NOTIF-01 | — | N/A | unit | `dotnet test apps/api.Tests --no-build -q` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | NOTIF-01 | — | Diff detects new entry_key correctly | unit | `dotnet test apps/api.Tests --no-build -q` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | NOTIF-01 | — | Diff detects field_changed for JSONB fields | unit | `dotnet test apps/api.Tests --no-build -q` | ❌ W0 | ⬜ pending |
| 4-01-04 | 01 | 1 | NOTIF-01 | — | Diff detects threshold crossing | unit | `dotnet test apps/api.Tests --no-build -q` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | NOTIF-02 | — | Rule evaluator returns correct alert type | unit | `dotnet test apps/api.Tests --no-build -q` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 1 | NOTIF-02 | — | Multiple rules evaluated per entry | unit | `dotnet test apps/api.Tests --no-build -q` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 1 | NOTIF-03 | — | Telegram message sent with correct text | unit | `dotnet test apps/api.Tests --no-build -q` | ❌ W0 | ⬜ pending |
| 4-03-02 | 03 | 1 | NOTIF-03 | — | Telegram HTTP failure returns error result | unit | `dotnet test apps/api.Tests --no-build -q` | ❌ W0 | ⬜ pending |
| 4-04-01 | 04 | 1 | NOTIF-04 | — | Discord webhook POST sends correct embed | unit | `dotnet test apps/api.Tests --no-build -q` | ❌ W0 | ⬜ pending |
| 4-05-01 | 05 | 1 | NOTIF-05 | — | Every delivery attempt inserts notification_logs row | unit | `dotnet test apps/api.Tests --no-build -q` | ❌ W0 | ⬜ pending |
| 4-05-02 | 05 | 1 | NOTIF-06 | — | Retry on failure (up to 2x) produces correct log entries | unit | `dotnet test apps/api.Tests --no-build -q` | ❌ W0 | ⬜ pending |
| 4-05-03 | 05 | 1 | NOTIF-07 | — | Dedup guard prevents duplicate notifications | unit | `dotnet test apps/api.Tests --no-build -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api.Tests/WebCrawlerApi.Tests.csproj` — create xUnit + Moq test project
- [ ] `apps/api.Tests/DiffEngineTests.cs` — stubs for NOTIF-01
- [ ] `apps/api.Tests/AlertRuleEvaluatorTests.cs` — stubs for NOTIF-02
- [ ] `apps/api.Tests/TelegramDeliveryTests.cs` — stubs for NOTIF-03
- [ ] `apps/api.Tests/DiscordDeliveryTests.cs` — stubs for NOTIF-04
- [ ] `apps/api.Tests/NotificationLogTests.cs` — stubs for NOTIF-05, NOTIF-06, NOTIF-07

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Telegram message received within 10 seconds | NOTIF-03 | Requires live Telegram bot token and chat ID | Trigger a new_item alert, check Telegram app |
| Discord webhook delivers embed | NOTIF-04 | Requires live Discord webhook URL | Trigger an alert, check Discord channel |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
