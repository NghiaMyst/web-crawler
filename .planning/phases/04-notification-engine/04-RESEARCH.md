# Phase 4: Notification Engine - Research

**Researched:** 2026-04-15
**Domain:** .NET 8 notification pipeline — diff engine, alert evaluation, Telegram/Discord delivery, notification logging
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Dispatch Architecture):** Inline in `CrawlerEventListener`. After `UpsertEntryAsync` completes, call `EvaluateAndNotifyAsync()` within the same NOTIFY handler. No Redis queue, no separate `NotificationWorker` IHostedService.
  - Flow: `HandleNotificationAsync` → `UpsertEntryAsync` → `EvaluateAndNotifyAsync` → `DiffEngine.Compare` → `AlertRuleEvaluator.Match` → `NotificationSender.Send`

- **D-02 (Diff Snapshot Approach):** SELECT before UPSERT. Before calling `UpsertEntryAsync`, load the current `data_entries` row for `(source_id, entry_key)` via EF Core `FirstOrDefaultAsync`. Pass old payload to diff engine, then proceed with upsert.
  - If no existing row: old payload is `null` → only `new_item` rules fire
  - If row exists: compare old vs new payload for `field_changed` and `threshold` conditions

- **D-03 (Message Format):** Template + auto old→new. `message_tpl` supports `{field_name}` placeholders substituted from the new payload. Additionally:
  - `field_changed`: auto-append `{field}: {old_value} → {new_value}` after template text
  - `threshold`: auto-append `Current value: {value}` after template text
  - `new_item`: template substitution only, no auto-append
  - Implementation: simple `string.Replace` per `{token}`, no templating engine

- **D-04 (Credential Configuration):** Global env vars only.
  - `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — all telegram rules route to one chat
  - `DISCORD_WEBHOOK_URL` — all discord rules route to one webhook
  - `AlertRule.Channel` = `"telegram"` or `"discord"` selects which sender

### Claude's Discretion

- .NET HTTP client implementation for Telegram Bot API (direct HttpClient vs Telegram.Bot NuGet)
- .NET HTTP client for Discord Webhook (direct HttpClient — Discord uses plain HTTP POST)
- Retry strategy for delivery failures (up to 2x retry — use Polly or simple loop)
- Dedup guard implementation (check notification_logs for recent `(alert_rule_id, data_entry_id)` before sending)
- DiffEngine class structure and System.Text.Json comparison approach

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTIF-01 | System evaluates alert rules against new/changed entries after each parse | D-01 inline dispatch; `AlertRuleEvaluator` service pattern |
| NOTIF-02 | Supports `new_item` condition (entry_key not previously seen) | D-02 null old-payload guard; EF Core `FirstOrDefaultAsync` |
| NOTIF-03 | Supports `field_changed` condition (specific JSONB field differs from last snapshot) | `JsonElement.GetProperty` iteration; `JsonNode.DeepEquals` in .NET 8 |
| NOTIF-04 | Supports `threshold` condition (numeric JSONB field crosses configured value) | `JsonElement.GetDouble()` for numeric extraction; condition JSONB schema |
| NOTIF-05 | Delivers notifications via Telegram Bot API | Direct HttpClient to `api.telegram.org`; `sendMessage` endpoint |
| NOTIF-06 | Delivers notifications via Discord Webhook | Direct HttpClient `PostAsJsonAsync` to webhook URL |
| NOTIF-07 | Notification history stored in `notification_logs` table | `NotificationLog` entity already exists; EF Core insert pattern |
</phase_requirements>

---

## Summary

Phase 4 builds a notification pipeline inside the existing .NET 8 `CrawlerEventListener` background service. The architecture is intentionally simple: a single `EvaluateAndNotifyAsync` call follows each `UpsertEntryAsync`, no queues involved.

The diff engine reads the previous `DataEntry.Payload` (JsonDocument) before the upsert overwrites it, compares it against the new payload using `System.Text.Json` property iteration, and produces a structured result. The `AlertRuleEvaluator` matches that result against active `AlertRule` rows (filtered by `source_id`). Matching rules are handed off to channel-specific senders (Telegram, Discord) that call external HTTP APIs. Every attempt is written to `notification_logs`.

All required database tables (`alert_rules`, `notification_logs`, `data_entries`) and their EF Core entity mappings already exist from Phase 3 — no new migrations are needed.

**Primary recommendation:** Use direct `HttpClient` (via `IHttpClientFactory`) for both Telegram and Discord. Skip the `Telegram.Bot` NuGet wrapper; the Bot API is a plain REST endpoint and direct HTTP keeps the dependency surface minimal. Use a simple retry loop (max 2 retries) or `Microsoft.Extensions.Http.Resilience` for delivery resilience.

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| EF Core (Npgsql) | 8.0.11 | Query `alert_rules`, insert `notification_logs` | Already registered; `FirstOrDefaultAsync` for SELECT-before-upsert |
| System.Text.Json | Built-in (.NET 8) | JSONB payload comparison and field extraction | No extra dependency; `JsonDocument`/`JsonElement` API |
| Microsoft.Extensions.Logging | Built-in | `ILogger<T>` structured logging | Project standard — every service uses this |
| IHttpClientFactory | Built-in (ASP.NET Core) | Managed HttpClient for Telegram + Discord | Prevents socket exhaustion; already in DI container |

[VERIFIED: apps/api/WebCrawlerApi.csproj and dotnet list package output]

### New Dependencies to Add

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| Microsoft.Extensions.Http.Resilience | 8.x (latest) | HTTP retry pipeline for sender clients | Official .NET resilience; supersedes deprecated `Microsoft.Extensions.Http.Polly`; wraps Polly v8 |

[VERIFIED: nuget.org — Microsoft.Extensions.Http.Resilience 10.4.0 is latest; 8.x branch available for .NET 8 target]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct HttpClient + IHttpClientFactory | `Telegram.Bot` NuGet (v22.9.6) | Telegram.Bot is a full wrapper with typed API but adds 2.5MB dependency and C# 11 nullability noise. For `sendMessage`-only use, direct HTTP is simpler and more transparent. |
| Microsoft.Extensions.Http.Resilience | Simple retry loop (for loop, try/catch, 2 iterations) | Loop is fine at personal project scale. Resilience package adds circuit breaker and standard telemetry. Either is acceptable. |
| `JsonNode.DeepEquals` (.NET 8 built-in) | `system-text-json-jsondiffpatch` NuGet | NuGet provides RFC 6902 patch documents; overkill here. Field-by-field manual comparison with `JsonElement.GetProperty` is sufficient for 3 condition types. |

**Installation (new packages only):**
```bash
dotnet add apps/api/WebCrawlerApi.csproj package Microsoft.Extensions.Http.Resilience
```

---

## Architecture Patterns

### Recommended Project Structure (new files)

```
apps/api/
├── Services/
│   ├── CrawlerEventListener.cs      # MODIFY: add SELECT-before-upsert + EvaluateAndNotifyAsync
│   ├── DiffEngine.cs                # NEW: JsonDocument old→new field comparison
│   ├── AlertRuleEvaluator.cs        # NEW: matches diff result against AlertRule rows
│   ├── TelegramSender.cs            # NEW: POST to api.telegram.org/sendMessage
│   └── DiscordSender.cs             # NEW: POST to Discord webhook URL
├── Models/
│   └── Notifications/
│       ├── DiffResult.cs            # NEW: structured diff output (condition type + changed fields)
│       └── AlertMatch.cs            # NEW: pairing of AlertRule + DiffResult for dispatch
└── Data/
    └── Entities/
        └── NotificationLog.cs       # EXISTING: no changes needed
```

### Pattern 1: SELECT-Before-UPSERT for Diff Snapshot (D-02)

**What:** Load existing `DataEntry` before each upsert so the old payload is available for comparison.
**When to use:** For every entry processed in the NOTIFY handler loop.

```csharp
// Source: CONTEXT.md D-02 + EF Core FirstOrDefaultAsync pattern
private async Task HandleNotificationAsync(string payload, CancellationToken ct)
{
    // ... resolve scope, parse raw content ...
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    foreach (var entry in results)
    {
        // SELECT before UPSERT
        var existing = await db.DataEntries
            .FirstOrDefaultAsync(e =>
                e.SourceId == Guid.Parse(entry.SourceId) &&
                e.EntryKey == entry.EntryKey, ct);

        await UpsertEntryAsync(db, entry, msg.JobId, ct);

        // Re-read the newly-upserted entry to get its Id for FK in notification_logs
        var upserted = await db.DataEntries
            .FirstOrDefaultAsync(e =>
                e.SourceId == Guid.Parse(entry.SourceId) &&
                e.EntryKey == entry.EntryKey, ct);

        await EvaluateAndNotifyAsync(db, upserted!, existing?.Payload, msg.SourceId, ct);
    }
}
```

[ASSUMED] The re-read after upsert is needed to get the Guid Id for `NotificationLog.DataEntryId`. An alternative is to change `UpsertEntryAsync` to return the id — the planner should decide which approach to use.

### Pattern 2: JSONB Field Comparison (DiffEngine)

**What:** Iterate the new payload's properties; for each field, check if the old payload had the same value.

```csharp
// Source: System.Text.Json docs — JsonElement property enumeration
public static Dictionary<string, (JsonElement? OldValue, JsonElement NewValue)> Compare(
    JsonDocument? oldDoc, JsonDocument newDoc)
{
    var changes = new Dictionary<string, (JsonElement?, JsonElement)>();
    foreach (var prop in newDoc.RootElement.EnumerateObject())
    {
        if (oldDoc is null)
        {
            changes[prop.Name] = (null, prop.Value);
            continue;
        }
        if (!oldDoc.RootElement.TryGetProperty(prop.Name, out var oldVal)
            || oldVal.ToString() != prop.Value.ToString())
        {
            changes[prop.Name] = (oldVal.ValueKind == JsonValueKind.Undefined
                ? null : oldVal, prop.Value);
        }
    }
    return changes;
}
```

Note: `.ToString()` on `JsonElement` gives the raw JSON string — an order-insensitive but value-exact comparison. For numeric threshold, use `JsonElement.GetDouble()`.

[ASSUMED] String comparison via `.ToString()` handles nested objects conservatively (will flag any difference including key reordering). If false-positives are a concern, `JsonNode.DeepEquals` (available in .NET 8) is more robust for nested equality.

### Pattern 3: Alert Rule Evaluation

**What:** For each entry, query active rules by `source_id`, then test each rule's `Condition.type` against the diff result.

```csharp
// Source: CONTEXT.md, AlertRule entity in codebase
public async Task<IReadOnlyList<AlertMatch>> EvaluateAsync(
    Guid sourceId,
    Dictionary<string, (JsonElement? Old, JsonElement New)> diff,
    bool isNewEntry,
    JsonDocument newPayload,
    AppDbContext db,
    CancellationToken ct)
{
    var rules = await db.AlertRules
        .Where(r => r.SourceId == sourceId && r.IsActive)
        .ToListAsync(ct);

    var matches = new List<AlertMatch>();
    foreach (var rule in rules)
    {
        var condType = rule.Condition.RootElement
            .GetProperty("type").GetString();

        bool fired = condType switch
        {
            "new_item"      => isNewEntry,
            "field_changed" => MatchFieldChanged(rule, diff),
            "threshold"     => MatchThreshold(rule, newPayload),
            _               => false
        };
        if (fired) matches.Add(new AlertMatch(rule, diff, newPayload));
    }
    return matches;
}
```

### Pattern 4: Message Template Substitution (D-03)

**What:** Replace `{token}` placeholders in `MessageTpl` from new payload fields, then auto-append change context.

```csharp
// Source: CONTEXT.md D-03
private static string BuildMessage(AlertRule rule,
    Dictionary<string, (JsonElement? Old, JsonElement New)> diff,
    JsonDocument payload, string condType)
{
    // Step 1: token substitution
    var msg = rule.MessageTpl;
    foreach (var prop in payload.RootElement.EnumerateObject())
        msg = msg.Replace($"{{{prop.Name}}}", prop.Value.ToString());

    // Step 2: auto-append
    if (condType == "field_changed")
    {
        var field = rule.Condition.RootElement.GetProperty("field").GetString()!;
        if (diff.TryGetValue(field, out var change))
            msg += $"\n{field}: {change.Old} → {change.New}";
    }
    else if (condType == "threshold")
    {
        var field = rule.Condition.RootElement.GetProperty("field").GetString()!;
        var val = payload.RootElement.GetProperty(field).GetDouble();
        msg += $"\nCurrent value: {val}";
    }
    return msg;
}
```

### Pattern 5: Telegram Delivery via Direct HttpClient

**What:** POST to `https://api.telegram.org/bot{TOKEN}/sendMessage` with JSON body.

```csharp
// Source: Telegram Bot API docs (core.telegram.org/bots/api)
public async Task<bool> SendAsync(string message, CancellationToken ct)
{
    var token = Environment.GetEnvironmentVariable("TELEGRAM_BOT_TOKEN")!;
    var chatId = Environment.GetEnvironmentVariable("TELEGRAM_CHAT_ID")!;

    var body = new { chat_id = chatId, text = message };
    var url = $"https://api.telegram.org/bot{token}/sendMessage";

    var response = await _httpClient.PostAsJsonAsync(url, body, ct);
    return response.IsSuccessStatusCode;
}
```

Register in DI:
```csharp
builder.Services.AddHttpClient<TelegramSender>()
    .AddStandardResilienceHandler();  // requires Microsoft.Extensions.Http.Resilience
```

[CITED: https://core.telegram.org/bots/api — sendMessage endpoint, required parameters: chat_id, text]

### Pattern 6: Discord Delivery via Webhook

**What:** POST JSON to the webhook URL. Discord accepts plain `content` string or `embeds` array.

```csharp
// Source: Discord Webhook docs (docs.discord.com/developers/resources/webhook)
public async Task<bool> SendAsync(string message, CancellationToken ct)
{
    var webhookUrl = Environment.GetEnvironmentVariable("DISCORD_WEBHOOK_URL")!;
    var body = new { content = message };

    var response = await _httpClient.PostAsJsonAsync(webhookUrl, body, ct);
    return response.IsSuccessStatusCode;
}
```

Discord webhooks require at least one of: `content`, `embeds`, `components`, `file`, or `poll`. Plain `content` string is sufficient for this phase.
[CITED: https://docs.discord.com/developers/resources/webhook]

### Pattern 7: Notification Log Insert

**What:** Write a `NotificationLog` row after every delivery attempt regardless of success/failure.

```csharp
// Source: NotificationLog entity in codebase
await db.NotificationLogs.AddAsync(new NotificationLog
{
    Id = Guid.NewGuid(),
    AlertRuleId = rule.Id,
    DataEntryId = dataEntry?.Id,
    Channel = rule.Channel,
    Message = formattedMessage,
    Status = success ? "sent" : "failed",
    SentAt = DateTimeOffset.UtcNow
}, ct);
await db.SaveChangesAsync(ct);
```

### Pattern 8: Dedup Guard

**What:** Before sending, check if a notification for the same `(alert_rule_id, data_entry_id)` was already sent within a short window (prevents duplicate delivery if the NOTIFY fires twice).

```csharp
// Source: CONTEXT.md Claude's Discretion — dedup strategy
var cutoff = DateTimeOffset.UtcNow.AddMinutes(-5);
var alreadySent = await db.NotificationLogs.AnyAsync(n =>
    n.AlertRuleId == rule.Id &&
    n.DataEntryId == dataEntry.Id &&
    n.Status == "sent" &&
    n.SentAt > cutoff, ct);
if (alreadySent) return; // skip
```

### Anti-Patterns to Avoid

- **Sharing a single `JsonDocument` across async boundaries:** `JsonDocument` is `IDisposable` — close over its lifetime carefully. Clone values with `element.Clone()` before the document is disposed.
- **Catching all exceptions and silently swallowing:** The existing `CrawlerEventListener` already logs errors. Notification failures must write a `notification_logs` row with `status = "failed"`, not just log.
- **Querying all `AlertRule` rows then filtering in-memory:** Always filter by `source_id` and `is_active = true` in the SQL query, not after.
- **Using `HttpClient` directly (new instance per call):** Always resolve via `IHttpClientFactory` or register as typed client to avoid socket exhaustion.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP retry on delivery failure | Custom retry loop with Thread.Sleep | `AddStandardResilienceHandler()` from `Microsoft.Extensions.Http.Resilience` | Handles transient 5xx/network errors, timeout, exponential backoff correctly |
| JSON semantic equality | String equality of serialized documents | `JsonElement` property iteration or `JsonNode.DeepEquals` | String comparison is fragile (key ordering, whitespace); built-in API handles it |
| Template engine | Regex-based substitution | Simple `string.Replace` per token (D-03 decision) | No library needed; tokens are `{field_name}` only, no conditionals or loops |
| Telegram API wrapper | Custom typed client | Direct `HttpClient.PostAsJsonAsync` | Telegram.Bot NuGet is 2.5MB+ with API surface far larger than needed |

**Key insight:** This phase is about wiring existing infrastructure (EF Core, HttpClient, System.Text.Json) together with straightforward business logic. Every component already exists in the standard .NET 8 stack.

---

## Common Pitfalls

### Pitfall 1: JsonDocument Lifetime and Disposal

**What goes wrong:** `DataEntry.Payload` is a `JsonDocument`. If the `DataEntry` entity is tracked by EF Core and goes out of scope (or the scope is disposed), iterating `Payload.RootElement` throws `ObjectDisposedException`.

**Why it happens:** `JsonDocument` is lazy-parsed and backed by a pooled buffer. EF Core disposes tracked entities' `JsonDocument` properties when the DbContext scope ends.

**How to avoid:** Extract all needed values from `JsonElement` into plain strings/doubles before the scope closes. If you need to pass a `JsonDocument` out of a scope, call `.Clone()` on the element first:
```csharp
var snapshot = existing.Payload.RootElement.Clone();  // independent copy
```

**Warning signs:** `ObjectDisposedException: Cannot access a disposed object` in async stack traces referencing `JsonDocument`.

### Pitfall 2: `new_item` Guard When Entry_Key Collision Happens

**What goes wrong:** If the crawler sends the same `entry_key` twice in rapid succession (duplicate NOTIFY), `existing` may be null on both calls — both fire `new_item`.

**Why it happens:** The UPSERT is raw SQL; EF Core change tracking doesn't reflect the insert until the next SELECT.

**How to avoid:** The dedup guard (Pattern 8) catches this: check `notification_logs` for a recent sent log for the same `(alert_rule_id, data_entry_id)` before sending.

### Pitfall 3: Telegram 400 on Empty message

**What goes wrong:** If `MessageTpl` is empty string or template substitution produces empty text, the Telegram API returns `400 Bad Request: text is empty`.

**Why it happens:** The API requires `text` to be non-empty.

**How to avoid:** Validate `formattedMessage.Length > 0` before calling the sender. Log a warning and skip delivery if empty. Do not insert a `notification_logs` row for a validation skip (it's not a delivery attempt).

### Pitfall 4: Discord 429 Rate Limiting

**What goes wrong:** Discord webhooks are rate-limited (30 requests per 60 seconds per webhook). Rapid test cycles can exhaust the limit.

**Why it happens:** Personal project — single webhook, all rules share it (D-04).

**How to avoid:** At personal project volume this is unlikely. The `AddStandardResilienceHandler` respects `Retry-After` headers automatically if rate-limit responses include them. Log `StatusCode 429` specifically.

**Warning signs:** HTTP 429 responses from `discord.com`.

### Pitfall 5: AlertRule.Condition JSONB shape assumptions

**What goes wrong:** The evaluator calls `rule.Condition.RootElement.GetProperty("field")` without checking if the property exists, causing `KeyNotFoundException` for `new_item` rules (which have no `field` key).

**Why it happens:** Different condition types have different JSONB shapes.

**How to avoid:** Always check `TryGetProperty` before accessing optional condition fields:
```csharp
if (rule.Condition.RootElement.TryGetProperty("field", out var fieldEl))
    var field = fieldEl.GetString();
```

### Pitfall 6: Missing AlertRules/NotificationLogs DbSets at Runtime

**What goes wrong:** `AppDbContext.AlertRules` or `AppDbContext.NotificationLogs` returns null or throws.

**Why it happens:** The DbSets are already defined (verified in `AppDbContext.cs` lines 11-12), but if a developer adds a new migration that drops them, queries will fail at runtime.

**How to avoid:** No migration changes are needed for Phase 4. Confirm DbSets exist before writing queries (already verified).

---

## Code Examples

Verified patterns from official sources:

### Condition JSONB Examples (from AlertRule entity)
```json
// new_item
{"type": "new_item"}

// field_changed
{"type": "field_changed", "field": "patch_version"}

// threshold
{"type": "threshold", "field": "team_points", "operator": "gt", "value": 50}
```

[ASSUMED] The `threshold` condition JSONB shape (with `operator` and `value` keys) is inferred from the CONTEXT.md description. If the actual schema differs, the evaluator must adapt.

### Telegram sendMessage (Direct HTTP)
```http
POST https://api.telegram.org/bot{TOKEN}/sendMessage
Content-Type: application/json

{
  "chat_id": "-100...",
  "text": "EPL: Arsenal now has 75 points\nteam_points: 72 → 75"
}
```
[CITED: https://core.telegram.org/bots/api#sendmessage]

### Discord Webhook (Plain content)
```http
POST https://discord.com/api/webhooks/{id}/{token}
Content-Type: application/json

{
  "content": "EPL: Arsenal now has 75 points\nteam_points: 72 → 75"
}
```
[CITED: https://docs.discord.com/developers/resources/webhook]

### DI Registration in Program.cs
```csharp
// Add after existing service registrations
builder.Services.AddHttpClient<TelegramSender>()
    .AddStandardResilienceHandler();
builder.Services.AddHttpClient<DiscordSender>()
    .AddStandardResilienceHandler();

builder.Services.AddScoped<DiffEngine>();
builder.Services.AddScoped<AlertRuleEvaluator>();
builder.Services.AddScoped<NotificationDispatcher>();
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Microsoft.Extensions.Http.Polly` | `Microsoft.Extensions.Http.Resilience` | .NET 8 / 2023 | Old package deprecated; new one wraps Polly v8, provides `AddStandardResilienceHandler()` |
| `Newtonsoft.Json` for JSONB | `System.Text.Json` | .NET 6+ | Built-in, faster, no allocation overhead for read-only |
| `Telegram.Bot` wrapper | Direct HttpClient for Bot API | Always viable | For single-endpoint use (`sendMessage`), direct HTTP avoids 2MB+ dependency |

**Deprecated/outdated:**
- `Microsoft.Extensions.Http.Polly`: Deprecated in favor of `Microsoft.Extensions.Http.Resilience`. Still works but not recommended for new code.
- `WebClient`: Deprecated in .NET 6+. Use `HttpClient` via `IHttpClientFactory`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Re-reading `DataEntry` after upsert is needed to get the Guid Id for `NotificationLog.DataEntryId` | Architecture Patterns (Pattern 1) | If `UpsertEntryAsync` is changed to return the Id, the second SELECT is unnecessary overhead |
| A2 | `string.Replace` comparison via `.ToString()` on `JsonElement` is sufficient for field equality | Architecture Patterns (Pattern 2) | Nested objects with different key orders would be flagged as changed; `JsonNode.DeepEquals` is safer for complex payloads |
| A3 | Threshold condition JSONB shape uses `{"type":"threshold","field":"...","operator":"gt","value":50}` | Code Examples | If the actual shape differs, the evaluator needs to adapt; canonical schema in `SCHEMA.md` takes precedence |
| A4 | The 5-minute dedup window in Pattern 8 is reasonable | Architecture Patterns (Pattern 8) | Too short = no protection; too long = misses legitimate re-fires. Confirm with project owner if needed |

---

## Open Questions (RESOLVED)

1. **DataEntry Id retrieval after raw-SQL UPSERT**
   - What we know: `UpsertEntryAsync` uses raw SQL `ExecuteSqlRawAsync` — EF Core does not track the resulting entity or return the Id.
   - What's unclear: Should the plan use a second `FirstOrDefaultAsync` to get the Id for the FK, or should `UpsertEntryAsync` be refactored to return the Id (e.g., via `RETURNING id` in the SQL)?
   - Recommendation: Add `RETURNING id` to the UPSERT SQL and return the `Guid` — one fewer round-trip than a second SELECT.
   - **RESOLVED (Plan 04-05):** Plan 04-05 uses a second `FirstOrDefaultAsync` SELECT after the UPSERT to retrieve the Id. This avoids modifying `UpsertEntryAsync`'s signature and is functionally correct for the personal-project scale of this system.

2. **AlertRule.Condition threshold schema**
   - What we know: CONTEXT.md describes `new_item`, `field_changed`, and `threshold` condition types. The exact JSONB fields for `threshold` (operator, value) are not in CONTEXT.md.
   - What's unclear: Is the threshold shape `{type, field, operator, value}` or `{type, field, threshold}`?
   - Recommendation: Read `SCHEMA.md` before implementing the evaluator. Plan 04-02 must document the canonical shape.
   - **RESOLVED (Plan 04-02):** Threshold condition shape is `{type, field, operator, value}` where `operator` is a string (`">"`, `"<"`, `">="`, `"<="`, `"=="`) and `value` is a numeric threshold. The evaluator uses `TryGetProperty("operator")` and `TryGetDouble("value")` on the condition JSONB.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| .NET 8 SDK | All API services | ✓ | net8.0 (verified via csproj) | — |
| PostgreSQL (via EF Core) | AlertRule query, NotificationLog insert | ✓ | Npgsql 8.0.11 | — |
| Telegram Bot API | NOTIF-05 | External — not verified | — | Env var missing → log warning + skip |
| Discord Webhook | NOTIF-06 | External — not verified | — | Env var missing → log warning + skip |
| Microsoft.Extensions.Http.Resilience | HTTP retry | ✗ (not in csproj yet) | 8.x | Simple loop (2 retries) if not added |

[VERIFIED: apps/api/WebCrawlerApi.csproj — package list confirmed; Telegram/Discord are external services]

**Missing dependencies with no fallback:**
- None that block local compilation.

**Missing dependencies with fallback:**
- `Microsoft.Extensions.Http.Resilience` — not yet in csproj. Must be added via `dotnet add package`. Fallback: a simple for-loop retry (2 attempts) in each sender is acceptable if the package is not added.
- Telegram/Discord env vars — if absent at runtime, senders should log a warning and return `false` (not throw), so the log row records `status = "skipped"` or `"failed"`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | xUnit (to be added — no test project exists yet) |
| Config file | `apps/api.Tests/` — new project needed (Wave 0 gap) |
| Quick run command | `dotnet test apps/api.Tests/ --filter "Category=Unit" --no-build` |
| Full suite command | `dotnet test apps/api.Tests/ --no-build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTIF-01 | `EvaluateAndNotifyAsync` is called after `UpsertEntryAsync` | unit | `dotnet test --filter "FullyQualifiedName~NotificationPipelineTests"` | ❌ Wave 0 |
| NOTIF-02 | `new_item` fires when old payload is null | unit | `dotnet test --filter "FullyQualifiedName~AlertRuleEvaluatorTests.NewItem"` | ❌ Wave 0 |
| NOTIF-03 | `field_changed` fires when a tracked field value differs | unit | `dotnet test --filter "FullyQualifiedName~AlertRuleEvaluatorTests.FieldChanged"` | ❌ Wave 0 |
| NOTIF-04 | `threshold` fires when numeric field crosses configured value | unit | `dotnet test --filter "FullyQualifiedName~AlertRuleEvaluatorTests.Threshold"` | ❌ Wave 0 |
| NOTIF-05 | Telegram sender POSTs correct JSON to Bot API URL | unit (mock HttpClient) | `dotnet test --filter "FullyQualifiedName~TelegramSenderTests"` | ❌ Wave 0 |
| NOTIF-06 | Discord sender POSTs correct JSON to webhook URL | unit (mock HttpClient) | `dotnet test --filter "FullyQualifiedName~DiscordSenderTests"` | ❌ Wave 0 |
| NOTIF-07 | `notification_logs` row inserted on every attempt (success + failure) | unit (in-memory EF Core) | `dotnet test --filter "FullyQualifiedName~NotificationLogTests"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `dotnet build apps/api/WebCrawlerApi.csproj --no-restore` (build must succeed)
- **Per wave merge:** `dotnet test apps/api.Tests/ --no-build`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/api.Tests/WebCrawlerApi.Tests.csproj` — new xUnit test project referencing main project
- [ ] `apps/api.Tests/Services/AlertRuleEvaluatorTests.cs` — covers NOTIF-02, NOTIF-03, NOTIF-04
- [ ] `apps/api.Tests/Services/TelegramSenderTests.cs` — covers NOTIF-05
- [ ] `apps/api.Tests/Services/DiscordSenderTests.cs` — covers NOTIF-06
- [ ] `apps/api.Tests/Services/NotificationLogTests.cs` — covers NOTIF-07
- [ ] Solution file update: add `api.Tests` project to `web-crawler.sln`
- [ ] Framework install: `dotnet add apps/api.Tests/ package xunit Microsoft.NET.Test.Sdk xunit.runner.visualstudio Moq`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Bot tokens are env-var credentials, not user auth |
| V3 Session Management | No | Stateless notification dispatch |
| V4 Access Control | No | Single-user personal project, no access control layer |
| V5 Input Validation | Yes | Alert rule condition JSONB must be validated before `GetProperty` access |
| V6 Cryptography | No | No cryptographic operations — tokens are opaque strings |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Bot token/webhook URL leakage | Information Disclosure | Env vars only (D-04); never log token values; never serialize to response bodies |
| JSONB injection via `message_tpl` | Tampering | `string.Replace` with known token patterns only; no `eval`-like execution |
| Uncontrolled retry amplification | Denial of Service | Max 2 retries (ROADMAP spec); `AddStandardResilienceHandler` enforces timeout |
| Notification log unbounded growth | Denial of Service | Out of scope for Phase 4; retention policy is Phase 8+ |

**Note on bot token logging:** The `ILogger` pattern in this project uses structured logging. Ensure `TELEGRAM_BOT_TOKEN` value is never passed as a structured log parameter — log only `"Telegram token configured: {Configured}"` with a boolean.

---

## Sources

### Primary (HIGH confidence)
- Codebase: `apps/api/WebCrawlerApi.csproj` — confirmed installed packages and .NET 8 target
- Codebase: `apps/api/Services/CrawlerEventListener.cs` — verified integration point for `EvaluateAndNotifyAsync`
- Codebase: `apps/api/Data/AppDbContext.cs` — confirmed `AlertRules` and `NotificationLogs` DbSets exist
- Codebase: `apps/api/Data/Entities/*.cs` — confirmed entity shapes match research assumptions
- CONTEXT.md — locked decisions D-01 through D-04

### Secondary (MEDIUM confidence)
- [NuGet: Microsoft.Extensions.Http.Resilience](https://www.nuget.org/packages/Microsoft.Extensions.Http.Resilience) — version 10.4.0 latest, 8.x available for .NET 8
- [Telegram Bot API docs](https://core.telegram.org/bots/api) — sendMessage endpoint, required parameters
- [Discord Webhook docs](https://docs.discord.com/developers/resources/webhook) — content field requirement
- [NuGet: Telegram.Bot 22.9.6](https://www.nuget.org/packages/Telegram.Bot) — confirmed available but not recommended for this use case

### Tertiary (LOW confidence, verify before use)
- [WebSearch: System.Text.Json JsonNode.DeepEquals in .NET 8](https://github.com/dotnet/runtime/issues/33388) — claimed introduced in .NET 8; verify API exists before using in implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in csproj or NuGet registry
- Architecture: HIGH — patterns derived directly from locked decisions and existing codebase
- Pitfalls: MEDIUM — based on .NET 8 + System.Text.Json known behaviors; some from training knowledge
- Test framework: MEDIUM — xUnit is standard for .NET; no test project exists yet to verify

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (30 days — stable .NET 8 and Telegram/Discord APIs)
