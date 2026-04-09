---
phase: 02-full-url-frontier-crawl-hardening
plan: "02"
subsystem: crawler
tags: [redis, ioredis, politeness, rate-limiting, vitest, tdd]

requires:
  - phase: 02-full-url-frontier-crawl-hardening
    plan: "01"
    provides: Redis connection singleton via apps/crawler/src/connection.ts

provides:
  - Redis-backed per-domain politeness guard enforcing 2s minimum delay between requests
  - enforcePoliteness(domain) async function exported from politenessGuard.ts
  - POLITENESS_DELAY_MS and KEY_TTL_S constants for downstream consumers

affects:
  - plan 02-05 (crawlWorker.ts wiring — calls enforcePoliteness before each fetch)

tech-stack:
  added: []
  patterns:
    - "Redis timestamp pattern: GET lastTs, compute elapsed, sleep remainder, SET actual dispatch time"
    - "TDD with vitest fake timers and vi.mock for Redis dependency isolation"

key-files:
  created:
    - apps/crawler/src/services/politenessGuard.ts
    - apps/crawler/src/services/politenessGuard.test.ts
  modified: []

key-decisions:
  - "Used Redis GET/SET timestamp pattern (not BullMQ delay queues) per D-01 decision"
  - "KEY_TTL_S=10 chosen: only ~2s check window needed; short TTL avoids Redis key accumulation"
  - "SET called after delay (not before): records actual dispatch time, not check time"
  - "vi.useFakeTimers: null path tested by not advancing time (hangs if setTimeout incorrectly scheduled)"

patterns-established:
  - "Politeness guard pattern: GET timestamp → compute elapsed → sleep remainder → SET dispatch time"
  - "Test pattern: fake timers + vi.mock for Redis — no live Redis required in unit tests"

requirements-completed:
  - CRAWL-05

duration: 8min
completed: 2026-04-09
---

# Phase 02 Plan 02: Per-Domain Politeness Guard Summary

**Redis-backed per-domain politeness guard using GET/SET timestamp pattern enforcing 2s minimum delay between requests to the same domain**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-09T06:25:00Z
- **Completed:** 2026-04-09T06:33:00Z
- **Tasks:** 1 (TDD: test + implementation commits)
- **Files modified:** 2

## Accomplishments

- Created `enforcePoliteness(domain)` that enforces 2000ms minimum delay per domain via Redis timestamps
- Tests use vitest fake timers with mocked Redis connection — no live Redis dependency in unit tests
- Correctly implements the "record actual dispatch time after delay" pattern (not check time)
- Different domains are completely independent — no cross-domain delays

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Per-domain politeness guard tests** - `33353b1` (test)
2. **Task 1 (GREEN): Per-domain politeness guard implementation** - `8b5e7dc` (feat)

## Files Created/Modified

- `apps/crawler/src/services/politenessGuard.ts` - Redis-based politeness enforcement; exports `enforcePoliteness`, `POLITENESS_DELAY_MS`, `KEY_TTL_S`
- `apps/crawler/src/services/politenessGuard.test.ts` - 5 unit tests covering null path, partial wait, full elapsed, correct Redis key format, and domain independence

## Decisions Made

- Used `connection.get` / `connection.set` directly (not BullMQ delay queues) — per D-01 architectural decision
- `KEY_TTL_S = 10` (short TTL): the Redis key is only needed during the ~2s check window; long-lived keys would accumulate unnecessarily
- SET is called after the delay (not before) to record actual dispatch time — prevents timing drift if multiple workers race

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test assertion for null-path no-delay case**
- **Found during:** Task 1 (TDD GREEN — running tests)
- **Issue:** Original test used `Date.now() - start < 100` to verify no delay, but with `vi.useFakeTimers()` advancing time by 3000ms made that assertion fail even when no setTimeout was scheduled
- **Fix:** Changed test to not advance fake timers on the null path — if a setTimeout were incorrectly scheduled, the promise would hang (test timeout catches it), proving the correct behavior without time measurement
- **Files modified:** apps/crawler/src/services/politenessGuard.test.ts
- **Verification:** All 5 politeness guard tests pass + 4 bloom filter tests
- **Committed in:** 8b5e7dc (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test assertion logic)
**Impact on plan:** Test assertion corrected for fake-timer environment. No scope creep.

## Issues Encountered

- Worktree branch was based on `e803b39` (before Phase 02-01 commits). Reset to `5158d81` was needed before execution. After `git reset --soft`, working tree files were absent — required `git reset HEAD && git checkout -- .` to restore them.

## Known Stubs

None — `enforcePoliteness` is fully functional; no hardcoded values or placeholders.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. The function is an internal coordination utility using an existing Redis connection.

## Next Phase Readiness

- `enforcePoliteness` is ready to be wired into `crawlWorker.ts` in Plan 02-05
- No blockers; no external service configuration required

---
*Phase: 02-full-url-frontier-crawl-hardening*
*Completed: 2026-04-09*
