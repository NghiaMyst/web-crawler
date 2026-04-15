# Phase 2: Full URL Frontier & Crawl Hardening - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

The crawler enforces all production-quality crawling constraints — Bloom Filter URL dedup, per-domain politeness delay, robots.txt compliance, retry with exponential backoff, dead-letter queue — and all five configured data sources (football-data.org, HoYoWiki, Riot/u.gg, AniList, MangaDex) successfully produce raw crawl output in logs.

No storage, parsing, or notification logic — that is Phase 3+.

</domain>

<decisions>
## Implementation Decisions

### Politeness Enforcement (CRAWL-05)
- **D-01:** Use Redis-based timestamp tracking per domain — store last-request timestamp in Redis, check before each crawl job and delay if < 2s elapsed. Do NOT use per-domain BullMQ queues (avoids queue proliferation as sources grow).

### Bloom Filter URL Deduplication (CRAWL-06)
- **D-02:** In-memory Bloom Filter for Phase 2. Use `bloom-filters` npm package, configured as `BloomFilter.create(100000, 0.01)` (~100k URLs, 1% false positive). State is lost on restart — duplicate re-crawl on restart is acceptable. Redis persistence is deferred to Phase 10 (DEPLOY-05).

### robots.txt Compliance (CRAWL-04)
- **D-03:** Fetch and cache robots.txt per domain in Redis, TTL 24h. Before each crawl job, check if URL path is allowed. Disallowed URLs: create job record with `disallowed` status in logs (no DB yet), skip fetch entirely.

### Content Deduplication (CRAWL-07)
- **D-04:** MD5 hash of raw response body. Store last hash per `sourceId` in Redis. If hash matches previous crawl, skip (log `content_unchanged` and return early — no notification trigger).

### Retry & Dead-Letter Queue (CRAWL-08, CRAWL-09)
- **D-05:** BullMQ retry is already configured in `crawlQueue.ts` — `attempts: 3, backoff: exponential 5s`. No changes needed for CRAWL-08.
- **D-06:** Dead-letter for Phase 2: BullMQ's built-in failed job set is sufficient. Jobs exhausting retries land in BullMQ's failed set (retained via `removeOnFail: { count: 500 }`). DB `status='failed'` column wiring is Phase 3 work. Success criterion "appears in job list" is satisfied by BullMQ's failed set (accessible via `queue.getFailed()`).

### New Source Worker Pattern (SRC-02 to SRC-05)
- **D-07:** Dedicated worker per source, matching the `FootballDataWorker` pattern from Phase 1. Each source gets its own worker class and BullMQ queue. Phase 2 goal: raw crawl output in logs only — no parsing or storage.
  - SRC-02 (Genshin): `GenshinWorker` — HoYoWiki API + event page Cheerio scrape
  - SRC-03 (LoL): `LoLWorker` — Riot API + u.gg script-tag JSON extraction via Cheerio
  - SRC-04 (AniList): `AniListWorker` — AniList GraphQL API (no auth)
  - SRC-05 (MangaDex): `MangaDexWorker` — MangaDex REST API

### Claude's Discretion
- robots.txt parsing library choice (e.g., `robots-parser` npm package)
- Redis key naming convention for politeness timestamps and content hashes
- Exact Bloom Filter initialization parameters within the 100k/1% spec
- How to integrate politeness + robots.txt check into existing `crawlWorker.ts` flow

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Phase 2 requirements: CRAWL-04, CRAWL-05, CRAWL-06, CRAWL-07, CRAWL-08, CRAWL-09, SRC-02, SRC-03, SRC-04, SRC-05

### Architecture & Stack
- `.planning/codebase/ARCHITECTURE.md` — Data flow (steps 2–7 describe URL Frontier, robots.txt, Bloom Filter, content hash logic), queue-per-domain politeness model (NOTE: D-01 overrides queue-per-domain to Redis-timestamp approach)
- `.planning/codebase/STACK.md` — `bloom-filters` npm package spec (`BloomFilter.create(100000, 0.01)`), BullMQ limiter reference

### Schema & Roadmap
- `SCHEMA.md` — `crawl_jobs` table (defines `content_hash`, `status` fields that Phase 2 logs map to)
- `.planning/ROADMAP.md` — Phase 2 success criteria (5 items, especially criteria 1–4 for constraint verification)

### Phase 1 Context (established patterns)
- `.planning/phases/01-monorepo-foundation-crawler-skeleton/01-CONTEXT.md` — D-04 env var pattern, queue naming conventions

### Existing Source Files
- `apps/crawler/src/queues/crawlQueue.ts` — retry config already set (attempts:3, exponential 5s) — DO NOT re-configure
- `apps/crawler/src/workers/FootballDataWorker.ts` — canonical pattern for new source workers
- `apps/crawler/src/workers/crawlWorker.ts` — integration point for politeness + robots.txt checks
- `apps/crawler/src/connection.ts` — Redis connection (shared by Bloom Filter and politeness layer)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/crawler/src/connection.ts` — Redis connection (`ioredis`) already established; reuse for politeness timestamps, content hashes, and robots.txt cache
- `apps/crawler/src/workers/FootballDataWorker.ts` — canonical per-source worker template (axios client, BullMQ worker, error logging, re-throw on failure)
- `apps/crawler/src/workers/CheerioWorker.ts` — `cheerioFetch()` reusable for SRC-02 event page scraping and SRC-03 u.gg script-tag extraction
- `apps/crawler/src/logger.ts` — Winston logger; use same structured logging pattern for all new Phase 2 components

### Established Patterns
- Queue naming: `crawl-{domain}` (e.g., `crawl-football-data.org`) — extend for new source queues
- Error handling: catch → log with `logger.error()` → re-throw (so BullMQ records failure and applies retry)
- User-Agent: `'PersonalCrawlerBot/1.0'` on all HTTP requests (CONVENTIONS.md)
- Scheduler: `queue.upsertJobScheduler()` for repeatable jobs — safe to call on every startup
- Graceful shutdown: each new worker must be added to `additionalCleanup` in `setupGracefulShutdown()`

### Integration Points
- `apps/crawler/src/index.ts` — register new workers and their schedulers here
- `apps/crawler/src/workers/crawlWorker.ts` — add politeness check + robots.txt check before fetch dispatch
- `apps/crawler/src/connection.ts` — Redis client used by new Bloom Filter and politeness modules

</code_context>

<specifics>
## Specific Ideas

- Politeness via Redis timestamp: `SET crawl:politeness:{domain} {timestamp} EX 10` then check elapsed before job dispatch
- Content hash in Redis: `SET crawl:hash:{sourceId} {md5hex}` — compare on each successful fetch
- robots.txt cache in Redis: `SET crawl:robots:{domain} {parsedRules} EX 86400` (24h TTL)
- Dead-letter visibility in Phase 2: `queue.getFailed()` in logs is sufficient — no interim DB needed

</specifics>

<deferred>
## Deferred Ideas

- Per-domain BullMQ queue with rate limiter — deferred; Redis-timestamp approach chosen for Phase 2 (D-01)
- Bloom Filter Redis persistence (serialize to Redis on shutdown, reload on startup) — deferred to Phase 10 (DEPLOY-05)
- DB `status='failed'` column wiring — deferred to Phase 3 (when PostgreSQL schema goes live)

</deferred>

---

*Phase: 02-full-url-frontier-crawl-hardening*
*Context gathered: 2026-04-08*
