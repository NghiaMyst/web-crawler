---
phase: 2
plan: 6
subsystem: crawler
tags: [workers, bullmq, genshin, lol, anilist, mangadex, data-sources]
dependency_graph:
  requires: [02-05]
  provides: [GenshinWorker, LoLWorker, AniListWorker, MangaDexWorker, genshinQueue, lolQueue, anilistQueue, mangadexQueue]
  affects: [apps/crawler/src/index.ts, docker-compose.yml]
tech_stack:
  added: []
  patterns: [BullMQ Worker, upsertJobScheduler, FootballDataWorker pattern, axios HTTP, cheerio __NEXT_DATA__ extraction, GraphQL POST]
key_files:
  created:
    - apps/crawler/src/queues/genshinQueue.ts
    - apps/crawler/src/queues/lolQueue.ts
    - apps/crawler/src/queues/anilistQueue.ts
    - apps/crawler/src/queues/mangadexQueue.ts
    - apps/crawler/src/workers/GenshinWorker.ts
    - apps/crawler/src/workers/LoLWorker.ts
    - apps/crawler/src/workers/AniListWorker.ts
    - apps/crawler/src/workers/MangaDexWorker.ts
  modified:
    - apps/crawler/src/index.ts
    - docker-compose.yml
decisions:
  - RIOT_API_KEY logged as missing warning at import time (not crash) — LoLWorker u.gg scrape works without it
  - GenshinWorker uses HoYoWiki API primary with cheerioFetch fallback to hoyolab.com official circle
  - AniListWorker uses RELEASING status + POPULARITY_DESC sort (no hardcoded seasonYear per plan)
metrics:
  duration: ~5 minutes
  completed_date: "2026-04-09"
  tasks_completed: 2
  files_created: 8
  files_modified: 2
---

# Phase 2 Plan 6: Remaining Data Source Workers Summary

## One-liner

Four new BullMQ source workers (Genshin/HoYoWiki, LoL/u.gg, AniList/GraphQL, MangaDex/API) with dedicated queues and schedulers, all wired into index.ts with graceful shutdown.

## What Was Built

### Task 1: Four queue files and four worker files

**Queue files** (all kebab-case, no colons per BullMQ v5 restriction):
- `genshinQueue.ts` — queue name `crawl-genshin`
- `lolQueue.ts` — queue name `crawl-lol`
- `anilistQueue.ts` — queue name `crawl-anilist`
- `mangadexQueue.ts` — queue name `crawl-mangadex`

Each queue uses the `footballDataQueue.ts` pattern: `attempts: 3`, exponential backoff at 5000ms, `removeOnComplete: {count: 100}`, `removeOnFail: {count: 500}`.

**Worker files** (all follow FootballDataWorker pattern):
- `GenshinWorker.ts` (SRC-02): Tries HoYoWiki API (`sg-wiki-api-static.hoyolab.com/hoyowiki/genshin/wapi/home`), falls back to `cheerioFetch` on hoyolab.com official circle
- `LoLWorker.ts` (SRC-03): Fetches `https://u.gg/lol/tier-list` via axios, extracts `__NEXT_DATA__` via `$('script#__NEXT_DATA__')`, warns if `RIOT_API_KEY` missing
- `AniListWorker.ts` (SRC-04): POSTs GraphQL query to `https://graphql.anilist.co` for `ANIME/RELEASING/POPULARITY_DESC`, logs `mediaCount`
- `MangaDexWorker.ts` (SRC-05): GETs `https://api.mangadex.org/chapter?order[publishAt]=desc&limit=10`, logs `chapterCount`

All workers: `concurrency: 1`, `completed`/`failed` event handlers, `catch → logger.error → throw` retry pattern, `User-Agent: PersonalCrawlerBot/1.0`.

### Task 2: Wire into index.ts and docker-compose.yml

**index.ts changes:**
- Imports all four new queue modules and worker create functions
- Instantiates all four workers after `createFootballDataWorker()`
- Registers `upsertJobScheduler` for each source: Genshin (6h), LoL (12h), AniList (6h), MangaDex (1h)
- Graceful shutdown closure includes `.close()` for all four new workers
- Final ready log lists all 6 queue names and 5 scheduler IDs

**docker-compose.yml:** Added `RIOT_API_KEY=${RIOT_API_KEY:-}` to crawler service environment (defaults to empty string).

## Verification

```
pnpm --filter @web-crawler/crawler run type-check  # exits 0
pnpm --filter @web-crawler/crawler test             # 22/22 tests pass
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All workers log raw responses as intended for Phase 2 (Phase 3 will add storage).

## Threat Flags

No new security-relevant surface beyond what the threat model already covers (T-02-08, T-02-09, T-02-10):
- RIOT_API_KEY is read from env var only, never logged (T-02-08 mitigated)
- All workers run `concurrency: 1` with conservative scheduler intervals (T-02-09 mitigated)
- All URLs are hardcoded in worker code, not user-controlled (T-02-10 accepted)

## Self-Check: PASSED

Files verified:
- apps/crawler/src/queues/genshinQueue.ts — FOUND
- apps/crawler/src/queues/lolQueue.ts — FOUND
- apps/crawler/src/queues/anilistQueue.ts — FOUND
- apps/crawler/src/queues/mangadexQueue.ts — FOUND
- apps/crawler/src/workers/GenshinWorker.ts — FOUND
- apps/crawler/src/workers/LoLWorker.ts — FOUND
- apps/crawler/src/workers/AniListWorker.ts — FOUND
- apps/crawler/src/workers/MangaDexWorker.ts — FOUND
- apps/crawler/src/index.ts — FOUND (modified)
- docker-compose.yml — FOUND (modified)

Commits verified:
- c0341af — feat(02-06): create queue and worker files for Genshin, LoL, AniList, MangaDex
- 08aea66 — feat(02-06): wire new workers into index.ts and add RIOT_API_KEY to docker-compose
