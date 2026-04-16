# Phase 4: Notification Engine - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

After each parse, the system evaluates configured alert rules using a diff engine and delivers
matching notifications to Telegram and/or Discord, logging every delivery attempt.

Covers: diff engine, alert rule evaluator (new_item, field_changed, threshold), Telegram Bot
delivery, Discord Webhook delivery, and notification_logs persistence.

Not in scope: REST API endpoints for alert_rules CRUD (Phase 5), SignalR real-time push (Phase 6),
dashboard UI for notification history (Phase 8).

</domain>

<decisions>
## Implementation Decisions

### Dispatch Architecture
- **D-01:** Inline in `CrawlerEventListener`. After `UpsertEntryAsync` completes, call a new
  `EvaluateAndNotifyAsync()` method within the same NOTIFY handler. No Redis queue, no separate
  `NotificationWorker` IHostedService. Simpler, no moving parts overhead — acceptable for
  personal project notification volume.
  - Flow: `HandleNotificationAsync` → `UpsertEntryAsync` → `EvaluateAndNotifyAsync`
    → `DiffEngine.Compare` → `AlertRuleEvaluator.Match` → `NotificationSender.Send`

### Diff Snapshot Approach
- **D-02:** SELECT before UPSERT. Before calling `UpsertEntryAsync`, load the current
  `data_entries` row for `(source_id, entry_key)` via EF Core `FirstOrDefaultAsync`. Pass old
  payload to diff engine, then proceed with upsert. One extra SELECT per entry — acceptable at
  personal project scale.
  - If no existing row: old payload is `null` → only `new_item` rules fire
  - If row exists: compare old vs new payload for `field_changed` and `threshold` conditions

### Message Format
- **D-03:** Template + auto old→new. `message_tpl` supports `{field_name}` placeholders
  substituted from the new payload. Additionally:
  - `field_changed`: auto-append `{field}: {old_value} → {new_value}` after the template text
  - `threshold`: auto-append `Current value: {value}` after the template text
  - `new_item`: template substitution only, no auto-append
  - Implementation: simple `string.Replace` per `{token}`, no templating engine

### Credential Configuration
- **D-04:** Global env vars only. No per-rule credential columns (no schema migration needed).
  - `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — all telegram rules route to one chat
  - `DISCORD_WEBHOOK_URL` — all discord rules route to one webhook
  - `AlertRule.Channel` = `"telegram"` or `"discord"` selects which sender to use

### Claude's Discretion
- .NET HTTP client implementation for Telegram Bot API (direct HttpClient vs Telegram.Bot NuGet)
- .NET HTTP client for Discord Webhook (direct HttpClient — Discord uses plain HTTP POST)
- Retry strategy for delivery failures (ROADMAP specifies up to 2x retry — use Polly or simple loop)
- Dedup guard implementation (check notification_logs for recent (alert_rule_id, data_entry_id) before sending)
- DiffEngine class structure and System.Text.Json comparison approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Phase 4 requirements: NOTIF-01 through NOTIF-07 (condition types,
  delivery channels, notification_logs schema)

### Schema
- `SCHEMA.md` — `alert_rules` table (condition JSONB examples for new_item, field_changed,
  threshold), `notification_logs` table (status, sent_at columns), `data_entries` table
  (entry_key + payload used for diff)

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — Notification Flow section (steps 1-6), Content Parsers
  section (existing .NET IContentParser pattern), Data Flow step 10 (diff engine integration point)

### Roadmap
- `.planning/ROADMAP.md` — Phase 4 success criteria (5 items), plan breakdown (04-01 to 04-05)

### Prior Phase Context
- `.planning/phases/03-postgresql-schema-parsers-listen-notify-handoff/03-CONTEXT.md` — D-03
  (Redis raw content staging), D-04 (UPSERT behavior), D-06 (AppDbContext setup)
- `.planning/phases/01-monorepo-foundation-crawler-skeleton/01-CONTEXT.md` — D-04 (env var pattern)

### Existing Source Files (must read before implementing)
- `apps/api/Services/CrawlerEventListener.cs` — Integration point: `HandleNotificationAsync` and
  `UpsertEntryAsync` — Phase 4 extends this with `EvaluateAndNotifyAsync` after upsert
- `apps/api/Data/Entities/AlertRule.cs` — AlertRule entity (Condition JSONB, MessageTpl, Channel)
- `apps/api/Data/Entities/NotificationLog.cs` — NotificationLog entity schema
- `apps/api/Data/Entities/DataEntry.cs` — DataEntry entity (Payload JsonDocument, EntryKey)
- `apps/api/Data/AppDbContext.cs` — DbContext (add AlertRules + NotificationLogs DbSets if missing)
- `apps/api/Program.cs` — DI registration point for new notification services

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CrawlerEventListener.UpsertEntryAsync` — Phase 4 modifies this method's caller to add a
  SELECT before the upsert call (D-02). The upsert SQL itself stays unchanged.
- `AppDbContext` — already has `AlertRule` and `NotificationLog` entities from Phase 3 migration.
  Phase 4 adds business logic on top — no new migration needed (schema is complete).
- `IConnectionMultiplexer` (Redis) — already registered in DI; available in `CrawlerEventListener`
  constructor. Not needed for notification dispatch but available.

### Established Patterns
- All new services in `apps/api/Services/` (follow `CrawlerEventListener.cs` pattern)
- DI registration in `apps/api/Program.cs` via `builder.Services.Add*`
- Scoped services for DB access (`IServiceScopeFactory.CreateScope()` pattern — already used in
  `CrawlerEventListener.HandleNotificationAsync`)
- Env vars via `Environment.GetEnvironmentVariable()` (see existing `DATABASE_URL`, `REDIS_URL`)
- Logging: `ILogger<T>` with structured logging (`logger.LogInformation("{Key} = {Value}", ...)`)

### Integration Points
- `CrawlerEventListener.HandleNotificationAsync` — primary integration point. The SELECT + notify
  logic wraps around the existing upsert loop (currently iterates `results` from parser)
- `AppDbContext.AlertRules` — queried to find active rules matching `source_id`
- `AppDbContext.NotificationLogs` — written after every delivery attempt

</code_context>

<specifics>
## Specific Ideas

- Inline dispatch (no queue): keep Phase 4 simple — `EvaluateAndNotifyAsync` is a direct method
  call within the existing NOTIFY handler, not a separate background service
- SELECT before UPSERT pattern is intentional — enables clean diff without modifying the UPSERT SQL
- Message format: auto-append old→new only for `field_changed` and threshold value for `threshold`
  — `new_item` uses template substitution only

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-notification-engine*
*Context gathered: 2026-04-15*
