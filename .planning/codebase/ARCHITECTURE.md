# Architecture
_Last updated: 2026-04-06_

## Status

This project has no source code yet. All architecture described here is **planned/designed** in the root-level planning documents (`ARCHITECTURE.md`, `SCHEMA.md`, `REQUIREMENTS.md`, `ROADMAP.md`). No `src/` directory exists. Implementation begins at Phase 1.

---

## Pattern Overview

**Overall:** Multi-process pipeline with message queue decoupling

**Key Characteristics:**
- Crawler layer (Node.js) is fully decoupled from storage/API layer (.NET) via BullMQ/Redis message queues
- Queue-per-domain politeness model — each domain gets its own BullMQ queue with rate limiting
- Strategy Pattern for content parsers — one parser class per domain, all implementing `IContentParser`
- JSONB payload columns in PostgreSQL allow flexible per-domain data schemas without separate tables
- Two worker types (Cheerio for static HTML, Playwright for JS-rendered SPAs) selected per source

---

## Layers

**Crawler Layer (Node.js):**
- Purpose: Fetch, deduplicate, and parse web content
- Planned location: `crawler/` (monorepo subdirectory)
- Contains: URL Frontier, DNS cache, robots.txt cache, Bloom Filter deduplicator, Cheerio workers, Playwright workers, content hasher, BullMQ job producers
- Depends on: Redis (queue + cache), PostgreSQL (content hash lookup)
- Used by: Nothing — this layer is a producer only

**API / Backend Layer (ASP.NET Core):**
- Purpose: Serve dashboard data, manage sources/rules, handle notification dispatch
- Planned location: `api/` (monorepo subdirectory)
- Contains: REST endpoints, SignalR hub, EF Core models, content parsers (Strategy Pattern), diff engine, alert rule engine, notification background workers
- Depends on: PostgreSQL (primary data store), Redis (BullMQ consumer for parsed-data and notifications queues)
- Used by: Next.js dashboard (REST + SignalR), external notification channels (Telegram, Discord)

**Dashboard Layer (Next.js):**
- Purpose: User-facing UI for viewing crawled data and managing configuration
- Planned location: `dashboard/` (monorepo subdirectory)
- Contains: Data tables, charts, alert rule CRUD, job status views
- Depends on: .NET API (REST for data, SignalR for real-time push)
- Used by: End user (browser)

**Shared Infrastructure:**
- Purpose: Message transport and caching
- Components: Redis (BullMQ queues + DNS cache + robots.txt cache + Bloom Filter persistence), PostgreSQL
- Planned location: Docker Compose services (local dev), Oracle Cloud Always Free (production)

---

## Data Flow

**Standard Crawl Flow:**

1. Scheduler triggers a BullMQ job on the appropriate domain queue (per-source `crawl_interval`)
2. URL Frontier picks the highest-priority URL, checks politeness queue cooldown
3. DNS resolution checked against in-memory cache (TTL 10 min); falls back to live lookup
4. `robots.txt` checked via per-domain cache; disallowed URLs are skipped
5. Crawl Worker fetches content — Cheerio (static HTML) or Playwright (JS-rendered SPA) depending on source `crawler_type`
6. Raw HTML is MD5-hashed; compared against `crawl_jobs.content_hash` — unchanged content is skipped (content dedup)
7. If content changed: new URLs extracted from page are filtered through Bloom Filter (URL dedup) and pushed to `queue:new-urls`
8. Parsed data pushed to `queue:parsed-data`
9. .NET consumer reads `queue:parsed-data`, runs the domain-specific `IContentParser`, saves to `data_entries` (PostgreSQL)
10. Diff engine compares new payload against last snapshot → if alert conditions match, pushes to `queue:notifications`
11. Notification worker sends Telegram/Discord message; SignalR pushes real-time update to dashboard

**Notification Flow:**

1. .NET `NotificationWorker` (IHostedService) dequeues from `queue:notifications`
2. Loads matching `alert_rules` for the source
3. Evaluates rule conditions: `new_item`, `field_changed`, `threshold`
4. On match: renders `message_tpl` with payload values, sends via Telegram Bot API or Discord Webhook
5. Logs outcome to `notification_logs` table
6. SignalR hub broadcasts update to connected dashboard clients

---

## Key Abstractions

**URL Frontier:**
- Purpose: Manages which URLs to crawl next, enforcing both priority and politeness
- Planned location: `crawler/src/frontier/`
- Pattern: Priority Queue (score 1–10) + per-domain politeness queues using BullMQ `limiter` (min 2s between requests to same domain)

**Crawl Workers:**
- Purpose: Fetch remote content using the appropriate HTTP/browser strategy
- Planned location: `crawler/src/workers/`
- Pattern: Two concrete implementations selected via source `crawler_type` field:
  - `CheerioWorker` — axios GET + cheerio HTML parsing
  - `PlaywrightWorker` — Chromium headless, waits for `networkidle`

**URL Deduplicator (Bloom Filter):**
- Purpose: Prevent re-queuing already-seen URLs with O(1) memory-efficient lookup
- Planned location: `crawler/src/dedup/`
- Pattern: `bloom-filters` npm package, 100k capacity, 1% false positive rate (~120KB memory)

**Content Deduplicator:**
- Purpose: Avoid storing and alerting on unchanged content
- Planned location: `crawler/src/dedup/`
- Pattern: MD5 hash of raw HTML stored in `crawl_jobs.content_hash`; new hash compared before processing

**Content Parsers (Strategy Pattern):**
- Purpose: Transform raw HTML/JSON into structured domain-specific `ParsedData`
- Planned location: `api/Parsers/`
- Pattern: `IContentParser` interface with one concrete class per domain (e.g., `GenshinEventParser`, `FootballResultParser`, `AnimeScheduleParser`)

**Diff Engine:**
- Purpose: Detect meaningful changes between successive crawls to trigger alerts
- Planned location: `api/Services/DiffEngine.cs`
- Pattern: JSON diff comparison of `data_entries.payload` snapshots

**Alert Rule Engine:**
- Purpose: Evaluate config-driven conditions against new data payloads
- Planned location: `api/Services/AlertRuleEngine.cs`
- Pattern: Condition types stored as JSONB in `alert_rules.condition`: `new_item`, `field_changed`, `threshold`

---

## Entry Points

**Crawler Scheduler:**
- Planned location: `crawler/src/index.ts`
- Triggers: Cron/interval per source `crawl_interval` field
- Responsibilities: Seed URL Frontier, start BullMQ workers

**API Server:**
- Planned location: `api/Program.cs`
- Triggers: HTTP requests, BullMQ queue consumers (via `IHostedService`), SignalR connections
- Responsibilities: REST API, data persistence, notification dispatch, real-time push

**Dashboard App:**
- Planned location: `dashboard/app/page.tsx` (Next.js App Router)
- Triggers: Browser navigation
- Responsibilities: Display crawled data, manage sources and alert rules, real-time updates via SignalR

---

## Message Queues

Three BullMQ queues on Redis:

| Queue | Producer | Consumer | Purpose |
|---|---|---|---|
| `queue:parsed-data` | Node.js crawler | .NET API worker | Transfer extracted page data to storage layer |
| `queue:notifications` | .NET diff/alert engine | .NET NotificationWorker | Dispatch Telegram/Discord alerts |
| `queue:new-urls` | Node.js crawler (link extractor) | Node.js URL Frontier | Recirculate discovered links back into crawl pipeline |
| `crawl:{domain}` (per-domain) | Node.js scheduler | Node.js crawl worker | Politeness-controlled crawl jobs |

---

## Database Design

**PostgreSQL** with JSONB for flexible per-domain payloads. Five tables:

| Table | Purpose |
|---|---|
| `sources` | Config registry of all crawl sources (URL, interval, priority, crawler type) |
| `crawl_jobs` | Audit log of every crawl attempt with status, content hash, error details |
| `data_entries` | Parsed output from all sources; `payload JSONB` stores domain-specific structure |
| `alert_rules` | Config-driven notification conditions per source |
| `notification_logs` | History of all sent notifications |

Key design choice: `data_entries.payload JSONB` + GIN index allows `payload @> '{"is_active": true}'` queries without separate per-domain tables. EF Core Migrations manage schema versioning (naming: `YYYYMMDD_description`).

---

## Error Handling

**Strategy:** Retry with exponential backoff at the job queue level

**Patterns:**
- BullMQ job retries: max 3 attempts, exponential backoff starting at 5s (`backoff: { type: 'exponential', delay: 5000 }`)
- Failed jobs after max retries go to BullMQ dead-letter queue for manual inspection
- Individual source failures are isolated — one unavailable domain does not affect other crawl workers
- `crawl_jobs.status` tracks `pending | running | done | failed | skipped` for observability
- Health check endpoints (`GET /health`) planned for Phase 4

---

## Cross-Cutting Concerns

**Logging:** Structured logging — `winston` (Node.js crawler), `Serilog` (.NET API). Planned from Phase 4.

**Validation:** robots.txt compliance enforced before every fetch; `User-Agent: PersonalCrawlerBot/1.0` set on all requests.

**Authentication:** Not implemented — personal project, no user auth. API is internal only.

**Real-time:** SignalR WebSocket hub in .NET pushes updates to dashboard when new data arrives.

**Scheduling:** BullMQ delayed/repeating jobs driven by `sources.crawl_interval` (seconds). No external cron needed.
