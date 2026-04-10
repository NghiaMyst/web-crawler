---
phase: 02-full-url-frontier-crawl-hardening
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - apps/crawler/src/services/contentHash.ts
  - apps/crawler/src/services/contentHash.test.ts
  - apps/crawler/src/producers/crawlProducer.ts
  - apps/crawler/src/workers/crawlWorker.ts
  - apps/crawler/src/services/robotsCache.ts
  - apps/crawler/src/queues/genshinQueue.ts
  - apps/crawler/src/queues/lolQueue.ts
  - apps/crawler/src/queues/anilistQueue.ts
  - apps/crawler/src/queues/mangadexQueue.ts
  - apps/crawler/src/workers/GenshinWorker.ts
  - apps/crawler/src/workers/LoLWorker.ts
  - apps/crawler/src/workers/AniListWorker.ts
  - apps/crawler/src/workers/MangaDexWorker.ts
  - apps/crawler/src/index.ts
  - docker-compose.yml
  - apps/crawler/src/services/bloomFilter.ts
  - apps/crawler/src/services/bloomFilter.test.ts
  - apps/crawler/src/services/politenessGuard.ts
  - apps/crawler/src/services/politenessGuard.test.ts
  - apps/crawler/src/services/robotsCache.test.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Reviewed 20 files spanning the Phase 02 hardening work: Bloom Filter URL deduplication, per-domain politeness guard, robots.txt caching, content-hash change detection, four new data-source workers (Genshin, LoL, AniList, MangaDex), their queues, the generic crawl worker, the entry point, and Docker Compose infrastructure.

The core services (bloomFilter, politenessGuard, robotsCache, contentHash) are well-structured with good test coverage and appropriate Redis key patterns. The graceful-shutdown flow is correct. The main concerns are a TOCTOU race in the producer, unguarded URL parsing in the worker, an unguarded JSON parse in LoLWorker, a potential unchecked nested access in AniListWorker, and a Redis OOM risk in docker-compose.

## Warnings

### WR-01: TOCTOU race condition in crawlProducer — duplicate jobs possible under concurrency

**File:** `apps/crawler/src/producers/crawlProducer.ts:15-22`
**Issue:** `isUrlSeen` and `markUrlSeen` are two separate calls with no atomicity guarantee. If two concurrent callers both invoke `enqueueCrawlJob` for the same URL simultaneously, both can pass the `isUrlSeen` check before either reaches `markUrlSeen`, resulting in the URL being enqueued twice and marked twice. The Bloom Filter is in-process memory and not process-safe under concurrent async calls at the JavaScript event-loop level for this check-then-act pattern.
**Fix:** Mark the URL _before_ the `isUrlSeen` check by using an atomic test-and-set approach, or combine the check and mark in a single operation:

```typescript
// Atomic check-and-mark: returns true if URL was already seen (no-op on insert),
// false if it was newly added.
export function checkAndMarkUrl(url: string): boolean {
  if (bloomFilter.has(url)) return true;
  bloomFilter.add(url);
  return false;
}

// In enqueueCrawlJob:
if (checkAndMarkUrl(data.url)) {
  logger.info('URL already seen -- skipping (Bloom Filter)', { ... });
  return;
}
// No separate markUrlSeen call needed
```

This collapses the window to a single synchronous operation within one event-loop tick.

---

### WR-02: `new URL(url)` in crawlWorker throws synchronously for malformed URLs — infinite BullMQ retries

**File:** `apps/crawler/src/workers/crawlWorker.ts:21`
**Issue:** `new URL(url)` throws a `TypeError` if `url` is not a valid absolute URL (e.g., empty string, relative path, non-URL string). This exception is not caught inside the worker handler, so BullMQ treats it as a transient failure and retries the job up to `attempts` times (3 by default), wasting retry quota on a permanently-bad job. If the queue has no `removeOnFail` guard, this dead job persists.
**Fix:** Wrap the URL parse in a guard and mark the job as unrecoverable by not rethrowing:

```typescript
let hostname: string;
try {
  ({ hostname } = new URL(url));
} catch {
  logger.error('Invalid URL in job data -- discarding job', { url, sourceId, jobId: job.id });
  return; // Do not rethrow — prevents BullMQ retry loop for bad input
}
```

---

### WR-03: `JSON.parse(scriptContent)` in LoLWorker throws when `#__NEXT_DATA__` script is absent

**File:** `apps/crawler/src/workers/LoLWorker.ts:43`
**Issue:** `$('script#__NEXT_DATA__').text()` returns an empty string `""` when the element is not present in the page (anti-bot interception, page structure change, or non-200 with cheerio). `JSON.parse("")` throws a `SyntaxError`, which propagates to BullMQ retry. While retrying is acceptable for transient errors, a persistent structural change (e.g., u.gg migrating away from Next.js) will cause infinite retries. Additionally, an empty-string parse error is hard to distinguish in logs from a real data error.
**Fix:** Guard with an explicit empty-check before parsing:

```typescript
const scriptContent = $('script#__NEXT_DATA__').text();
if (!scriptContent) {
  throw new Error('__NEXT_DATA__ script tag not found — page structure may have changed');
}
const nextData = JSON.parse(scriptContent) as Record<string, unknown>;
```

This produces a descriptive error message rather than a cryptic `SyntaxError: Unexpected end of JSON input`.

---

### WR-04: Unchecked nested access in AniListWorker — crashes on partial/error API response

**File:** `apps/crawler/src/workers/AniListWorker.ts:63`
**Issue:** `data.data.Page.media.length` assumes the full chain `data.data.Page.media` is always present. AniList's GraphQL API can return a response with `errors` at the top level and `data: null` (on rate-limit or server error), or `data.Page` absent on schema changes. When `data.data` is `null` or `data.data.Page` is undefined, accessing `.media.length` throws a `TypeError`, which triggers BullMQ retry rather than a structured log.
**Fix:** Use optional chaining and a null guard:

```typescript
const media = data.data?.Page?.media;
if (!media) {
  throw new Error('AniList response missing data.Page.media — check for API errors');
}
logger.info('AniList raw response', {
  sourceId: SOURCE_ID,
  jobId: job.id,
  mediaCount: media.length,
});
```

---

### WR-05: Redis `maxmemory` not configured — OOM risk with `noeviction` policy

**File:** `docker-compose.yml:22-23`
**Issue:** Redis is configured with `--maxmemory-policy noeviction` (correct for BullMQ), but no `--maxmemory` limit is set. Without a cap, Redis will grow unbounded and consume all container/host memory. On a constrained host or in a long-running crawl, this will cause an OOM kill of either Redis or another service. The Bloom Filter hashes (100k entries), content-hash keys, politeness keys, and BullMQ job data all accumulate in this Redis instance.
**Fix:** Add an explicit memory limit appropriate for the deployment environment:

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
```

Choose a `--maxmemory` value based on available host memory. With `noeviction`, Redis will return `OOM command not allowed` errors to writers when the limit is reached, which is safer than silent OOM kill. Pair with monitoring/alerting on `used_memory`.

---

## Info

### IN-01: `sourceId` truthiness check is always true — misleading guard

**File:** `apps/crawler/src/workers/crawlWorker.ts:49`
**Issue:** `if (responseBody && sourceId)` — `sourceId` is destructured from `job.data` and typed as `string` (non-optional in `CrawlJobData`). An empty string `""` would be falsy, but BullMQ job data comes from the producer which always sets it. The guard implies `sourceId` could be absent, which is misleading and may hide the real intent (only gate on `responseBody`).
**Fix:** Remove the redundant `sourceId` check:

```typescript
if (responseBody) {
  const changed = await isContentChanged(sourceId, responseBody);
  ...
}
```

If empty-string `sourceId` is a genuine concern, add explicit validation at the top of the worker alongside the URL guard (WR-02).

---

### IN-02: `api` strategy silently skips content-change detection

**File:** `apps/crawler/src/workers/crawlWorker.ts:43-55`
**Issue:** When `strategy === 'api'`, `responseBody` is never set (remains `undefined`), so `isContentChanged` is never called for API-strategy jobs. This is intentional for Phase 2 (stub comment on line 44), but there is no log message indicating the skip of content-hash logic for this path, making it hard to distinguish "API fetch with no change detection" from "response body accidentally undefined."
**Fix:** When Phase 3 implements API storage, add `responseBody` population for the `api` strategy. For now, add a log clarifying the intentional skip:

```typescript
} else {
  // api strategy: response stored directly by the worker — no HTML body to hash
  logger.info('Crawl job completed (api strategy stub)', { url, sourceId, jobId: job.id });
}
```

---

### IN-03: Bloom Filter singleton shared across test runs — potential false positives in test suite

**File:** `apps/crawler/src/services/bloomFilter.test.ts:1-26`
**Issue:** `bloomFilter` is a module-level singleton. Because Vitest (like Jest) caches modules between tests within a file, URLs marked in one test persist to subsequent tests. The current tests use globally unique URL strings to avoid collisions, which works but is fragile — a future test adding a "common" URL could unexpectedly collide with a previous test's `markUrlSeen` call.
**Fix:** Export a factory function (or reset method) alongside the singleton for test use, or isolate by resetting the filter in a `beforeEach`. A reset helper:

```typescript
// In bloomFilter.ts (test-only export pattern):
export function _resetForTest(): void {
  // Re-assign module-level filter — only used in tests
  Object.assign(bloomFilter, BloomFilter.create(100000, 0.01));
}
```

Alternatively, use `vi.resetModules()` in `beforeEach` to get a fresh singleton per test.

---

### IN-04: `robots.isAllowed(...) !== false` — fragile triple-value boolean check

**File:** `apps/crawler/src/services/robotsCache.ts:56`
**Issue:** `robots-parser`'s `isAllowed` returns `true`, `false`, or `undefined` (for paths not explicitly mentioned when the default is allow). The expression `!== false` correctly allows `undefined` paths (default-allow), which matches the D-03 permissive default. However, the intent is non-obvious and a future maintainer may "simplify" it to `=== true`, breaking the default-allow behavior.
**Fix:** Add a clarifying comment, or explicitly handle the three values:

```typescript
// isAllowed returns true (allowed), false (disallowed), or undefined (not mentioned → allow by default)
const allowed = robots.isAllowed(url, USER_AGENT);
return allowed !== false; // undefined → allow (D-03 permissive default)
```

The comment already exists in the JSDoc but not at the point of use. A one-line inline comment at line 56 is sufficient.

---

_Reviewed: 2026-04-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
