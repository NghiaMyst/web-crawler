---
phase: 2
plan: 2
subsystem: crawler
tags: [politeness, redis, rate-limiting, tdd]
dependency_graph:
  requires: []
  provides: [enforcePoliteness]
  affects: [crawlWorker.ts (Plan 05)]
tech_stack:
  added: []
  patterns: [Redis timestamp tracking, per-domain isolation, fake timers testing]
key_files:
  created:
    - apps/crawler/src/services/politenessGuard.ts
    - apps/crawler/src/services/politenessGuard.test.ts
  modified: []
key_decisions:
  - Redis timestamp approach (D-01) chosen over per-domain BullMQ queues for simplicity and cross-job coordination
  - KEY_TTL_S = 10s to avoid stale keys without risking key expiry during active crawl window
metrics:
  duration: 76s
  completed_date: "2026-04-09"
  tasks_completed: 1
  files_changed: 2
---

# Phase 2 Plan 2: Per-Domain Politeness Guard Summary

## One-liner

Redis timestamp-based politeness guard enforcing 2s minimum inter-domain delay via `crawl:politeness:{domain}` keys with 10s TTL.

## What Was Built

A standalone service module implementing per-domain crawl rate limiting per D-01. The `enforcePoliteness(domain)` function uses Redis GET/SET to track last-request timestamps per domain, computing elapsed time and waiting only the remaining portion of the 2-second window before dispatching. Different domains do not block each other.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 2-02-01 RED | Add failing tests for politeness guard | 193925f | politenessGuard.test.ts |
| 2-02-01 GREEN | Implement per-domain politeness guard | 65c3bfb | politenessGuard.ts |

## Verification Results

All 11 tests passing (7 politeness guard + 4 bloom filter):

- resolves without delay when Redis returns null (first visit)
- waits when last timestamp is within politeness window
- resolves immediately when last timestamp is older than POLITENESS_DELAY_MS
- uses the crawl:politeness:{domain} key pattern
- does not delay requests to different domains independently
- exports POLITENESS_DELAY_MS = 2000
- exports KEY_TTL_S = 10

## Acceptance Criteria

- [x] `apps/crawler/src/services/politenessGuard.ts` exports `enforcePoliteness`
- [x] `apps/crawler/src/services/politenessGuard.ts` contains `crawl:politeness:${domain}` key pattern
- [x] `apps/crawler/src/services/politenessGuard.ts` contains `POLITENESS_DELAY_MS = 2000`
- [x] `apps/crawler/src/services/politenessGuard.ts` imports `connection` from `../connection.js`
- [x] `apps/crawler/src/services/politenessGuard.test.ts` has 7 test cases (>= 3 required)
- [x] `apps/crawler/src/services/politenessGuard.test.ts` mocks the Redis connection (vi.mock)
- [x] `pnpm --filter @web-crawler/crawler test` exits 0 with all tests passing

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - the implementation is fully functional with mocked Redis in tests. The service will be wired into crawlWorker.ts in Plan 05.

## Threat Surface

The threat model identifies T-02-02 (Denial of Service to target). The `enforcePoliteness` function correctly mitigates this by enforcing 2s minimum delay per domain. No new security surface introduced beyond what was planned.

## Self-Check: PASSED

- `apps/crawler/src/services/politenessGuard.ts` - FOUND
- `apps/crawler/src/services/politenessGuard.test.ts` - FOUND
- Commit 193925f - test(02-02): FOUND
- Commit 65c3bfb - feat(02-02): FOUND
