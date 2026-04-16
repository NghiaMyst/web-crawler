# Phase 4: Notification Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the discussion.

**Date:** 2026-04-15
**Phase:** 04-notification-engine
**Mode:** discuss
**Areas analyzed:** Dispatch architecture, Message format, Credential config, Diff snapshot approach

---

## Assumptions Presented

None — standard discuss mode, all areas presented as open choices.

---

## Discussion Summary

### Dispatch Architecture
| Option | Chosen |
|--------|--------|
| Inline in CrawlerEventListener | ✓ |
| Redis queue + NotificationWorker | — |

User selected inline dispatch. Simpler, fewer moving parts. No Redis queue overhead needed
for personal project notification volume. `EvaluateAndNotifyAsync` becomes a direct method
call after `UpsertEntryAsync` within `HandleNotificationAsync`.

### Message Format
| Option | Chosen |
|--------|--------|
| Template + auto old→new | ✓ |
| Plain {field} replacement only | — |

User wants auto-appended context for `field_changed` (old → new) and `threshold` (current value).
`new_item` uses template substitution only. Implementation via simple `string.Replace`.

### Credential Configuration
| Option | Chosen |
|--------|--------|
| Global env vars | ✓ |
| Per-rule webhook/chat_id | — |

Global env vars confirmed: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`.
No schema migration needed — `AlertRule.Channel` selects the sender, credentials come from env.

### Diff Snapshot Approach
| Option | Chosen |
|--------|--------|
| SELECT before UPSERT | ✓ |
| RETURNING in UPSERT SQL | — |

SELECT-before-UPSERT pattern confirmed. Load current `data_entries` row via EF Core
`FirstOrDefaultAsync` before calling `UpsertEntryAsync`. Pass old payload to diff engine.
One extra DB round-trip per entry — acceptable at personal project scale.

---

## No Corrections Required

All recommended options were confirmed by user.
