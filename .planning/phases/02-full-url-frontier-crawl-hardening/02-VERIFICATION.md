---
phase: 02-full-url-frontier-crawl-hardening
verified: 2026-04-09T19:32:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run crawler service with all five source workers and observe live log output showing raw responses from each source"
    expected: "Logs show 'Genshin raw response', 'u.gg tier list raw data', 'AniList raw response', 'MangaDex raw response', and existing football-data.org output — each with non-empty data payload"
    why_human: "Workers make external HTTP calls to live third-party APIs (HoYoWiki, u.gg, AniList GraphQL, MangaDex). Can't invoke these from a test environment without running the full service against Redis."
  - test: "Submit the same URL twice via enqueueCrawlJob and verify only one BullMQ job appears in queue"
    expected: "Second call is skipped with log 'URL already seen -- skipping (Bloom Filter)'; only one job ID created"
    why_human: "Requires live Redis + BullMQ instance to inspect queue state. The dedup logic is code-verified but the end-to-end BullMQ queue behavior is observable only at runtime."
  - test: "Configure a test domain with 'Disallow: /' in robots.txt mock and submit a crawl job for it; verify it completes (not fails) with a disallowed log"
    expected: "Job transitions to completed state (not failed), log shows 'URL disallowed by robots.txt -- skipping'"
    why_human: "Requires live Redis + BullMQ worker running. The in-code logic is verified but the BullMQ job lifecycle (completed vs failed for disallowed) must be observed at runtime."
  - test: "Submit a crawl job that will fail 3 times (e.g., unreachable URL) and verify it lands in dead-letter state"
    expected: "After 3 attempts with exponential backoff (5s, 10s, 20s), job appears in BullMQ failed set with removeOnFail: {count: 500} retention"
    why_human: "Requires live BullMQ + Redis with actual retry execution. crawlQueue.ts configuration is code-verified (attempts:3, exponential 5000ms, removeOnFail count:500) but the runtime behavior must be observed."
---

# Phase 2: Full URL Frontier & Crawl Hardening Verification Report

**Phase Goal:** The crawler enforces all production-quality crawling constraints — Bloom Filter URL dedup, per-domain politeness, robots.txt compliance, retry with exponential backoff, dead-letter queue — and all five configured data sources successfully produce raw crawl results.
**Verified:** 2026-04-09T19:32:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Submitting the same URL twice results in exactly one crawl job (Bloom Filter blocks the duplicate) | ✓ VERIFIED | `crawlProducer.ts` lines 15-21: `isUrlSeen` check before `crawlQueue.add`, `markUrlSeen` called before enqueue, log 'URL already seen -- skipping (Bloom Filter)'. `bloomFilter.ts` exports `isUrlSeen`/`markUrlSeen` backed by `BloomFilter.create(100000, 0.01)` singleton. |
| 2 | Two requests to the same domain are separated by at least 2 seconds | ✓ VERIFIED | `politenessGuard.ts`: `POLITENESS_DELAY_MS = 2000`, Redis key `crawl:politeness:{domain}`, computes `remaining = POLITENESS_DELAY_MS - elapsed` and awaits. Wired into `crawlWorker.ts` line 24: `await enforcePoliteness(hostname)` before fetch. 7 unit tests passing. |
| 3 | A domain with `Disallow: /` in robots.txt is never crawled (job created but skipped) | ✓ VERIFIED | `robotsCache.ts`: `isUrlAllowed(url)` fetches/caches robots.txt, returns `robots.isAllowed(url, USER_AGENT) !== false`. `crawlWorker.ts` lines 28-32: checks `allowed`, returns (not throws) with log 'URL disallowed by robots.txt -- skipping'. 5 unit tests passing. |
| 4 | A crawl job that fails three times transitions to dead-letter state | ✓ VERIFIED | `crawlQueue.ts`: `attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnFail: { count: 500 }`. Verified unchanged in Plan 05. All four new queues use the same retry config. |
| 5 | All five sources produce raw crawl output in logs | ✓ VERIFIED (code) / ? HUMAN | SRC-01 (FootballDataWorker — existing). GenshinWorker logs `'Genshin raw response'` with `data`. LoLWorker logs `'u.gg tier list raw data'` with `dataKeys`. AniListWorker logs `'AniList raw response'` with `mediaCount`. MangaDexWorker logs `'MangaDex raw response'` with `chapterCount`. All four registered in `index.ts` with schedulers. Runtime confirmation requires live execution. |

**Score:** 5/5 truths verified (code-level); 4 require human runtime confirmation

### Note on CRAWL-06 FP Rate

REQUIREMENTS.md specifies "0.1% false positive" but implementation uses `BloomFilter.create(100000, 0.01)` = 1% FP. This is intentional per D-02 (CONTEXT.md line 22) and RESEARCH.md Pitfall 4 — D-02 locked 1% for Phase 2; the stricter 0.1% is deferred to Phase 10 (DEPLOY-05) if revisited. This deviation is documented and accepted in the phase design documents.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/crawler/src/services/bloomFilter.ts` | Bloom Filter singleton, isUrlSeen/markUrlSeen | ✓ VERIFIED | Exports `bloomFilter`, `isUrlSeen`, `markUrlSeen`; `BloomFilter.create(100000, 0.01)` |
| `apps/crawler/src/services/bloomFilter.test.ts` | Unit tests for Bloom Filter | ✓ VERIFIED | 4 tests, all passing |
| `apps/crawler/vitest.config.ts` | Vitest config for crawler package | ✓ VERIFIED | `environment: 'node'`, `globals: false` |
| `apps/crawler/src/services/politenessGuard.ts` | Redis-based per-domain politeness | ✓ VERIFIED | Exports `enforcePoliteness`, `POLITENESS_DELAY_MS=2000`, `KEY_TTL_S=10` |
| `apps/crawler/src/services/politenessGuard.test.ts` | Unit tests for politeness guard | ✓ VERIFIED | 7 tests, all passing |
| `apps/crawler/src/services/robotsCache.ts` | robots.txt fetch, Redis cache, allow check | ✓ VERIFIED | Exports `isUrlAllowed`; CACHE_TTL_S=86400; USER_AGENT='PersonalCrawlerBot/1.0'; ESM interop fixed |
| `apps/crawler/src/services/robotsCache.test.ts` | Unit tests for robots cache | ✓ VERIFIED | 5 tests, all passing |
| `apps/crawler/src/services/contentHash.ts` | MD5 content hash with Redis | ✓ VERIFIED | Exports `isContentChanged`; `createHash('md5')`; key `crawl:hash:{sourceId}` |
| `apps/crawler/src/services/contentHash.test.ts` | Unit tests for content hash | ✓ VERIFIED | 6 tests including MD5 known-value check, all passing |
| `apps/crawler/src/workers/crawlWorker.ts` | Pre-fetch guard chain + post-fetch content hash | ✓ VERIFIED | Imports all 3 guards; enforcePoliteness → isUrlAllowed → fetch → isContentChanged in correct order |
| `apps/crawler/src/producers/crawlProducer.ts` | Bloom Filter check at enqueue time | ✓ VERIFIED | `isUrlSeen` check + `markUrlSeen` before `crawlQueue.add` |
| `apps/crawler/src/workers/GenshinWorker.ts` | HoYoWiki API + cheerioFetch fallback worker | ✓ VERIFIED | Exports `createGenshinWorker`; HoYoWiki primary, hoyolab.com fallback; logs raw response |
| `apps/crawler/src/workers/LoLWorker.ts` | u.gg __NEXT_DATA__ extraction worker | ✓ VERIFIED | Exports `createLoLWorker`; `$('script#__NEXT_DATA__')`; RIOT_API_KEY warning at import |
| `apps/crawler/src/workers/AniListWorker.ts` | AniList GraphQL airing schedule worker | ✓ VERIFIED | Exports `createAniListWorker`; posts to `https://graphql.anilist.co`; RELEASING + POPULARITY_DESC |
| `apps/crawler/src/workers/MangaDexWorker.ts` | MangaDex chapter feed worker | ✓ VERIFIED | Exports `createMangaDexWorker`; `https://api.mangadex.org/chapter?order[publishAt]=desc&limit=10` |
| `apps/crawler/src/queues/genshinQueue.ts` | BullMQ queue crawl-genshin | ✓ VERIFIED | Queue name `crawl-genshin`, attempts:3, exponential 5000ms, removeOnFail count:500 |
| `apps/crawler/src/queues/lolQueue.ts` | BullMQ queue crawl-lol | ✓ VERIFIED | Queue name `crawl-lol`, same retry config |
| `apps/crawler/src/queues/anilistQueue.ts` | BullMQ queue crawl-anilist | ✓ VERIFIED | Queue name `crawl-anilist`, same retry config |
| `apps/crawler/src/queues/mangadexQueue.ts` | BullMQ queue crawl-mangadex | ✓ VERIFIED | Queue name `crawl-mangadex`, same retry config |
| `apps/crawler/src/index.ts` | All workers registered, schedulers, graceful shutdown | ✓ VERIFIED | All 4 new workers imported, instantiated, scheduled, closed in shutdown |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `crawlProducer.ts` | `bloomFilter.ts` | `import { isUrlSeen, markUrlSeen }` | ✓ WIRED | Line 3: import confirmed; lines 15, 22: `isUrlSeen(data.url)` and `markUrlSeen(data.url)` called |
| `crawlWorker.ts` | `politenessGuard.ts` | `import { enforcePoliteness }` | ✓ WIRED | Line 6: import; line 24: `await enforcePoliteness(hostname)` before fetch |
| `crawlWorker.ts` | `robotsCache.ts` | `import { isUrlAllowed }` | ✓ WIRED | Line 7: import; line 28: `const allowed = await isUrlAllowed(url)` |
| `crawlWorker.ts` | `contentHash.ts` | `import { isContentChanged }` | ✓ WIRED | Line 8: import; lines 50-54: `await isContentChanged(sourceId, responseBody)` post-fetch |
| `politenessGuard.ts` | `connection.ts` | `import { connection }` | ✓ WIRED | Line 1: import; `connection.get(key)` and `connection.set(key, ...)` |
| `robotsCache.ts` | `connection.ts` | `import { connection }` | ✓ WIRED | Line 3: import; `connection.get(cacheKey)` and `connection.set(cacheKey, ...)` |
| `robotsCache.ts` | `robots-parser` | `import * as robotsParserModule` | ✓ WIRED | Lines 2-7: import with CJS/ESM interop fix; `robotsParser(robotsUrl, robotsTxt)` called |
| `contentHash.ts` | `node:crypto` | `import { createHash }` | ✓ WIRED | Line 1: import; `createHash('md5').update(body).digest('hex')` |
| `index.ts` | `GenshinWorker.ts` | `import { createGenshinWorker }` | ✓ WIRED | Line 11: import; line 31: `createGenshinWorker()` |
| `index.ts` | `LoLWorker.ts` | `import { createLoLWorker }` | ✓ WIRED | Line 12: import; line 32: `createLoLWorker()` |
| `index.ts` | `AniListWorker.ts` | `import { createAniListWorker }` | ✓ WIRED | Line 13: import; line 33: `createAniListWorker()` |
| `index.ts` | `MangaDexWorker.ts` | `import { createMangaDexWorker }` | ✓ WIRED | Line 14: import; line 34: `createMangaDexWorker()` |

### Data-Flow Trace (Level 4)

Workers in this phase are log-only (Phase 2 goal: raw crawl output in logs, no storage). Data flows directly from external HTTP response → logger.info call. No state rendering or component props involved.

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `GenshinWorker.ts` | `data` | `axios.get(hoyowiki-api)` with `cheerioFetch` fallback | HTTP response from live API | ✓ FLOWING (code-level; runtime confirms) |
| `LoLWorker.ts` | `nextData` | `axios.get('https://u.gg/lol/tier-list')` + cheerio parse | Live page __NEXT_DATA__ | ✓ FLOWING (code-level; runtime confirms) |
| `AniListWorker.ts` | `data.data.Page.media` | `axios.post('https://graphql.anilist.co')` | Live GraphQL API | ✓ FLOWING (code-level; runtime confirms) |
| `MangaDexWorker.ts` | `data.data` | `axios.get('https://api.mangadex.org/chapter...')` | Live REST API | ✓ FLOWING (code-level; runtime confirms) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 22 unit tests pass (all service modules) | `pnpm --filter @web-crawler/crawler test` | 22/22 passed, 4 test files | ✓ PASS |
| TypeScript type-check passes | `pnpm --filter @web-crawler/crawler run type-check` | exits 0, no errors | ✓ PASS |
| bloomFilter exports singleton | Read `bloomFilter.ts` | `BloomFilter.create(100000, 0.01)` singleton exported | ✓ PASS |
| crawlQueue retry config unchanged | Read `crawlQueue.ts` | `attempts:3, exponential delay:5000, removeOnFail:{count:500}` | ✓ PASS |
| All queue names are kebab-case (no colons) | Read queue files | `crawl-genshin`, `crawl-lol`, `crawl-anilist`, `crawl-mangadex` | ✓ PASS |
| RIOT_API_KEY in docker-compose.yml | Grep `docker-compose.yml` | `RIOT_API_KEY=${RIOT_API_KEY:-}` on line 39 | ✓ PASS |
| Live source workers produce HTTP data | Requires running service | Cannot test without live Redis + external APIs | ? SKIP (see Human Verification) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CRAWL-04 | 02-03 | robots.txt per domain, cached 24h | ✓ SATISFIED | `robotsCache.ts`: `CACHE_TTL_S=86400`, `isUrlAllowed`, `crawl:robots:{hostname}`, 5 tests |
| CRAWL-05 | 02-02 | Per-domain politeness, min 2s | ✓ SATISFIED | `politenessGuard.ts`: `POLITENESS_DELAY_MS=2000`, wired in `crawlWorker.ts`, 7 tests |
| CRAWL-06 | 02-01 | URL dedup via Bloom Filter (100k, 1% FP per D-02) | ✓ SATISFIED | `bloomFilter.ts`: `BloomFilter.create(100000, 0.01)`, wired in `crawlProducer.ts`, 4 tests. Note: 1% FP vs 0.1% in REQUIREMENTS.md is intentional per D-02 |
| CRAWL-07 | 02-04 | Content dedup via MD5 hash | ✓ SATISFIED | `contentHash.ts`: `createHash('md5')`, `crawl:hash:{sourceId}`, wired post-fetch in `crawlWorker.ts`, 6 tests |
| CRAWL-08 | 02-05 | Retry max 3, exponential backoff 5s | ✓ SATISFIED | `crawlQueue.ts`: `attempts:3, backoff:{type:'exponential',delay:5000}` — verified unchanged; same config in all 4 new queues |
| CRAWL-09 | 02-05 | Dead-letter state after exhausted retries | ✓ SATISFIED | `crawlQueue.ts`: `removeOnFail:{count:500}` — BullMQ failed set with 500-job retention confirmed |
| SRC-02 | 02-06 | Genshin Impact events via HoYoWiki + event page | ✓ SATISFIED | `GenshinWorker.ts`: HoYoWiki API primary, `cheerioFetch` fallback; logs raw response; registered in index.ts |
| SRC-03 | 02-06 | LoL tier list via Riot API + u.gg __NEXT_DATA__ | ✓ SATISFIED | `LoLWorker.ts`: axios fetches u.gg, `$('script#__NEXT_DATA__')` extracts JSON, RIOT_API_KEY warning; registered in index.ts |
| SRC-04 | 02-06 | Anime airing schedule via AniList GraphQL | ✓ SATISFIED | `AniListWorker.ts`: POSTs to `https://graphql.anilist.co`, RELEASING+POPULARITY_DESC, logs mediaCount; registered in index.ts |
| SRC-05 | 02-06 | Manga chapters via MangaDex API | ✓ SATISFIED | `MangaDexWorker.ts`: GETs `https://api.mangadex.org/chapter?order[publishAt]=desc&limit=10`, logs chapterCount; registered in index.ts |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `crawlWorker.ts` | 43-44 | `logger.info('Crawl job completed (stub)', ...)` in `else` branch for unknown strategy | ℹ️ Info | Cosmetic — the stub log fires when strategy is neither 'cheerio' nor 'playwright'. This is the fallback for the 'api' strategy type declared in `CrawlJobData`. Phase 3 will fill this in. Does not block phase goal. |

No blockers found. No FIXME/TODO anti-patterns in any Phase 2 service files. No empty implementations in the guard chain.

### Human Verification Required

#### 1. Five Sources Produce Raw Crawl Output in Live Logs

**Test:** Start the crawler service (`pnpm dev` or Docker Compose). Wait for scheduler intervals to trigger, or manually enqueue one job per source worker via BullMQ dashboard or a test script. Inspect logs for each source.
**Expected:**
- `GenshinWorker` logs `'Genshin raw response'` with a non-null `data` field (JSON from HoYoWiki API or HTML string from fallback)
- `LoLWorker` logs `'u.gg tier list raw data'` with a non-empty `dataKeys` array
- `AniListWorker` logs `'AniList raw response'` with `mediaCount > 0`
- `MangaDexWorker` logs `'MangaDex raw response'` with `chapterCount > 0`
- `FootballDataWorker` (SRC-01 from Phase 1) continues to produce output
**Why human:** All four new workers make live HTTP calls to external APIs. These cannot be invoked without a running service connected to Redis and with network access to the respective APIs.

#### 2. Bloom Filter Blocks Duplicate Enqueue at Runtime

**Test:** Call `enqueueCrawlJob({ url: 'https://example.com/test', sourceId: 'test', strategy: 'cheerio' })` twice in quick succession against a running crawler service.
**Expected:** Second call produces log `'URL already seen -- skipping (Bloom Filter)'` and no second BullMQ job ID appears.
**Why human:** BullMQ queue state inspection requires live Redis. The code logic is fully verified but end-to-end queue behavior requires runtime observation.

#### 3. Disallowed robots.txt URL Completes (Not Fails) in BullMQ

**Test:** Enqueue a crawl job for a URL whose domain returns `User-agent: *\nDisallow: /` in robots.txt. Observe BullMQ job lifecycle.
**Expected:** Job transitions to `completed` state (not `failed`), with log `'URL disallowed by robots.txt -- skipping'`. The job should NOT consume retry attempts.
**Why human:** BullMQ job state transitions (completed vs failed) require a live worker processing real jobs.

#### 4. Retry Exhaustion Produces Dead-Letter State

**Test:** Enqueue a crawl job for an unreachable URL. Allow all 3 retry attempts to exhaust.
**Expected:** Logs show three attempts with increasing backoff delays (~5s, ~10s, ~20s). Job lands in BullMQ failed set, visible in BullMQ dashboard or via `queue.getFailed()` API call. `removeOnFail: { count: 500 }` keeps it accessible.
**Why human:** Requires live BullMQ + Redis + actual network failure scenario with timing observation.

---

## Gaps Summary

No code-level gaps found. All artifacts exist and are substantive, all key links are wired, all 22 unit tests pass, and TypeScript type-check exits 0. The human verification section covers 4 runtime behaviors that require a live environment to confirm.

The phase goal is fully implemented in code. Human verification items are confirmations of correct wiring under live execution, not defects.

---

_Verified: 2026-04-09T19:32:00Z_
_Verifier: Claude (gsd-verifier)_
