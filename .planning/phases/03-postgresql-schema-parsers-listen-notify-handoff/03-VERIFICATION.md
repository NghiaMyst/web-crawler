---
phase: 03-postgresql-schema-parsers-listen-notify-handoff
verified: 2026-04-10T14:00:00Z
status: human_needed
score: 5/5
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "A crawl job completion in Node.js triggers a PostgreSQL NOTIFY and the .NET listener logs receipt within 1 second"
    - "The correct parser (e.g., FootballParser) is resolved by keyed services based on the source's parser_key config — confirmed via log of resolved type name"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Start the full Docker stack (docker compose up). Trigger a crawl by enqueueing a job to crawl-football-data.org queue. Observe .NET API container logs."
    expected: "Within 1 second of the Node.js COMMIT, the .NET API logs: 'NOTIFY received on crawler_events: ...' followed by 'Resolved parser: FootballParser' and 'Parser produced N entries'"
    why_human: "Requires running Docker stack; timing verification of the LISTEN/NOTIFY latency requires real execution"
  - test: "After the above crawl completes, run in PostgreSQL: EXPLAIN ANALYZE SELECT * FROM data_entries WHERE payload @> '{\"competition\": \"Premier League\"}'"
    expected: "Query plan shows 'Bitmap Index Scan on ix_data_entries_payload' (GIN index used, not sequential scan)"
    why_human: "Cannot run EXPLAIN ANALYZE programmatically without a running PostgreSQL instance with data"
  - test: "After a full crawl cycle, run: SELECT entry_key, category, payload FROM data_entries LIMIT 10"
    expected: "Rows appear with entry_key prefixes matching the parser (standing_NNN or match_NNN for football, chapter_UUID for mangadex, anime_NNN for anilist, event_NNN for genshin, champion_name_role for lol) and valid JSONB payloads"
    why_human: "Requires running full stack to produce actual data_entries rows"
---

# Phase 3: PostgreSQL Schema, Parsers & LISTEN/NOTIFY Handoff — Verification Report

**Phase Goal:** Crawled data flows from Node.js through PostgreSQL LISTEN/NOTIFY into .NET keyed-service parsers and lands in `data_entries` as structured JSONB rows with stable `entry_key` values.
**Verified:** 2026-04-10T14:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (commit cb74fd9)

## Gap Closure Summary

Both gaps from the initial verification (2026-04-10T12:00:00Z) are now closed:

**Gap 1 closed:** All 5 source workers now call `insertCrawlJobAndNotify` with correct `parserKey` values, and write raw content to Redis (`job:raw:{jobId}` with 300s TTL) before the pg transaction. The ordering constraint is respected in every worker.

**Gap 2 closed:** With NOTIFY now firing from source workers, `CrawlerEventListener.HandleNotificationAsync` will be invoked, resolving the keyed parser via `GetRequiredKeyedService<IContentParser>(msg.ParserKey)` and logging the resolved type name.

All 5 success criteria now pass static analysis. Three items remain requiring human verification with a running stack.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `dotnet ef migrations apply` creates all 5 tables with correct columns and indexes | VERIFIED | `20260410064655_20260410_InitialSchema.cs` creates sources, crawl_jobs, data_entries, alert_rules, notification_logs; GIN index at line 188 via `"Npgsql:IndexMethod": "gin"`; UNIQUE constraint on (source_id, entry_key) confirmed |
| 2 | A crawl job completion in Node.js triggers a PostgreSQL NOTIFY and the .NET listener logs receipt within 1 second | VERIFIED (static) | All 5 workers now import `insertCrawlJobAndNotify` (FootballDataWorker line 6, GenshinWorker line 6, LoLWorker line 7, AniListWorker line 6, MangaDexWorker line 6). Each writes `job:raw:{jobId}` to Redis with EX 300 before calling `insertCrawlJobAndNotify`. `crawlJobsDb.ts` issues `SELECT pg_notify('crawler_events', $1)` inside the same transaction. `CrawlerEventListener` has `LISTEN crawler_events` and `conn.Notification` handler wired. Latency confirmation requires human testing. |
| 3 | The correct parser is resolved by keyed services based on `parser_key` — confirmed via log of resolved type name | VERIFIED (static) | `parserKey` values: football (FootballDataWorker line 59), genshin (GenshinWorker line 58), lol (LoLWorker line 58), anilist (AniListWorker line 74), mangadex (MangaDexWorker line 54). `CrawlerEventListener` line 62: `GetRequiredKeyedService<IContentParser>(msg.ParserKey)`. All 5 keys registered via `AddKeyedScoped` in Program.cs. Log line "Resolved parser: {ParserType}" at CrawlerEventListener line 64. Runtime confirmation requires human testing. |
| 4 | A parsed EPL fixtures response produces a `data_entries` row with valid JSONB payload and stable `entry_key` | VERIFIED (static) | FootballParser produces `match_{id}` and `standing_{teamId}` entry keys with structured payload (home_team, away_team, points, position, etc.). `UpsertEntryAsync` in CrawlerEventListener performs `ON CONFLICT (source_id, entry_key) DO UPDATE`. End-to-end row production requires human testing. |
| 5 | Querying `data_entries` with a JSONB field filter uses the GIN index (EXPLAIN ANALYZE shows Bitmap Index Scan) | VERIFIED (schema only) | GIN index defined in migration at line 188 with `"Npgsql:IndexMethod": "gin"` on `data_entries.payload`. Runtime EXPLAIN ANALYZE requires human testing. |

**Score: 5/5 truths pass static verification** — 3 items require runtime confirmation with human testing.

### Deferred Items

None.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/Data/AppDbContext.cs` | DbContext with 5 DbSets and Fluent API config | VERIFIED | All 5 DbSets present; GIN index, UNIQUE constraint, JSONB column types, all FK relationships configured (unchanged from initial verification) |
| `apps/api/Data/Entities/Source.cs` | Source entity with ParserKey | VERIFIED | `ParserKey` property with `IsRequired()` annotation (unchanged) |
| `apps/api/Data/Entities/DataEntry.cs` | DataEntry with JSONB payload | VERIFIED | `JsonDocument Payload` with `HasColumnType("jsonb")` (unchanged) |
| `apps/api/Data/Entities/CrawlJob.cs` | CrawlJob entity matching SCHEMA.md | VERIFIED | All columns present (unchanged) |
| `apps/api/Data/Entities/AlertRule.cs` | AlertRule entity | VERIFIED | JSONB condition column present (unchanged) |
| `apps/api/Data/Entities/NotificationLog.cs` | NotificationLog entity | VERIFIED | FK to AlertRule (cascade) and DataEntry (set null) (unchanged) |
| `apps/api/Migrations/` | At least one migration file | VERIFIED | `20260410064655_20260410_InitialSchema.cs` + Designer + Snapshot (unchanged) |
| `apps/crawler/src/db/crawlJobsDb.ts` | pg Pool, insertCrawlJobAndNotify | VERIFIED | Transaction-safe INSERT + pg_notify('crawler_events'); parameterized queries; CRITICAL comment documents Redis ordering constraint (unchanged) |
| `apps/crawler/src/workers/FootballDataWorker.ts` | calls insertCrawlJobAndNotify with parserKey 'football' | VERIFIED | Line 6 imports insertCrawlJobAndNotify; line 52 writes Redis; lines 53-60 call insertCrawlJobAndNotify with parserKey: 'football' |
| `apps/crawler/src/workers/GenshinWorker.ts` | calls insertCrawlJobAndNotify with parserKey 'genshin' | VERIFIED | Line 6 imports insertCrawlJobAndNotify; line 51 writes Redis; lines 52-59 call with parserKey: 'genshin' |
| `apps/crawler/src/workers/LoLWorker.ts` | calls insertCrawlJobAndNotify with parserKey 'lol' | VERIFIED | Line 7 imports insertCrawlJobAndNotify; line 51 writes Redis; lines 52-59 call with parserKey: 'lol' |
| `apps/crawler/src/workers/AniListWorker.ts` | calls insertCrawlJobAndNotify with parserKey 'anilist' | VERIFIED | Line 6 imports insertCrawlJobAndNotify; line 67 writes Redis; lines 68-75 call with parserKey: 'anilist' |
| `apps/crawler/src/workers/MangaDexWorker.ts` | calls insertCrawlJobAndNotify with parserKey 'mangadex' | VERIFIED | Line 6 imports insertCrawlJobAndNotify; line 47 writes Redis; lines 48-55 call with parserKey: 'mangadex' |
| `apps/api/Parsers/IContentParser.cs` | Parser interface | VERIFIED | `Task<IReadOnlyList<ParsedEntry>> ParseAsync(string rawContent, string sourceId, CancellationToken ct)` (unchanged) |
| `apps/api/Services/CrawlerEventListener.cs` | BackgroundService for LISTEN/NOTIFY | VERIFIED | IServiceScopeFactory; Keepalive=30; WaitAsync loop; GetRequiredKeyedService dispatch at line 62; ON CONFLICT UPSERT at lines 95-105; logs "Resolved parser: {ParserType}" at line 64 |
| `apps/api/Parsers/FootballParser.cs` | Full implementation (not stub) | VERIFIED | Handles both matches (match_{id}) and standings (standing_{teamId}); LogWarning on missing fields; no throws; 124 lines |
| `apps/api/Parsers/GenshinParser.cs` | Full implementation | VERIFIED | event_{id} entry key; multi-path JSON navigation for HoYoWiki variants; 101 lines |
| `apps/api/Parsers/LolParser.cs` | Full implementation | VERIFIED | champion_{name}_{role} entry key; multi-path __NEXT_DATA__ navigation; 147 lines |
| `apps/api/Parsers/AniListParser.cs` | Full implementation | VERIFIED | anime_{id} entry key; Unix timestamp to date conversion; handles GraphQL response shape; 154 lines |
| `apps/api/Parsers/MangaDexParser.cs` | Full implementation | VERIFIED | chapter_{id} entry key; relationship extraction for manga_title (graceful null when not present); 137 lines |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/api/Program.cs` | `AppDbContext` | `AddDbContext<AppDbContext>` | WIRED | Present (unchanged) |
| `apps/api/Program.cs` | `CrawlerEventListener` | `AddHostedService<CrawlerEventListener>` | WIRED | Present (unchanged) |
| `apps/api/Program.cs` | `IContentParser` (x5) | `AddKeyedScoped` with keys football/genshin/lol/anilist/mangadex | WIRED | All 5 keyed registrations (unchanged) |
| `apps/api/Program.cs` | `IConnectionMultiplexer` | `AddSingleton` | WIRED | Redis connection registered (unchanged) |
| `CrawlerEventListener` | `IContentParser` | `GetRequiredKeyedService<IContentParser>(parserKey)` | WIRED | Line 62 (unchanged) |
| `CrawlerEventListener` | PostgreSQL LISTEN | `LISTEN crawler_events` | WIRED | Line 36 (unchanged) |
| `CrawlerEventListener` | Redis | `StringGetAsync($"job:raw:{msg.JobId}")` | WIRED | Line 67 (unchanged) |
| `crawlJobsDb.ts` | PostgreSQL | `pg_notify('crawler_events', $1)` in transaction | WIRED | Line 49 (unchanged) |
| `FootballDataWorker` | `crawlJobsDb.ts` | `import { insertCrawlJobAndNotify }` + call at line 53 | WIRED | Gap closed — was NOT WIRED in initial verification |
| `GenshinWorker` | `crawlJobsDb.ts` | `import { insertCrawlJobAndNotify }` + call at line 52 | WIRED | Gap closed — was NOT WIRED in initial verification |
| `LoLWorker` | `crawlJobsDb.ts` | `import { insertCrawlJobAndNotify }` + call at line 52 | WIRED | Gap closed — was NOT WIRED in initial verification |
| `AniListWorker` | `crawlJobsDb.ts` | `import { insertCrawlJobAndNotify }` + call at line 68 | WIRED | Gap closed — was NOT WIRED in initial verification |
| `MangaDexWorker` | `crawlJobsDb.ts` | `import { insertCrawlJobAndNotify }` + call at line 48 | WIRED | Gap closed — was NOT WIRED in initial verification |
| Source workers (x5) | Redis | `connection.set(job:raw:${jobId}, ..., 'EX', 300)` before pg call | WIRED | Ordering constraint satisfied in all 5 workers |

---

### Data-Flow Trace (Level 4)

| Component | Data Variable | Source | Produces Real Data | Status |
|-----------|--------------|--------|--------------------|--------|
| `FootballDataWorker` | `data` (EplStandingsResponse) | `axios.get` to football-data.org API | Yes — live API response | FLOWING — written to Redis then notified |
| `GenshinWorker` | `data` | HoYoWiki API or Cheerio fallback | Yes — live API or scraped HTML | FLOWING — written to Redis then notified |
| `LoLWorker` | `nextData` | u.gg HTML parsed for `__NEXT_DATA__` | Yes — live page scrape | FLOWING — written to Redis then notified |
| `AniListWorker` | `data` (AniListResponse) | GraphQL POST to graphql.anilist.co | Yes — live GraphQL response | FLOWING — written to Redis then notified |
| `MangaDexWorker` | `data` (MangaDexResponse) | `axios.get` to mangadex.org API | Yes — live API response | FLOWING — written to Redis then notified |
| `CrawlerEventListener.HandleNotificationAsync` | `raw` (Redis value) | `StringGetAsync(job:raw:{jobId})` | Yes — key now written by all 5 source workers before NOTIFY | FLOWING — Redis key guaranteed present at time of notification |
| `FootballParser.ParseAsync` | `rawContent` | Caller (CrawlerEventListener) passing Redis value | Yes — real API data | FLOWING — pipeline fully connected |

---

### Behavioral Spot-Checks

| Behavior | Verification | Result | Status |
|----------|-------------|--------|--------|
| All 5 workers import insertCrawlJobAndNotify | File inspection (line 6/7) | `import { insertCrawlJobAndNotify } from '../db/crawlJobsDb.js'` present in all 5 workers | PASS |
| FootballDataWorker passes parserKey 'football' | File inspection line 59 | `parserKey: 'football'` | PASS |
| GenshinWorker passes parserKey 'genshin' | File inspection line 58 | `parserKey: 'genshin'` | PASS |
| LoLWorker passes parserKey 'lol' | File inspection line 58 | `parserKey: 'lol'` | PASS |
| AniListWorker passes parserKey 'anilist' | File inspection line 74 | `parserKey: 'anilist'` | PASS |
| MangaDexWorker passes parserKey 'mangadex' | File inspection line 54 | `parserKey: 'mangadex'` | PASS |
| Redis write precedes insertCrawlJobAndNotify call in all workers | Line order inspection | Redis `connection.set(job:raw:${jobId}, ...)` always appears before `insertCrawlJobAndNotify` call in every worker | PASS |
| crawlJobsDb.ts issues pg_notify inside transaction | File inspection line 49 | `SELECT pg_notify('crawler_events', $1)` before COMMIT at line 50 | PASS |
| CrawlerEventListener resolves parser by key | File inspection line 62 | `GetRequiredKeyedService<IContentParser>(msg.ParserKey)` | PASS |
| CrawlerEventListener logs resolved type name | File inspection line 64 | `logger.LogInformation("Resolved parser: {ParserType}", parser.GetType().Name)` | PASS |
| UPSERT handles ON CONFLICT | File inspection lines 95-104 | `ON CONFLICT (source_id, entry_key) DO UPDATE SET payload = EXCLUDED.payload, ...` | PASS |
| NOTIFY latency < 1 second | Requires running stack | Cannot verify statically | SKIP — human item #1 |
| GIN index used in EXPLAIN ANALYZE | Requires running PostgreSQL with data | Cannot verify statically | SKIP — human item #2 |
| data_entries rows written end-to-end | Requires running stack | Cannot verify statically | SKIP — human item #3 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| STORE-01 | 03-01, 03-02 | Raw crawl metadata stored in crawl_jobs table | VERIFIED | All 5 source workers now call insertCrawlJobAndNotify which INSERTs into crawl_jobs. Table schema is correct. |
| STORE-02 | 03-01 | data_entries with JSONB payload, GIN-indexed | VERIFIED | Schema confirmed: `HasColumnType("jsonb")` + `HasMethod("gin")` in AppDbContext and migration |
| STORE-03 | 03-01 | Each entry has stable entry_key | VERIFIED | UNIQUE constraint on (source_id, entry_key); each parser produces deterministic entry_key values |
| STORE-04 | 03-01 | PostgreSQL schema managed via EF Core Migrations | VERIFIED | Migration file exists and was applied |
| PARSE-01 | 03-03, 03-04, 03-05 | Each domain has dedicated parser implementing IContentParser | VERIFIED | All 5 parsers are full implementations (not stubs) |
| PARSE-02 | 03-03 | Parser selection is config-driven via keyed services (no hardcoded switch) | VERIFIED | AddKeyedScoped registrations in Program.cs; GetRequiredKeyedService dispatch in CrawlerEventListener |
| PARSE-03 | 03-02, 03-03 | Parsers triggered via PostgreSQL LISTEN/NOTIFY from Node.js to .NET | VERIFIED (static) | End-to-end wiring complete: source workers write Redis → call insertCrawlJobAndNotify → pg_notify fires on COMMIT → CrawlerEventListener receives → resolves parser → UPSERTs data_entries. Runtime confirmation pending human testing. |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `apps/crawler/src/workers/crawlWorker.ts` line 46 | `logger.info('Crawl job completed (stub)')` for unknown strategy — no source worker enqueues to crawl-default queue | Info | Not a blocker — source workers now use their own queues with direct insertCrawlJobAndNotify calls. crawl-default queue is dead code but harmless. |

No blockers. One informational pattern (dead crawl-default queue) — not blocking goal achievement.

---

### Human Verification Required

#### 1. NOTIFY Latency Confirmation

**Test:** Start the full Docker stack (`docker compose up`). Enqueue a job to the `crawl-football-data.org` BullMQ queue. Watch the .NET API container logs.
**Expected:** Within 1 second of the Node.js COMMIT, the API logs show in sequence: `NOTIFY received on crawler_events: {"job_id":"...","source_id":"football-data.org","parser_key":"football"}`, then `Dispatching parser for key=football`, then `Resolved parser: FootballParser`, then `Parser produced N entries`
**Why human:** Requires running Docker stack; sub-second latency measurement requires real execution

#### 2. GIN Index Runtime Confirmation

**Test:** After at least one crawl cycle has written rows to `data_entries`, run inside PostgreSQL: `EXPLAIN ANALYZE SELECT * FROM data_entries WHERE payload @> '{"competition": "Premier League"}'`
**Expected:** Query plan shows `Bitmap Index Scan on ix_data_entries_payload` rather than `Seq Scan on data_entries`
**Why human:** Cannot run EXPLAIN ANALYZE programmatically without a running PostgreSQL instance with data rows present

#### 3. End-to-End Data Flow Confirmation

**Test:** After a full crawl cycle completes, run: `SELECT source_id, entry_key, category FROM data_entries ORDER BY crawled_at DESC LIMIT 20`
**Expected:** Rows with entry_key patterns: `standing_NNN` or `match_NNN` (football), `chapter_<uuid>` (mangadex), `anime_NNN` (anilist), `event_NNN` (genshin), `champion_<name>_<role>` (lol); categories: football, manga, anime, game
**Why human:** Requires running the full stack end-to-end; cannot produce or query data_entries rows without live services

---

## Conclusion

The gap identified in the initial verification — that source workers were not wired to call `insertCrawlJobAndNotify` — is fully resolved in commit cb74fd9. All 5 workers (FootballDataWorker, GenshinWorker, LoLWorker, AniListWorker, MangaDexWorker) now:

1. Write raw content to Redis at `job:raw:{jobId}` with 300s TTL (before the pg transaction)
2. Call `insertCrawlJobAndNotify` with the correct `parserKey` per source
3. The ordering constraint (Redis write before pg transaction) is satisfied in all 5 workers

The complete data pipeline is wired: Node.js source workers → `crawlJobsDb.ts` → PostgreSQL `crawl_jobs` INSERT + `pg_notify` → `CrawlerEventListener` (LISTEN) → `GetRequiredKeyedService<IContentParser>(parserKey)` → parser `ParseAsync` → `data_entries` UPSERT.

Three items remain for human verification with a running stack: NOTIFY latency, GIN index usage in EXPLAIN ANALYZE, and end-to-end data_entries row production.

---

_Verified: 2026-04-10T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: after gap closure commit cb74fd9_
