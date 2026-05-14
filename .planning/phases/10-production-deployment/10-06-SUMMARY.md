---
phase: 10
plan: "06"
subsystem: crawler
tags:
  - bloom-filter
  - redis
  - persistence
  - gap-closure
dependency_graph:
  requires:
    - "10-01"  # Redis AOF persistence (ensures bloom:filter key survives restarts)
    - "10-04"  # verify-bloom-persistence.sh script that validates DEPLOY-05
  provides:
    - "DEPLOY-05"  # Redis-backed bloom filter persistence on crawler restart
  affects:
    - apps/crawler/src/services/bloomFilter.ts
    - apps/crawler/src/index.ts
tech_stack:
  added: []
  patterns:
    - "Redis GET/SETEX for bloom filter serialization with 7-day TTL"
    - "Graceful shutdown additionalCleanup callback for bloom state persistence"
    - "vi.mock at module level for ioredis mocking in vitest"
key_files:
  created: []
  modified:
    - apps/crawler/src/services/bloomFilter.ts
    - apps/crawler/src/index.ts
    - apps/crawler/src/services/bloomFilter.test.ts
decisions:
  - "bloom:filter Redis key with TTL 604800 (7 days) — long enough to survive any expected restart cycle, matches BLOOM_KEY_PREFIX='bloom:' in verify-bloom-persistence.sh"
  - "loadBloomFilter uses try-catch to fall back to fresh in-memory filter on Redis error — addresses T-10-22 (corrupt data / Redis unavailable on startup)"
  - "saveBloomFilter runs as first statement in additionalCleanup — after worker.close() drains in-flight jobs, before connection.quit() closes Redis"
  - "bloomFilter exported as let (not const) to allow module-level reassignment in loadBloomFilter"
metrics:
  duration_seconds: 130
  completed_date: "2026-05-14T01:55:44Z"
  tasks_completed: 3
  files_modified: 3
---

# Phase 10 Plan 06: Bloom Filter Redis Persistence Summary

Redis-backed bloom filter persistence: `loadBloomFilter()` + `saveBloomFilter()` close the DEPLOY-05 / SC-4 gap so crawler URL dedup state survives restarts via Redis AOF.

## Objective Achieved

The bloom filter was previously in-memory only — state lost on every crawler restart. This plan implements the Redis persistence that was explicitly deferred in the source code ("Redis persistence deferred to Phase 10"). After this plan:

- Crawler startup: `GET bloom:filter` restores the BloomFilter singleton from Redis if the key exists.
- Crawler SIGTERM: `SETEX bloom:filter 604800 <json>` writes the serialized bit array before the Redis connection closes.
- `scripts/verify-bloom-persistence.sh` (Plan 10-04) can now find `bloom:*` keys in Redis and validate DEPLOY-05.

## Files Changed

### `apps/crawler/src/services/bloomFilter.ts`

**Changes:**
- Added `import { connection } from '../connection.js'` — uses the existing ioredis instance
- Changed `export const bloomFilter` to `export let bloomFilter` — enables module-level reassignment in `loadBloomFilter()`
- Removed the "Redis persistence deferred to Phase 10" comment — it is now implemented
- Added `loadBloomFilter(): Promise<void>` — calls `connection.get('bloom:filter')`, if non-null calls `BloomFilter.fromJSON(JSON.parse(data))` to restore the singleton; wrapped in try-catch to fall back to fresh filter on corrupt data or Redis unavailability
- Added `saveBloomFilter(): Promise<void>` — calls `connection.setex('bloom:filter', 604800, JSON.stringify(bloomFilter.saveAsJSON()))`
- `isUrlSeen()` and `markUrlSeen()` signatures and behavior are UNCHANGED — no callers (`crawlProducer.ts`) require updating

### `apps/crawler/src/index.ts`

**Changes:**
- Added `import { loadBloomFilter, saveBloomFilter } from './services/bloomFilter.js'`
- Added `await loadBloomFilter()` immediately after `logger.info('Crawler service starting', ...)` — before `browserPool.initialize()`, before any `createCrawlWorker()` or other worker creation calls
- Added `await saveBloomFilter()` as the first statement inside the `additionalCleanup` async callback passed to `setupGracefulShutdown` — before `browserPool.closeAll()`

### `apps/crawler/src/services/bloomFilter.test.ts`

**Changes:**
- Added `vi.mock('../connection.js', ...)` at module level (hoisted by vitest) providing mocked `connection.get` and `connection.setex`
- Reorganized original 4 tests into a `'Bloom Filter in-memory operations'` describe block (unchanged behavior)
- Added `'Bloom Filter Redis persistence'` describe block with 5 new tests:
  1. `loadBloomFilter starts fresh when Redis key does not exist` — verifies `connection.get('bloom:filter')` is called
  2. `loadBloomFilter restores previously-seen URLs from Redis` — serializes a pre-populated filter, mocks Redis to return it, asserts `isUrlSeen` returns true for a previously-added URL
  3. `loadBloomFilter falls back to a fresh filter when Redis data is corrupt` — mocks corrupt JSON string, asserts no throw
  4. `saveBloomFilter writes to bloom:filter with TTL 604800` — asserts `connection.setex` called with correct key and TTL
  5. `saveBloomFilter serializes a round-trip-valid JSON blob` — deserializes the stored blob via `BloomFilter.fromJSON`, asserts `has()` returns true

**Test result:** 27/27 tests pass (vitest exits 0).

## Redis Key Convention

| Key | TTL | Purpose |
|-----|-----|---------|
| `bloom:filter` | 604800s (7 days) | Serialized BloomFilter JSON (bit array + metadata only — no URL strings stored) |

The key prefix `bloom:` matches `BLOOM_KEY_PREFIX='bloom:'` in `scripts/verify-bloom-persistence.sh` so the verification script finds the key correctly.

## Manual Validation

1. Start the crawler stack: `docker compose -f docker-compose.prod.yml up -d`
2. Trigger at least one crawl job (URLs must be enqueued and processed for `markUrlSeen` to be called)
3. Send SIGTERM to the crawler container: `docker compose -f docker-compose.prod.yml kill -s SIGTERM crawler`
4. Inspect Redis: `docker compose -f docker-compose.prod.yml exec redis redis-cli GET bloom:filter`
   - Expected: returns a non-null JSON string starting with `{"type":"BloomFilter",...}`
5. Restart Redis (AOF round-trip): `docker compose -f docker-compose.prod.yml restart redis`
6. Verify key survived: `docker compose -f docker-compose.prod.yml exec redis redis-cli GET bloom:filter`
   - Expected: same non-null JSON string (Redis AOF persisted it)
7. Run the automated verification: `bash scripts/verify-bloom-persistence.sh`
   - Expected: exits 0

## Open Items

- `docs/deployment/persistence-validation.md` (authored in Plan 10-05 deploy runbook) should note that `verify-bloom-persistence.sh` requires a crawl to have occurred first — the `bloom:filter` key is only written to Redis after at least one URL has been processed and the crawler receives SIGTERM.
- Pre-existing type error in `apps/crawler/src/workers/FootballDataWorker.ts` (cannot find module `@web-crawler/shared-types`) is unrelated to this plan and was present before these changes. Logged as deferred item.

## Deviations from Plan

None — plan executed exactly as written.

The pre-existing TypeScript error in `FootballDataWorker.ts` (`Cannot find module '@web-crawler/shared-types'`) is out-of-scope — confirmed present before any changes via `git stash` verification. Not introduced by this plan.

## Self-Check: PASSED

Files exist:
- FOUND: apps/crawler/src/services/bloomFilter.ts
- FOUND: apps/crawler/src/index.ts
- FOUND: apps/crawler/src/services/bloomFilter.test.ts
- FOUND: .planning/phases/10-production-deployment/10-06-SUMMARY.md

Commits exist:
- f97a839: feat(10-06): implement Redis-backed bloom filter persistence
- 086da70: feat(10-06): wire bloom filter load/save lifecycle in crawler startup and shutdown
- 7d5f42c: test(10-06): add Redis persistence tests for bloom filter
