# Phase 2: Full URL Frontier & Crawl Hardening - Research

**Researched:** 2026-04-08
**Domain:** Crawl infrastructure hardening (Bloom Filter, politeness, robots.txt, retry/DLQ) + multi-source workers
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Politeness via Redis timestamp (NOT per-domain BullMQ queues). Store `crawl:politeness:{domain}` in Redis, check elapsed before dispatch.
- **D-02:** In-memory Bloom Filter only. `bloom-filters` npm, `BloomFilter.create(100000, 0.01)`. State lost on restart is acceptable. Redis persistence deferred to Phase 10.
- **D-03:** robots.txt fetched and cached per domain in Redis, TTL 24h. Disallowed URLs: create job record with `disallowed` status in logs, skip fetch.
- **D-04:** MD5 hash of raw response body. Last hash per `sourceId` stored in Redis (`crawl:hash:{sourceId}`). If unchanged, log `content_unchanged` and return early.
- **D-05:** BullMQ retry already configured in `crawlQueue.ts` (attempts:3, exponential 5s). No changes needed for CRAWL-08.
- **D-06:** Dead-letter = BullMQ built-in failed set retained via `removeOnFail: { count: 500 }`. DB `status='failed'` wiring deferred to Phase 3. Visibility via `queue.getFailed()`.
- **D-07:** Dedicated worker per source matching `FootballDataWorker` pattern. Phase 2 goal: raw output in logs only.
  - SRC-02 (Genshin): `GenshinWorker` — HoYoWiki API + event page Cheerio scrape
  - SRC-03 (LoL): `LoLWorker` — Riot API + u.gg `__NEXT_DATA__` extraction via Cheerio
  - SRC-04 (AniList): `AniListWorker` — AniList GraphQL API (no auth)
  - SRC-05 (MangaDex): `MangaDexWorker` — MangaDex REST API

### Claude's Discretion

- robots.txt parsing library choice (e.g., `robots-parser` npm package)
- Redis key naming convention for politeness timestamps and content hashes
- Exact Bloom Filter initialization parameters within the 100k/1% spec
- How to integrate politeness + robots.txt check into existing `crawlWorker.ts` flow

### Deferred Ideas (OUT OF SCOPE)

- Per-domain BullMQ queue with rate limiter — deferred; Redis-timestamp approach chosen (D-01)
- Bloom Filter Redis persistence (serialize on shutdown, reload on startup) — deferred to Phase 10
- DB `status='failed'` column wiring — deferred to Phase 3

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CRAWL-04 | Read and respect `robots.txt` per domain (cached 24h) | D-03 + `robots-parser` npm API verified |
| CRAWL-05 | Per-domain politeness delay (min 2s between requests) | D-01 Redis timestamp pattern + key naming |
| CRAWL-06 | URL deduplication via Bloom Filter (100k, 0.1% FP) | `bloom-filters` v3.0.4 API verified; note: spec says 0.1% (0.001) but D-02 locks 1% (0.01) |
| CRAWL-07 | Content deduplication via MD5 hash | Node.js `crypto` built-in (`createHash('md5')`) — no extra dependency |
| CRAWL-08 | Retry max 3 attempts, exponential backoff starting at 5s | Already configured in `crawlQueue.ts` — D-05 says no changes needed |
| CRAWL-09 | Dead-letter state for jobs exhausting retries | BullMQ failed set, `removeOnFail: {count: 500}` already in `crawlQueue.ts` |
| SRC-02 | Genshin Impact events via HoYoWiki + event page scrape | HoYoWiki endpoint + Cheerio pattern researched |
| SRC-03 | LoL tier list via Riot API + u.gg `__NEXT_DATA__` | u.gg Next.js SSR pattern; Riot API free key needed |
| SRC-04 | Anime airing schedule via AniList GraphQL | `https://graphql.anilist.co` — no auth, 90 req/min |
| SRC-05 | Manga new chapters via MangaDex API | `https://api.mangadex.org/` — free, no auth |

</phase_requirements>

---

## Summary

Phase 2 adds six production-quality layers on top of the Phase 1 crawler skeleton. The core infrastructure work (plans 02-01 through 02-05) is primarily Redis integration + standard npm packages wired into `crawlWorker.ts` and new module files. The source worker work (plan 02-06) follows the established `FootballDataWorker` pattern exactly.

The most important finding is that **the crawler's TypeScript setup (`"type": "module"`, Node16 module resolution) is a compatibility constraint** for all new packages. `bloom-filters` v3.0.4 ships explicit ESM exports (`./dist/esm/*`) alongside CJS — it is compatible. `robots-parser` v3.0.1 ships only CJS (`index.js`, no `exports` field, no `type: module`) — it requires `createRequire` or an `allowSyntheticDefaultImports` import style in the ESM project, or can be imported with `import robotsParser from 'robots-parser'` using `esModuleInterop: true` (which the project has).

The Redis key convention from CONTEXT.md specifics (`crawl:politeness:{domain}`, `crawl:hash:{sourceId}`, `crawl:robots:{domain}`) should be locked as the canonical naming standard.

**Primary recommendation:** Implement as six sequential plans matching the CONTEXT.md plan list. Wire Bloom Filter, politeness, and robots.txt checks into `crawlWorker.ts` as pre-fetch guards. Build source workers as standalone files following `FootballDataWorker.ts` exactly.

---

## Standard Stack

### Core (already installed in `apps/crawler/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bullmq` | 5.73.0 | Job queue, retries, failed set | Already in project; retry/DLQ config in `crawlQueue.ts` |
| `ioredis` | 5.10.1 | Redis client | Already in project; shared `connection` from `connection.ts` |
| `axios` | 1.14.0 | HTTP client for source workers | Already in project; used by `FootballDataWorker` |
| `cheerio` | 1.0.0 | HTML parse for HoYoWiki + u.gg | Already in project; `cheerioFetch()` reusable |
| `winston` | 3.19.0 | Structured logging | Already in project |
| `node:crypto` | built-in | MD5 hash for content dedup | No install needed; `createHash('md5')` |

[VERIFIED: apps/crawler/package.json]

### New Dependencies to Add

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `bloom-filters` | 3.0.4 | In-memory Bloom Filter for URL dedup | Locked by D-02; ESM-compatible v3.x |
| `robots-parser` | 3.0.1 | Parse robots.txt and check `isAllowed()` | Claude's discretion; 0 transitive deps, MIT, spec-compliant |

[VERIFIED: npm registry — both versions confirmed current as of 2026-04-08]

**Installation:**
```bash
pnpm --filter @web-crawler/crawler add bloom-filters robots-parser
```

### Alternatives Considered

| Standard Choice | Alternative | Why Standard Wins |
|----------------|-------------|-------------------|
| `bloom-filters` | `bloomfilter.js` | bloom-filters has TypeScript types, ESM support, active maintenance |
| `robots-parser` | `robots-txt-parser` | robots-parser has 0 deps, is spec-compliant, simpler API |
| `node:crypto` MD5 | `md5` npm package | Built-in is sufficient for hashing string content; no extra dep |

---

## Architecture Patterns

### Integration Points in Existing Files

```
apps/crawler/src/
├── index.ts                    # Register new workers + schedulers (MODIFY)
├── connection.ts               # Shared Redis — reuse as-is (DO NOT MODIFY)
├── workers/
│   ├── crawlWorker.ts          # Add Bloom + politeness + robots checks (MODIFY)
│   ├── FootballDataWorker.ts   # Template for new workers (READ ONLY)
│   ├── CheerioWorker.ts        # Reuse cheerioFetch() (READ ONLY)
│   ├── GenshinWorker.ts        # NEW — SRC-02
│   ├── LoLWorker.ts            # NEW — SRC-03
│   ├── AniListWorker.ts        # NEW — SRC-04
│   └── MangaDexWorker.ts       # NEW — SRC-05
├── queues/
│   ├── genshinQueue.ts         # NEW — queue for SRC-02
│   ├── lolQueue.ts             # NEW — queue for SRC-03
│   ├── anilistQueue.ts         # NEW — queue for SRC-04
│   └── mangadexQueue.ts        # NEW — queue for SRC-05
└── services/                   # NEW directory
    ├── bloomFilter.ts          # Singleton BloomFilter instance
    ├── politenessGuard.ts      # Redis timestamp check/set
    └── robotsCache.ts          # Fetch + Redis cache + isAllowed check
```

### Pattern 1: Bloom Filter Singleton

The Bloom Filter must be a module-level singleton — one instance shared across all calls within the process. It is not per-job.

```typescript
// Source: [VERIFIED: bloom-filters GitHub src/bloom/bloom-filter.ts]
// apps/crawler/src/services/bloomFilter.ts
import { BloomFilter } from 'bloom-filters';

// BloomFilter.create(nbItems: number, errorRate: number): BloomFilter
// 100k items, 1% false positive rate (D-02)
export const bloomFilter = BloomFilter.create(100000, 0.01);

export function isUrlSeen(url: string): boolean {
  return bloomFilter.has(url);
}

export function markUrlSeen(url: string): void {
  bloomFilter.add(url);
}
```

Call before enqueuing any crawl job:
```typescript
// In job producer or crawlWorker.ts pre-check
if (isUrlSeen(url)) {
  logger.info('URL already seen — skipping (Bloom Filter)', { url, sourceId });
  return;
}
markUrlSeen(url);
```

### Pattern 2: Redis Politeness Guard (D-01)

```typescript
// Source: [CITED: CONTEXT.md specifics section]
// apps/crawler/src/services/politenessGuard.ts
import { connection } from '../connection.js';

const POLITENESS_DELAY_MS = 2000;
const KEY_TTL_S = 10; // short TTL — key is only needed for ~2s check

export async function enforcePoliteness(domain: string): Promise<void> {
  const key = `crawl:politeness:${domain}`;
  const lastTs = await connection.get(key);

  if (lastTs) {
    const elapsed = Date.now() - parseInt(lastTs, 10);
    if (elapsed < POLITENESS_DELAY_MS) {
      const waitMs = POLITENESS_DELAY_MS - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  // Set after delay, not before — records actual dispatch time
  await connection.set(key, Date.now().toString(), 'EX', KEY_TTL_S);
}
```

### Pattern 3: robots.txt Cache (D-03)

```typescript
// Source: [CITED: robots-parser npm, CONTEXT.md]
// apps/crawler/src/services/robotsCache.ts
import axios from 'axios';
import robotsParser from 'robots-parser';
import { connection } from '../connection.js';

const CACHE_TTL_S = 86400; // 24 hours
const USER_AGENT = 'PersonalCrawlerBot/1.0';

export async function isUrlAllowed(url: string): Promise<boolean> {
  const { hostname, protocol } = new URL(url);
  const key = `crawl:robots:${hostname}`;

  let robotsTxt = await connection.get(key);

  if (!robotsTxt) {
    try {
      const res = await axios.get<string>(`${protocol}//${hostname}/robots.txt`, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 5000,
        responseType: 'text',
      });
      robotsTxt = res.data;
    } catch {
      // If robots.txt fetch fails, allow crawling (permissive default)
      robotsTxt = '';
    }
    await connection.set(key, robotsTxt, 'EX', CACHE_TTL_S);
  }

  const robots = robotsParser(`${protocol}//${hostname}/robots.txt`, robotsTxt);
  return robots.isAllowed(url, USER_AGENT) !== false;
}
```

### Pattern 4: MD5 Content Hash (D-04)

```typescript
// Source: [VERIFIED: Node.js built-in crypto module]
import { createHash } from 'node:crypto';
import { connection } from '../connection.js';

export async function isContentChanged(sourceId: string, body: string): Promise<boolean> {
  const hash = createHash('md5').update(body).digest('hex');
  const key = `crawl:hash:${sourceId}`;
  const prevHash = await connection.get(key);

  if (prevHash === hash) {
    return false; // unchanged
  }

  await connection.set(key, hash);
  return true;
}
```

### Pattern 5: crawlWorker.ts Integration Order

The pre-fetch guard sequence in `crawlWorker.ts` must be:

```
1. Bloom Filter check → skip if seen, mark if new
2. politenessGuard.enforcePoliteness(domain) → wait if < 2s since last
3. isUrlAllowed(url) → skip with 'disallowed' log if robots.txt blocks
4. Fetch (cheerio / playwright / api strategy)
5. isContentChanged(sourceId, responseBody) → skip with 'content_unchanged' if same
6. Log raw response
```

**IMPORTANT:** The Bloom Filter check and `markUrlSeen` must bracket the whole flow — check before, mark after confirming the URL will be processed (not just checked). If the URL is disallowed by robots.txt, do NOT mark it in the Bloom Filter — it needs to be rechecked if rules change.

### Pattern 6: New Source Worker Structure

All four new workers follow `FootballDataWorker.ts` exactly:

```typescript
// Template — copy and adapt for each source
import axios from 'axios';
import { Worker, type Job } from 'bullmq';
import { connection } from '../connection.js';
import { logger } from '../logger.js';

const SOURCE_ID = '{source-id}';

export interface {Source}JobData {
  // source-specific fields
}

export function create{Source}Worker(): Worker<{Source}JobData> {
  const worker = new Worker<{Source}JobData>(
    'crawl-{source-name}',  // kebab-case, no colons
    async (job: Job<{Source}JobData>): Promise<void> => {
      logger.info('{Source} fetch started', { sourceId: SOURCE_ID, jobId: job.id });
      try {
        // fetch, log raw response
      } catch (err) {
        const error = err as Error;
        logger.error('{Source} fetch failed', { sourceId: SOURCE_ID, jobId: job.id, err: error.message });
        throw err; // Re-throw for BullMQ retry
      }
    },
    { connection, concurrency: 1 },
  );
  // ...event handlers
  return worker;
}
```

### Anti-Patterns to Avoid

- **Creating multiple Redis connections:** Never `new Redis()` inside service files — always import from `connection.ts`.
- **Calling `BloomFilter.create()` per job:** The filter must be a module singleton. Per-job creation defeats the entire purpose.
- **Swallowing errors in source workers:** Always re-throw after logging — BullMQ needs the throw to record failure and schedule retry.
- **Using colons in BullMQ queue names:** BullMQ v5 forbids colons. Queue names must use hyphens (`crawl-anilist`, not `crawl:anilist`). [VERIFIED: existing code comments in `crawlQueue.ts` and `footballDataQueue.ts`]
- **Marking a disallowed URL as seen in Bloom Filter:** If a URL is blocked by robots.txt, don't add it to the filter. You may want to re-crawl it after TTL expiry if rules change.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Probabilistic set membership | Custom hash-based dedup | `bloom-filters` | False positive math, serialization, seeding are non-trivial |
| robots.txt parsing | Regex-based rule matching | `robots-parser` | Wildcard `*`, `$` anchors, `Allow:` precedence are complex per RFC 9309 |
| Job retry scheduling | Custom setTimeout retry | BullMQ `attempts + backoff` | Already configured — D-05 says do not re-configure |
| Redis connection management | Multiple `new Redis()` calls | Shared `connection.ts` | One connection per process; `maxRetriesPerRequest: null` must be set for BullMQ |
| HTTP client per source | `fetch()` or custom agent | `axios` (already installed) | Timeout, User-Agent header, response types all configured consistently |

**Key insight:** The hardening layer (Bloom Filter, politeness, robots.txt, MD5) is thin glue code — each piece is 20-40 lines. The value is in the protocol-correct implementations of the libraries, not in the glue.

---

## Source-Specific API Details

### SRC-02: Genshin / HoYoWiki

- HoYoWiki event list endpoint (unofficial, discovered via network inspection): `https://sg-wiki-api-static.hoyolab.com/hoyowiki/genshin/wapi/` — returns JSON
- Event page: `https://www.hoyolab.com/circles/2/41/official` — server-rendered, Cheerio-parseable
- No auth required for public event listing
- Phase 2 goal: log raw JSON response from HoYoWiki API (no parsing)
- `cheerioFetch()` from `CheerioWorker.ts` can scrape the event page for HTML backup

[CITED: `.planning/research/FEATURES.md`]

### SRC-03: LoL / Riot + u.gg

- Riot API requires free developer key from `https://developer.riotgames.com/`
- Rate limit: 20 req/1s, 100 req/2min (personal key)
- u.gg tier list URL: `https://u.gg/lol/tier-list` — uses Next.js SSR
- `__NEXT_DATA__` extraction pattern:
  ```typescript
  const $ = cheerio.load(html);
  const raw = $('script#__NEXT_DATA__').text();
  const data = JSON.parse(raw) as unknown;
  logger.info('u.gg tier list raw data', { sourceId, jobId, data });
  ```
- No Playwright needed — server-renders the data into script tag

[CITED: `.planning/research/FEATURES.md`; `__NEXT_DATA__` pattern is standard Next.js SSR]

**Environment variable needed:** `RIOT_API_KEY` — must be added to `.env` and Docker Compose.

### SRC-04: AniList GraphQL

- Endpoint: `https://graphql.anilist.co` — POST requests only
- No auth required
- Rate limit: 90 req/min [CITED: `docs.anilist.co`]
- Example query for current airing schedule:
  ```graphql
  query {
    Page(page: 1, perPage: 50) {
      media(season: SPRING, seasonYear: 2026, type: ANIME, status: RELEASING) {
        id
        title { romaji english }
        nextAiringEpisode { airingAt episode }
      }
    }
  }
  ```
- Implementation: `axios.post('https://graphql.anilist.co', { query }, { headers: { 'Content-Type': 'application/json', 'User-Agent': 'PersonalCrawlerBot/1.0' } })`

[CITED: `docs.anilist.co/guide/graphql/`]

### SRC-05: MangaDex

- Base URL: `https://api.mangadex.org/`
- No auth required for public endpoints
- Chapter feed: `GET /manga/{id}/feed` — lists chapters for a manga
- Recent chapters (all): `GET /chapter?order[publishAt]=desc&limit=10` — latest across all manga
- Phase 2 goal: log raw API response — no manga-ID configuration needed for initial proof

[CITED: `api.mangadex.org/docs/04-chapter/search/`]

---

## Common Pitfalls

### Pitfall 1: Bloom Filter False Positive Rate Mismatch

**What goes wrong:** REQUIREMENTS.md says 0.1% FP (`0.001`), but CONTEXT.md D-02 locks `BloomFilter.create(100000, 0.01)` which is 1% FP. Implementation uses 1%.
**Why it happens:** The two documents use different precision.
**How to avoid:** Use exactly `BloomFilter.create(100000, 0.01)` per D-02. Do not change to `0.001` — that is deferred to Phase 10 if ever revisited.
**Warning signs:** If someone checks REQUIREMENTS.md CRAWL-06 text ("0.1% false positive") against the code, the difference is intentional per D-02.

### Pitfall 2: robots-parser ESM Import in Node16 Module Project

**What goes wrong:** `import robotsParser from 'robots-parser'` may fail with `ERR_REQUIRE_ESM` or type errors because `robots-parser` has no `exports` field and no `"type": "module"`.
**Why it happens:** `tsconfig.base.json` uses `"module": "Node16"` — TypeScript is strict about CJS/ESM interop.
**How to avoid:** The project has `"esModuleInterop": true` in `tsconfig.base.json`. Import as `import robotsParser from 'robots-parser'` — this triggers the default import interop. Alternatively: `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); const robotsParser = require('robots-parser');`
**Warning signs:** TypeScript error `Module '...' has no default export` — fix with type assertion or `createRequire`.

[VERIFIED: tsconfig.base.json has `esModuleInterop: true`]

### Pitfall 3: crawlWorker.ts Guard Placement

**What goes wrong:** Bloom Filter check runs but `markUrlSeen()` is called before the job actually succeeds — a failed job marks the URL as seen forever, preventing retries from re-entering.
**Why it happens:** Calling `markUrlSeen` immediately after `isUrlSeen` check.
**How to avoid:** Only `markUrlSeen` AFTER the URL has been successfully enqueued. For `crawlWorker.ts`, mark after successful fetch (or at least after passing robots/politeness). Failed jobs should NOT re-enter the filter — BullMQ retry re-runs the same worker function, which already marked the URL. The filter is for deduplicating new submissions, not for controlling retries.
**Warning signs:** Retries silently skipping (log shows "URL already seen" for a retry).

**CORRECT FLOW:** Mark the URL seen when the job is first ENQUEUED (in the producer), not inside the worker. This way retries (same job re-run by BullMQ) bypass the filter entirely.

### Pitfall 4: Politeness Key TTL Too Long

**What goes wrong:** Setting `crawl:politeness:{domain}` with a 24h TTL causes infinite blocking — if the domain is revisited after 2s, the old key (now expired) should not exist, but with a long TTL it persists and incorrectly delays.
**Why it happens:** Confusing the politeness key TTL with the robots.txt cache TTL.
**How to avoid:** Politeness key TTL should be very short (5-10 seconds) — just long enough to be checked in the next job. Robots.txt key TTL = 86400s (24h).

### Pitfall 5: Missing `RIOT_API_KEY` Causes Silent Failures

**What goes wrong:** `LoLWorker` makes Riot API calls without a key — gets HTTP 401, throws, BullMQ retries 3x, lands in dead-letter without a clear error.
**Why it happens:** Env var not added to Docker Compose or `.env`.
**How to avoid:** Add `RIOT_API_KEY` to env config before implementing `LoLWorker`. Log a startup warning if `process.env.RIOT_API_KEY` is empty.

### Pitfall 6: AniList Season Hardcoded

**What goes wrong:** Query hardcodes `seasonYear: 2026` — breaks next year.
**Why it happens:** Convenient for Phase 2 proof.
**How to avoid:** Phase 2 goal is "raw output in logs" — hardcoding is acceptable. Add `// TODO Phase 3: derive season/year dynamically` comment.

---

## Code Examples

### Bloom Filter Import (ESM)

```typescript
// Source: [VERIFIED: bloom-filters v3.0.4 exports field provides ESM at ./dist/esm/*]
import { BloomFilter } from 'bloom-filters';
// BloomFilter.create(nbItems, errorRate) -> BloomFilter
// .add(element: string) -> void
// .has(element: string) -> boolean
```

### robots-parser Usage

```typescript
// Source: [CITED: github.com/samclarke/robots-parser]
import robotsParser from 'robots-parser';
// robotsParser(url: string, content: string) -> RobotsParser
// .isAllowed(url: string, userAgent: string) -> boolean | undefined
// undefined means URL is not in scope of the robots.txt

const robots = robotsParser('https://example.com/robots.txt', robotsTxtContent);
const allowed = robots.isAllowed('https://example.com/page', 'PersonalCrawlerBot/1.0');
// Returns: true (allowed), false (disallowed), undefined (not mentioned)
// Treat undefined as allowed (permissive default)
```

### MD5 Hash

```typescript
// Source: [VERIFIED: Node.js built-in crypto]
import { createHash } from 'node:crypto';
const hash = createHash('md5').update(responseBody).digest('hex');
```

### AniList GraphQL POST

```typescript
// Source: [CITED: docs.anilist.co/guide/graphql]
const response = await axios.post<AniListResponse>(
  'https://graphql.anilist.co',
  { query: AIRING_QUERY },
  {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'PersonalCrawlerBot/1.0',
    },
    timeout: 10_000,
  },
);
```

### u.gg `__NEXT_DATA__` Extraction

```typescript
// Source: [ASSUMED — standard Next.js SSR pattern, confirmed by FEATURES.md]
import * as cheerio from 'cheerio';
const $ = cheerio.load(html);
const scriptContent = $('script#__NEXT_DATA__').text();
const nextData = JSON.parse(scriptContent) as Record<string, unknown>;
```

### Graceful Shutdown Registration (index.ts pattern)

```typescript
// Source: [VERIFIED: apps/crawler/src/index.ts pattern]
await setupGracefulShutdown(crawlWorker, async () => {
  await browserPool.closeAll();
  await footballWorker.close();
  await genshinWorker.close();   // ADD new workers here
  await lolWorker.close();
  await anilistWorker.close();
  await mangadexWorker.close();
});
```

---

## Validation Architecture

**nyquist_validation is enabled** (`config.json` has `"nyquist_validation": true`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (recommended in TESTING.md; not yet installed) |
| Config file | None — Wave 0 must create `vitest.config.ts` |
| Quick run command | `pnpm --filter @web-crawler/crawler test --run` |
| Full suite command | `pnpm --filter @web-crawler/crawler test --run --reporter=verbose` |

**Note:** No test files exist in `apps/crawler/src/` today [VERIFIED: directory listing]. TESTING.md lists Vitest as the intended framework for the crawler package. Wave 0 of any plan involving tests must install Vitest.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRAWL-06 | BloomFilter blocks duplicate URL | unit | `pnpm --filter @web-crawler/crawler test bloomFilter` | ❌ Wave 0 |
| CRAWL-05 | Politeness waits ≥ 2s for same domain | unit (mock Redis) | `pnpm --filter @web-crawler/crawler test politenessGuard` | ❌ Wave 0 |
| CRAWL-04 | Disallowed URL returns false from `isUrlAllowed` | unit | `pnpm --filter @web-crawler/crawler test robotsCache` | ❌ Wave 0 |
| CRAWL-07 | MD5 hash detects unchanged content | unit | `pnpm --filter @web-crawler/crawler test contentHash` | ❌ Wave 0 |
| CRAWL-08 | BullMQ retry config — attempts:3, delay:5000 | manual/smoke | Verify via BullMQ dashboard or log inspection | — |
| CRAWL-09 | Failed job appears in `queue.getFailed()` | smoke/manual | Log `queue.getFailed()` count after forced failure | — |
| SRC-02..05 | Source workers log raw output | smoke | Run worker, check logs for structured output | — |

### Sampling Rate

- **Per task commit:** `pnpm --filter @web-crawler/crawler test --run`
- **Per wave merge:** `pnpm --filter @web-crawler/crawler test --run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Install Vitest: `pnpm --filter @web-crawler/crawler add -D vitest`
- [ ] `apps/crawler/vitest.config.ts` — ESM-compatible Vitest config
- [ ] `apps/crawler/src/services/bloomFilter.test.ts` — covers CRAWL-06
- [ ] `apps/crawler/src/services/politenessGuard.test.ts` — covers CRAWL-05 (mock `connection`)
- [ ] `apps/crawler/src/services/robotsCache.test.ts` — covers CRAWL-04 (mock axios + connection)
- [ ] `apps/crawler/src/services/contentHash.test.ts` — covers CRAWL-07

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Redis | Politeness, robots cache, content hash | ✓ | 5.10.1 (ioredis client) | — |
| Node.js crypto | MD5 hashing | ✓ | Built-in | — |
| `bloom-filters` npm | CRAWL-06 | ✗ (not installed) | 3.0.4 (latest) | None — must install |
| `robots-parser` npm | CRAWL-04 | ✗ (not installed) | 3.0.1 (latest) | None — must install |
| Riot API key | SRC-03 | ✗ (env var missing) | — | Skip Riot API calls, log warning |
| HoYoWiki endpoint | SRC-02 | ✓ (public, no auth) | — | — |
| AniList GraphQL | SRC-04 | ✓ (public, no auth) | — | — |
| MangaDex API | SRC-05 | ✓ (public, no auth) | — | — |
| Vitest | Phase 2 tests | ✗ (not installed) | latest | None — must install for test gate |

**Missing dependencies with no fallback:**
- `bloom-filters` — core to CRAWL-06; install in plan 02-01 Wave 0
- `robots-parser` — core to CRAWL-04; install in plan 02-03 Wave 0
- Vitest — required for test gate; install in Wave 0 of first plan that has tests

**Missing dependencies with fallback:**
- `RIOT_API_KEY` env var — `LoLWorker` can log warning and skip Riot calls; u.gg scraping still works without it. Install guide: `https://developer.riotgames.com/`

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BullMQ `pipeline` key | `tasks` key in `turbo.json` | Turborepo 2.x | Already using correct approach (Phase 1) |
| Per-domain BullMQ queues for politeness | Redis timestamp per domain | D-01 (Phase 2 design) | Avoids queue proliferation |
| Bloom Filter Redis persistence | In-memory only (Phase 2) | D-02 | Simpler now; persistence in Phase 10 |
| BullMQ repeatable jobs `repeat` option | `queue.upsertJobScheduler()` | BullMQ v5 | Already using correct API (Phase 1) |

**Deprecated/outdated:**
- `queue.add('repeat', data, { repeat: { every: ms } })`: replaced by `upsertJobScheduler` in BullMQ v5 — do not use for new queues.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | HoYoWiki endpoint `sg-wiki-api-static.hoyolab.com/hoyowiki/genshin/wapi/` is accessible and returns JSON | Source Details (SRC-02) | Genshin worker fails; fallback to event page Cheerio scrape only |
| A2 | u.gg renders tier list data in `<script id="__NEXT_DATA__">` without Playwright | Source Details (SRC-03) | Would require switching to Playwright worker for u.gg |
| A3 | MangaDex API `GET /chapter?order[publishAt]=desc&limit=10` works without authentication | Source Details (SRC-05) | Worker fails immediately; need to find auth method |
| A4 | `import robotsParser from 'robots-parser'` works with `esModuleInterop: true` in Node16 module project | Pitfall 2 | Build error; use `createRequire` workaround instead |

---

## Open Questions

1. **HoYoWiki exact endpoint path**
   - What we know: The research doc mentions `sg-wiki-api-static.hoyolab.com/hoyowiki/genshin/wapi/` but the 404 curl result suggests it may need query params or a specific sub-path.
   - What's unclear: Exact URL structure for event listing. The event page `https://www.hoyolab.com/circles/2/41/official` is an alternative.
   - Recommendation: In plan 02-06, implement `GenshinWorker` to try both the API endpoint and the Cheerio page scrape; log whichever returns data. Phase 2 goal is "raw output in logs" — either source satisfies the success criterion.

2. **Riot API key availability**
   - What we know: SRC-03 needs `RIOT_API_KEY`; it's not in any existing env config.
   - What's unclear: Whether the user already has a key or needs to register.
   - Recommendation: Plan 02-06 for LoL should include a Wave 0 step: "Add `RIOT_API_KEY` to `.env` and Docker Compose env". Worker should check for missing key at startup and log a warning rather than crash.

3. **Bloom Filter check location — producer vs. worker**
   - What we know: The filter must be module-level singleton. Workers and producers are in different modules but same process.
   - What's unclear: Whether to check in the job producer (before enqueue) or inside `crawlWorker.ts` (during execution).
   - Recommendation: Check in the job producer for `crawlWorker.ts` jobs, and check at the top of each source worker's job handler for source-specific queues. This is more natural since source workers control their own URL generation.

---

## Project Constraints (from CONVENTIONS.md)

- **Queue names:** `kebab-case`, no colons — `crawl-genshin`, `crawl-lol`, etc. [VERIFIED: existing queue files enforce this]
- **User-Agent:** All HTTP requests must set `'User-Agent': 'PersonalCrawlerBot/1.0'`
- **Error handling:** catch → log with `logger.error()` → re-throw (BullMQ retry)
- **TypeScript:** `strict: true`; explicit return types on public functions; `interface` over `type`
- **Import order:** Node built-ins → external packages → internal modules
- **Logging context:** Always include `{ url, sourceId, jobId }` in log entries
- **File naming:** `PascalCase.ts` for worker classes, `camelCase.ts` for service modules

[VERIFIED: `.planning/codebase/CONVENTIONS.md`]

---

## Sources

### Primary (HIGH confidence)
- `apps/crawler/src/workers/FootballDataWorker.ts` — canonical worker pattern
- `apps/crawler/src/workers/crawlWorker.ts` — integration point inspected directly
- `apps/crawler/src/queues/crawlQueue.ts` — retry config verified
- `apps/crawler/package.json` — installed dependency versions verified
- `tsconfig.base.json` — module/moduleResolution/esModuleInterop verified
- `bloom-filters` v3.0.4 GitHub source — `BloomFilter.create(nbItems, errorRate)` API verified
- Node.js built-in `crypto` — `createHash('md5')` API

### Secondary (MEDIUM confidence)
- `robots-parser` v3.0.1 npm — `isAllowed(url, ua)` API from npm search description + GitHub README
- AniList GraphQL endpoint `https://graphql.anilist.co` — [CITED: docs.anilist.co]
- MangaDex chapter endpoint — [CITED: api.mangadex.org/docs/04-chapter/search/]
- `.planning/research/FEATURES.md` — source-specific API research pre-existing

### Tertiary (LOW confidence / ASSUMED)
- u.gg `__NEXT_DATA__` script tag approach — standard Next.js SSR pattern but not directly verified against live u.gg page
- HoYoWiki exact endpoint URL — documented in FEATURES.md but live 404 suggests confirmation needed

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all versions verified from npm registry and existing package.json
- Architecture patterns: HIGH — based on reading existing source files directly
- Pitfalls: MEDIUM — ESM/CJS interop pitfall is verified; others are based on known BullMQ/crawler patterns
- Source APIs: MEDIUM — AniList and MangaDex are official docs; HoYoWiki and u.gg are community-documented

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable libraries; AniList/MangaDex APIs are stable; u.gg structure may change with Next.js updates)

---

## RESEARCH COMPLETE
