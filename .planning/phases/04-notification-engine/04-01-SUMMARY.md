---
phase: 04-notification-engine
plan: 01
subsystem: api
tags: [notifications, diff-engine, tdd, testing]
dependency_graph:
  requires: []
  provides:
    - DiffResult record (Models/Notifications)
    - FieldChange record (Models/Notifications)
    - AlertMatch record (Models/Notifications)
    - DiffEngine.Compare static method (Services)
    - WebCrawlerApi.Tests xUnit project
  affects:
    - apps/api/Services/DiffEngine.cs
    - apps/api.Tests (new project)
tech_stack:
  added:
    - xunit 2.5.3 (test framework)
    - Moq 4.20.72 (mock library)
  patterns:
    - TDD red-green cycle for DiffEngine
    - Static pure function for JsonDocument comparison
    - JsonElement.Clone() to prevent ObjectDisposedException
key_files:
  created:
    - apps/api/Models/Notifications/DiffResult.cs
    - apps/api/Models/Notifications/AlertMatch.cs
    - apps/api/Services/DiffEngine.cs
    - apps/api.Tests/WebCrawlerApi.Tests.csproj
    - apps/api.Tests/Services/DiffEngineTests.cs
  modified:
    - web-crawler.sln (added test project)
    - apps/api.Tests/WebCrawlerApi.Tests.csproj (pinned EFCore 8.0.22)
decisions:
  - Pinned Microsoft.EntityFrameworkCore 8.0.22 in test project to resolve
    version conflict between Npgsql.EFCore 8.0.11 and EFCore.Design 8.0.22
  - Used static class for DiffEngine (no DI needed; pure function with no side effects)
  - Used JsonElement.ToString() for value equality (raw JSON string comparison, sufficient for flat payloads)
metrics:
  duration_minutes: 15
  completed_date: "2026-04-15"
  tasks_completed: 2
  files_created: 5
  files_modified: 2
---

# Phase 04 Plan 01: Notification Models and DiffEngine Summary

**One-liner:** Static DiffEngine using JsonElement.Clone() compares JSONB payloads field-by-field; xUnit test project bootstrapped with 5 passing TDD tests.

## What Was Built

### Notification Models

Two record types in `apps/api/Models/Notifications/`:

- **DiffResult** — holds `IsNewEntry` (bool) and `ChangedFields` (IReadOnlyDictionary<string, FieldChange>). The diff result flowing from DiffEngine to AlertRuleEvaluator.
- **FieldChange** — holds `OldValue` (JsonElement?, null for new/added fields) and `NewValue` (JsonElement). Carries the before/after state of a changed field.
- **AlertMatch** — pairs an `AlertRule` that fired with a `DiffResult`, the new payload, and the condition type string. Used by NotificationDispatcher to build messages and route channels.

### DiffEngine Service

`apps/api/Services/DiffEngine.cs` — static class with a single public method:

```csharp
public static DiffResult Compare(JsonDocument? oldDoc, JsonDocument newDoc)
```

Behavior:
- `oldDoc == null` → `IsNewEntry = true`, all fields from `newDoc` added to `ChangedFields` with `OldValue = null`
- Identical payloads → `IsNewEntry = false`, empty `ChangedFields`
- Changed field → entry in `ChangedFields` with both `OldValue` and `NewValue` populated
- Field added to new payload → entry with `OldValue = null`
- Uses `JsonElement.Clone()` on all stored values to detach from source document's pooled buffer (prevents `ObjectDisposedException` when caller disposes the source document)

### xUnit Test Project

`apps/api.Tests/` — new xUnit project with:
- Reference to `apps/api/WebCrawlerApi.csproj`
- Moq 4.20.72 for future mock-based tests
- 5 unit tests for DiffEngine in `Services/DiffEngineTests.cs`

## Test Results

```
Passed!  - Failed: 0, Passed: 5, Skipped: 0, Total: 5
```

Test coverage:
1. `Compare_NullOldPayload_ReturnsIsNewEntryTrue` — new entry path
2. `Compare_IdenticalPayloads_ReturnsEmptyChanges` — no-op path
3. `Compare_FieldChanged_ReturnsChangedField` — numeric value change with correct old/new
4. `Compare_NewFieldAdded_ReturnsFieldWithNullOld` — field addition detection
5. `Compare_BooleanFieldChanged_Detected` — boolean field change

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] EF Core version conflict prevented test build**

- **Found during:** Task 2 GREEN phase
- **Issue:** `dotnet test` failed with `MSB3492` cache error caused by EF Core version conflict. `Npgsql.EntityFrameworkCore.PostgreSQL 8.0.11` pulls in EFCore `8.0.11` while `EFCore.Design 8.0.22` (in the main project) pulls in `8.0.22`. MSBuild's incremental build cache got corrupted between the two conflicting versions.
- **Fix:** Added explicit `<PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.22" />` to the test project to pin the higher version, reducing warnings from ~20 to 1 and unblocking the build.
- **Files modified:** `apps/api.Tests/WebCrawlerApi.Tests.csproj`
- **Commits:** a4da1a0

## Commits

| Hash | Message |
|------|---------|
| 40bc87c | feat(04-01): add notification models and bootstrap xUnit test project |
| a4da1a0 | feat(04-01): implement DiffEngine with TDD unit tests (5 passing) |

## Self-Check: PASSED

- [x] `apps/api/Models/Notifications/DiffResult.cs` exists and contains `public record DiffResult(`
- [x] `apps/api/Models/Notifications/AlertMatch.cs` exists and contains `public record AlertMatch(`
- [x] `apps/api/Services/DiffEngine.cs` exists and contains `public static DiffResult Compare`
- [x] `apps/api.Tests/WebCrawlerApi.Tests.csproj` exists and contains `xunit`
- [x] `web-crawler.sln` contains `WebCrawlerApi.Tests`
- [x] `dotnet build apps/api.Tests` exits 0 (0 errors, 1 warning)
- [x] `dotnet test apps/api.Tests --filter DiffEngineTests` exits 0 with 5 passed
- [x] Commits 40bc87c and a4da1a0 verified in git log
