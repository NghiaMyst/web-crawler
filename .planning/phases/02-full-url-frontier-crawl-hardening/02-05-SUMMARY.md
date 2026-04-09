---
phase: 02-full-url-frontier-crawl-hardening
plan: "05"
subsystem: crawler
tags: [bullmq, bloom-filter, politeness, robots-txt, content-hash, crawl-guard]

requires:
  - phase: 02-full-url-frontier-crawl-hardening
    provides: "bloomFilter service (isUrlSeen/markUrlSeen), politenessGuard (enforcePoliteness), robotsCache (isUrlAllowed), contentHash (isContentChanged)"

provides:
  - "crawlProducer.ts with Bloom Filter dedup at enqueue time"
  - "crawlWorker.ts with full pre-fetch guard chain: politeness -> robots.txt -> fetch -> content hash"
  - "Verified BullMQ retry config (3 attempts, exponential 5s) and DLQ (removeOnFail count: 500)"

affects: [06-source-specific-workers, phase-10-deploy]

tech-stack:
  added: []
  patterns:
    - "Guard chain pattern: politeness -> robots.txt check -> fetch -> content hash (RESEARCH.md Pattern 5)"
    - "Bloom Filter dedup at producer level, not worker level (retries are not re-checked)"
    - "Disallowed URLs complete without throwing (policy skip, not failure)"

key-files:
  created: []
  modified:
    - apps/crawler/src/producers/crawlProducer.ts
    - apps/crawler/src/workers/crawlWorker.ts
    - apps/crawler/src/services/robotsCache.ts

key-decisions:
  - "Bloom Filter check at producer (enqueue) level, not worker level — BullMQ retries reuse same job, filter must not block retry attempts"
  - "Disallowed robots.txt URLs return (complete) rather than throw — policy skip is not a failure"
  - "crawlQueue.ts retry/DLQ config verified correct (D-05/D-06), no changes made"
  - "robots-parser CJS/ESM interop fixed with import * as + .default fallback pattern"

patterns-established:
  - "Guard chain order: enforcePoliteness(hostname) -> isUrlAllowed(url) -> fetch -> isContentChanged(sourceId, body)"
  - "responseBody captured from both cheerio (rawHtml) and playwright (html) branches before content hash check"

requirements-completed:
  - CRAWL-08
  - CRAWL-09

duration: 18min
completed: 2026-04-09
---

# Phase 2 Plan 05: Wire Guards into crawlWorker + Retry and Dead-Letter Verification Summary

**Four guard services wired into live crawl pipeline: Bloom Filter at enqueue, politeness+robots.txt pre-fetch, content hash post-fetch in crawlWorker**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-09T17:19:08Z
- **Completed:** 2026-04-09T17:36:40Z
- **Tasks:** 2
- **Files modified:** 3 (crawlProducer.ts, crawlWorker.ts, robotsCache.ts)

## Accomplishments

- Wired Bloom Filter dedup into `crawlProducer.ts` — URLs seen before are skipped at enqueue with log, marked before enqueue to prevent concurrent duplicates
- Wired full guard chain into `crawlWorker.ts` — politeness delay, robots.txt check, and content hash dedup all execute in correct order (Pattern 5 from RESEARCH.md)
- Verified `crawlQueue.ts` retry config (3 attempts, exponential 5s) and dead-letter retention (removeOnFail: 500) satisfy CRAWL-08 and CRAWL-09 — no changes needed
- Fixed `robotsCache.ts` CJS/ESM interop bug — `robots-parser` default export not callable under Node16 module resolution

## Task Commits

1. **Task 1: Add Bloom Filter check to crawlProducer** - `6880a50` (feat)
2. **Task 2: Wire politeness, robots.txt, and content hash guards into crawlWorker** - `5bf9161` (feat)

## Files Created/Modified

- `apps/crawler/src/producers/crawlProducer.ts` - Added isUrlSeen check + markUrlSeen before crawlQueue.add
- `apps/crawler/src/workers/crawlWorker.ts` - Added pre-fetch guard chain (politeness, robots.txt) and post-fetch content hash check
- `apps/crawler/src/services/robotsCache.ts` - Fixed CJS/ESM interop for robots-parser (auto-fix, Rule 1)

## Decisions Made

- Bloom Filter operates at producer level only. BullMQ retries re-run the worker for the same job object, so a retry must NOT be blocked by the Bloom Filter. Marking at enqueue prevents duplicate new jobs without interfering with retry semantics.
- Disallowed URLs complete cleanly (return, not throw) so they don't consume retry attempts and don't land in the dead-letter queue. This is intentional per D-03.
- crawlQueue.ts was verified unchanged — `attempts: 3`, `backoff: exponential 5000ms`, `removeOnFail: { count: 500 }` already correct per D-05/D-06.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed robots-parser CJS/ESM interop under Node16 module resolution**
- **Found during:** Task 1 (initial type-check run)
- **Issue:** `import robotsParser from 'robots-parser'` produced TS2349 "This expression is not callable" — robots-parser ships a CJS module; under Node16 moduleResolution with esModuleInterop, the default import resolves to a namespace object rather than the callable function
- **Fix:** Changed to `import * as robotsParserModule from 'robots-parser'` with `const robotsParser = (robotsParserModule as any).default ?? robotsParserModule` to handle both the CJS `.default` wrapper and direct module shapes
- **Files modified:** `apps/crawler/src/services/robotsCache.ts`
- **Verification:** `pnpm --filter @web-crawler/crawler run type-check` exits 0; all 5 robotsCache tests pass
- **Committed in:** `5bf9161` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix was necessary for type safety and correct runtime behavior. No scope creep.

## Issues Encountered

- Worktree was based on `256857b` (the merge commit) which did not contain the Wave 1 service files in its working tree. Files were restored via `git checkout HEAD --` to re-populate the index before staging Task 1 changes.

## Next Phase Readiness

- All four guard services are wired and tested. crawlWorker now enforces the full guard chain per the threat model.
- Plan 06 (source-specific workers) can proceed — each new worker type will call `enforcePoliteness` independently per T-02-06 mitigation.
- No blockers.

---
*Phase: 02-full-url-frontier-crawl-hardening*
*Completed: 2026-04-09*
