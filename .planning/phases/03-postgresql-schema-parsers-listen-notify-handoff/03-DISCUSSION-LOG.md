# Phase 3: PostgreSQL Schema, Parsers & LISTEN/NOTIFY Handoff - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 03-postgresql-schema-parsers-listen-notify-handoff
**Areas discussed:** Node.js DB write strategy, NOTIFY payload design, Raw content staging, entry_key upsert behavior, Parser implementation depth

---

## Node.js DB Write Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Node writes crawl_jobs, then NOTIFY | Node.js inserts crawl_jobs row, sends NOTIFY with job_id | ✓ |
| Node stays DB-free, NOTIFY carries raw content | NOTIFY carries full content inline (8000 byte limit issue) | |
| Node writes crawl_jobs via .NET API call | Node calls .NET REST endpoint, tighter coupling | |

**User's choice:** Node writes crawl_jobs directly, then sends NOTIFY.
**Notes:** Clean separation — Node.js owns its job audit log. .NET handles parsing and data_entries writes.

---

## NOTIFY Payload Design

| Option | Description | Selected |
|--------|-------------|----------|
| job_id + source_id + parser_key | Minimal routing signal, .NET resolves parser immediately | ✓ |
| job_id only | Absolute minimum, requires extra DB roundtrip for routing | |
| job_id + source_id + parser_key + content summary | Adds complexity, no clear benefit | |

**User's choice:** `{ job_id, source_id, parser_key }` — enough for .NET to route immediately.
**Notes:** parser_key enables keyed service resolution without any DB lookup.

---

## Raw Content Staging

| Option | Description | Selected |
|--------|-------------|----------|
| Redis staging (job:raw:{job_id}, TTL 5min) | Ephemeral, no schema change, content stays out of DB | ✓ |
| Add raw_content column to crawl_jobs | Simple but potentially large rows (50–500KB HTML) | |

**User's choice:** Redis staging — key `job:raw:{job_id}` with 5-minute TTL.
**Notes:** No schema change needed. Content is ephemeral and cleaned up automatically.

---

## entry_key Upsert Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| UPSERT — update existing row | ON CONFLICT DO UPDATE, one row per logical entity | ✓ |
| INSERT always — preserve full history | New row per crawl, unbounded growth, diff needs two-row compare | |

**User's choice:** UPSERT on `(source_id, entry_key)` conflict.
**Notes:** Requires UNIQUE constraint on `(source_id, entry_key)` in the migration. Phase 4 diff engine compares new payload against current DB row.

---

## Parser Implementation Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Happy-path + log errors | Assume expected shape, log WARN on null fields, skip entry | ✓ |
| Defensive with null checks everywhere | Every field guarded, schema validation, partial data fallbacks | |

**User's choice:** Happy-path + log errors. No schema validation library.
**Notes:** Over-engineering for data sources we control (known API response shapes). Hardening deferred to Phase 4+.

---

## Claude's Discretion

- pg client library choice for Node.js
- Npgsql LISTEN/NOTIFY implementation pattern (IHostedService approach)
- Redis key naming beyond `job:raw:{job_id}` prefix
- EF Core entity naming conventions
- Migration timestamp values
