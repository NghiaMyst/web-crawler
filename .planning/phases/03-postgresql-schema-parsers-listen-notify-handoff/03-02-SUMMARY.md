---
phase: 03-postgresql-schema-parsers-listen-notify-handoff
plan: "02"
subsystem: crawler-database
tags: [pg, postgresql, listen-notify, redis, bullmq, outbox, nodejs]
dependency_graph:
  requires:
    - phase: 03-01
      provides: crawl_jobs table (PostgreSQL schema with source_id, url, status, content_hash, id columns)
  provides:
    - crawlJobsDb.ts with insertCrawlJobAndNotify and closePgPool
    - Redis staging via job:raw:{jobId} with 5-min TTL
    - pg_notify('crawler_events') firing on every committed crawl_jobs insert
    - crawlWorker.ts integrated with DB write + Redis staging in correct order
  affects:
    - apps/api (03-03 .NET LISTEN/NOTIFY subscriber reads from crawler_events channel)
    - 03-03-PLAN.md (Npgsql background service subscribes to crawler_events)
tech_stack:
  added:
    - pg 8.20.0
    - "@types/pg 8.20.0"
  patterns:
    - Redis-before-pg-transaction ordering to prevent race condition with NOTIFY consumer
    - Caller-provided UUID for Redis key and DB row ID alignment
    - pg Pool with client.connect()/client.release() for transaction isolation
    - Parameterized queries for all SQL values (T-03-03 mitigation)
    - JSON.stringify of known fields only for pg_notify payload (T-03-04 mitigation)
key_files:
  created:
    - apps/crawler/src/db/crawlJobsDb.ts
  modified:
    - apps/crawler/package.json
    - apps/crawler/src/workers/crawlWorker.ts
    - apps/crawler/src/producers/crawlProducer.ts
key_decisions:
  - "Caller provides jobId to insertCrawlJobAndNotify so Redis key job:raw:{jobId} matches DB row — avoids UUID mismatch between Redis staging and pg INSERT"
  - "Redis write must precede pg BEGIN/COMMIT because pg_notify fires on COMMIT and the .NET listener reads Redis immediately after receiving the notification"
  - "closePgPool() added to graceful shutdown after worker.close() to drain connections cleanly on SIGTERM/SIGINT"
patterns_established:
  - "Redis staging before pg transaction: always write job:raw:{jobId} to Redis BEFORE opening the pg transaction when the consumer reads Redis on NOTIFY"
  - "Parameterized pg_notify: payload passed as $1 parameter to pg_notify to prevent SQL injection in channel payload"
requirements_completed:
  - PARSE-03
  - STORE-01
duration: "~20 minutes"
completed: "2026-04-10"
---

# Phase 3 Plan 02: PostgreSQL LISTEN/NOTIFY Outbox Summary

**Node.js crawler writes raw content to Redis (TTL 5min) then inserts crawl_jobs + fires pg_notify('crawler_events') in a single atomic transaction, establishing the outbox handoff for the .NET LISTEN/NOTIFY subscriber.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-10T06:59:37Z
- **Completed:** 2026-04-10T07:00:43Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `crawlJobsDb.ts` created with transaction-safe `insertCrawlJobAndNotify` — pg Pool, BEGIN/INSERT/pg_notify/COMMIT with ROLLBACK on error, caller-provided UUID so Redis key and DB row ID are aligned
- Redis staging integrated into `crawlWorker.ts` with the critical ordering constraint enforced: `connection.set(job:raw:{jobId})` fires before the pg transaction opens, preventing a race with the .NET NOTIFY consumer
- pg connection pool closed cleanly on SIGTERM/SIGINT via `closePgPool()` in the graceful shutdown sequence
- `parserKey?: string` added to `CrawlJobData` so each source worker can declare its parser affinity, which flows into the pg_notify payload as `parser_key`

## Task Commits

1. **Task 1: Install pg package + create crawlJobsDb.ts** - `7239474` (feat)
2. **Task 2: Integrate DB write + Redis staging into crawlWorker.ts** - `a2c18bb` (feat)

## Files Created/Modified

- `apps/crawler/src/db/crawlJobsDb.ts` - pg Pool, `CrawlJobInsert` interface, `insertCrawlJobAndNotify` (transaction), `closePgPool`
- `apps/crawler/package.json` - Added `pg@8.20.0` (dep) and `@types/pg@8.20.0` (devDep)
- `apps/crawler/src/workers/crawlWorker.ts` - Redis staging + DB write block after content-hash dedup; `closePgPool` wired into graceful shutdown
- `apps/crawler/src/producers/crawlProducer.ts` - Added `parserKey?: string` to `CrawlJobData` interface

## Decisions Made

- **Caller-provided UUID:** The plan originally used `gen_random_uuid()` in SQL for the PK. Changed to pass `jobId` from the caller (generated via `crypto.randomUUID()` before the Redis write) so the Redis key `job:raw:{jobId}` and the DB row `id` are the same value. Without this, the .NET consumer receives a job_id in the NOTIFY payload that doesn't match any Redis key.
- **Redis before pg transaction:** Enforced as a hard ordering rule with inline comment explaining the race condition. The pg_notify fires on COMMIT; if Redis write came after COMMIT, the .NET listener could attempt to read a key that does not yet exist.
- **`closePgPool()` in shutdown:** Added to the existing `setupGracefulShutdown` function after `worker.close()` and before `connection.quit()`, maintaining the correct teardown order (stop accepting work → drain pg connections → close Redis).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Caller-provided jobId replaces gen_random_uuid() in INSERT**
- **Found during:** Task 2 (integrating crawlWorker.ts)
- **Issue:** The plan's `crawlJobsDb.ts` used `gen_random_uuid()` in SQL and returned the generated id via `RETURNING id`. The plan then said to generate a UUID client-side for the Redis key (`const jobId = crypto.randomUUID()`) and pass it to `insertCrawlJobAndNotify`. These are two separate UUIDs — the Redis key would never match the DB row id that the NOTIFY payload references.
- **Fix:** Modified `CrawlJobInsert` to include `jobId: string`. The SQL `INSERT` uses `$1` (the caller's UUID) instead of `gen_random_uuid()`. The `RETURNING id` clause was removed. The caller generates one UUID, uses it for both the Redis key and the DB row.
- **Files modified:** `apps/crawler/src/db/crawlJobsDb.ts`
- **Verification:** TypeScript compiles 0 errors; Redis key and pg_notify `job_id` field are provably the same value
- **Committed in:** 7239474 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — UUID mismatch between Redis key and DB row)
**Impact on plan:** Fix was required for correctness — without it the .NET subscriber would receive a job_id that maps to no Redis key.

## Issues Encountered

None. TypeScript compiled cleanly on both tasks.

## Known Stubs

None. `parserKey` defaults to `'unknown'` if not set by the source worker — this is intentional and will be populated per-source in 03-04 and 03-05.

## Threat Flags

No new network endpoints or auth paths. All threat model items from the plan were addressed:

| Threat | Disposition | Implementation |
|--------|-------------|----------------|
| T-03-03 SQL injection in INSERT | mitigated | All 5 values passed as `$1`–`$5` parameters |
| T-03-04 SQL injection in pg_notify payload | mitigated | Payload is `JSON.stringify({ job_id, source_id, parser_key })` — no user-controlled SQL; passed as `$1` to `pg_notify` |
| T-03-05 DoS via Redis raw content | accepted | 5-min TTL auto-expires; crawl rate limited by politeness guard |
| T-03-06 Tampering of raw Redis content | accepted | Parsers (03-04/03-05) must handle untrusted input defensively |

## Next Phase Readiness

- **03-03** (.NET Npgsql LISTEN background service): `crawler_events` channel is live. The .NET subscriber needs to `LISTEN` and parse `{ job_id, source_id, parser_key }` from the notification payload, then read `job:raw:{job_id}` from Redis.
- **03-04/03-05** (parsers): Each source worker should set `job.data.parserKey` so the NOTIFY payload carries the correct value. Currently defaults to `'unknown'`.
- No blockers. Schema (03-01) and outbox (03-02) are both applied and verified.

---
*Phase: 03-postgresql-schema-parsers-listen-notify-handoff*
*Completed: 2026-04-10*
