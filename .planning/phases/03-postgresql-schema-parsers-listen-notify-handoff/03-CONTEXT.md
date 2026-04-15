# Phase 3: PostgreSQL Schema, Parsers & LISTEN/NOTIFY Handoff - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Crawled data flows from Node.js crawler through PostgreSQL LISTEN/NOTIFY into .NET keyed-service parsers and lands in `data_entries` as structured JSONB rows with stable `entry_key` values.

Covers: EF Core schema migration (all 5 tables), Node.js → PostgreSQL crawl_jobs write, LISTEN/NOTIFY handoff, `IContentParser` interface + keyed service registration, and all 5 parser implementations (Football, Genshin, LoL, AniList, MangaDex).

Not in scope: notification engine, diff engine, alert rule evaluation, REST API endpoints (those are Phase 4+).

</domain>

<decisions>
## Implementation Decisions

### Node.js DB Write Strategy
- **D-01:** Node.js inserts a `crawl_jobs` row (source_id, url, status, content_hash) into PostgreSQL directly using a `pg` client, then emits `NOTIFY crawler_events '{"job_id":"...","source_id":"...","parser_key":"..."}'`. Node.js is NOT DB-free — it owns its job audit log.

### NOTIFY Payload Design
- **D-02:** NOTIFY message carries exactly: `{ job_id, source_id, parser_key }`. Minimal routing signal — enough for .NET to resolve the correct parser immediately without a DB lookup. Raw content is NOT in the NOTIFY payload (PostgreSQL NOTIFY limit is 8000 bytes).

### Raw Content Staging
- **D-03:** Node.js writes raw crawl content to Redis under key `job:raw:{job_id}` with TTL 5 minutes. .NET reads from this key after receiving NOTIFY, runs the parser, then the key naturally expires. No `raw_content` column added to `crawl_jobs` schema — content is ephemeral.

### entry_key Upsert Behavior
- **D-04:** When the same `entry_key` reappears for the same source, UPSERT: `ON CONFLICT (source_id, entry_key) DO UPDATE SET payload = EXCLUDED.payload, crawled_at = NOW()`. Migration must define a `UNIQUE (source_id, entry_key)` constraint on `data_entries`. One row per logical entity — no unbounded growth. Phase 4 diff engine compares new payload against the current DB row.

### Parser Implementation Depth
- **D-05:** Happy-path parsers: assume expected input shape. On missing/null fields: log a `WARN` with source context and skip that entry (do not throw). No schema validation library. All 5 parsers follow this pattern — defensive hardening deferred to Phase 4+.

### EF Core Setup Scope
- **D-06:** Phase 3 wires a complete working `AppDbContext` (models, DbSets for all 5 entities, connection string from env `DATABASE_URL`). Parsers need to write to DB, so the DbContext must be fully operational — not deferred to Phase 5. Phase 5 can add API-layer concerns on top of the already-wired context.

### Claude's Discretion
- pg client library choice for Node.js (e.g., `pg` npm package vs `postgres`)
- Npgsql LISTEN/NOTIFY implementation pattern (IHostedService with `NpgsqlConnection.Wait()` or event-based)
- Redis key naming for raw content staging beyond the `job:raw:{job_id}` prefix
- Migration timestamp values (`YYYYMMDD_description` naming is fixed)
- EF Core entity property naming conventions (C# PascalCase → PostgreSQL snake_case via convention)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema Design
- `SCHEMA.md` — Canonical PostgreSQL schema: all 5 tables with exact column definitions, indexes, and example JSONB payloads per domain. Migration must match this exactly.

### Requirements
- `.planning/REQUIREMENTS.md` — Phase 3 requirements: STORE-01, STORE-02, STORE-03, STORE-04, PARSE-01, PARSE-02, PARSE-03

### Architecture & Stack
- `.planning/codebase/ARCHITECTURE.md` — Full data flow (steps 8–9 cover parsed-data handoff), Content Parsers section (Strategy Pattern, IContentParser), Database Design section (JSONB + GIN index rationale)
- `.planning/codebase/STACK.md` — EF Core Migrations spec (`dotnet ef migrations add YYYYMMDD_description`), Npgsql dependency

### Roadmap
- `.planning/ROADMAP.md` — Phase 3 success criteria (5 items, especially criteria 1–5 for migration, NOTIFY timing, parser keyed dispatch, JSONB row, GIN index EXPLAIN ANALYZE)

### Prior Phase Context
- `.planning/phases/01-monorepo-foundation-crawler-skeleton/01-CONTEXT.md` — D-04 env var pattern (per-service .env files), logging conventions
- `.planning/phases/02-full-url-frontier-crawl-hardening/02-CONTEXT.md` — D-07 source worker pattern, Redis connection reuse, existing worker files

### Existing Source Files (must read before implementing)
- `apps/api/Program.cs` — Current API entry point (Serilog wired, no EF Core yet)
- `apps/api/WebCrawlerApi.csproj` — Current package references (only Serilog — EF Core + Npgsql packages must be added)
- `apps/crawler/src/connection.ts` — Redis connection (reuse for `job:raw:{job_id}` staging writes)
- `apps/crawler/src/workers/FootballDataWorker.ts` — Canonical worker pattern (error handling, logging)
- `apps/crawler/src/workers/crawlWorker.ts` — Integration point where crawl_jobs INSERT + NOTIFY must be added

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/crawler/src/connection.ts` — ioredis connection already established; reuse for Redis raw content staging (`job:raw:{job_id}`)
- `apps/crawler/src/logger.ts` — Winston logger; use same structured logging in Node.js DB write code
- `apps/crawler/src/workers/FootballDataWorker.ts` — Template for per-source worker; Node.js will write crawl_jobs from within the worker's completion handler
- `apps/crawler/src/workers/crawlWorker.ts` — Add `crawl_jobs` INSERT + Redis raw staging + `pg_notify` here after successful fetch

### Established Patterns
- Error handling: catch → log with `logger.error()` → re-throw (so BullMQ records failure and applies retry) — from Phase 2
- Queue naming: `crawl-{domain}` — no change needed for Phase 3
- User-Agent: `'PersonalCrawlerBot/1.0'` on all HTTP requests — unchanged
- Per-service `.env` files: `apps/api/.env` holds `DATABASE_URL` for EF Core, `apps/crawler/.env` holds both `DATABASE_URL` (for pg client) and `REDIS_URL`

### Integration Points
- `apps/crawler/src/workers/crawlWorker.ts` — crawl_jobs INSERT + Redis staging + `pg_notify` added here
- `apps/api/Program.cs` — Add EF Core DbContext + Npgsql LISTEN background service registrations
- `apps/api/WebCrawlerApi.csproj` — Add `Npgsql.EntityFrameworkCore.PostgreSQL`, `Microsoft.EntityFrameworkCore.Design`, `StackExchange.Redis` (for raw content reads) packages

</code_context>

<specifics>
## Specific Ideas

- NOTIFY channel name: `crawler_events` (consistent single channel, parser_key in payload routes to correct parser)
- Redis staging key format: `job:raw:{job_id}` (matches established `crawl:*` namespace pattern from Phase 2)
- UPSERT SQL: `INSERT INTO data_entries ... ON CONFLICT (source_id, entry_key) DO UPDATE SET payload = EXCLUDED.payload, crawled_at = NOW()`
- Unique constraint: `UNIQUE (source_id, entry_key)` on `data_entries` — must be in the EF Core migration
- Parser key convention: lowercase hyphenated source name (e.g., `football`, `genshin`, `lol`, `anilist`, `mangadex`) stored in `sources.parser_key` column (new column to add to sources migration)

</specifics>

<deferred>
## Deferred Ideas

- Defensive null-checks / schema validation in parsers — deferred to Phase 4+
- `raw_content` column on `crawl_jobs` — decided against; Redis staging chosen instead
- Per-domain BullMQ queue approach for raw content handoff — already decided against in Phase 2 (STATE.md); LISTEN/NOTIFY confirmed

</deferred>

---

*Phase: 03-postgresql-schema-parsers-listen-notify-handoff*
*Context gathered: 2026-04-10*
