# Roadmap: Web Crawler & Data Aggregator

## Overview

Ten phases that build a personal data aggregation system from an empty monorepo to a deployed, alerting, real-time dashboard. Each phase delivers one coherent, verifiable capability and teaches one system design concept. Phases 1-4 constitute the v1 milestone; Phases 5-10 are planned v2 expansion.

---

## Phases

- [x] **Phase 1: Monorepo Foundation & Crawler Skeleton** - Turborepo monorepo wired, Docker Compose running, Cheerio + Playwright workers verified on ARM, BullMQ queue proven with football-data.org as the first live source (completed 2026-04-07)
- [ ] **Phase 2: Full URL Frontier & Crawl Hardening** - Bloom Filter dedup, per-domain politeness queues, robots.txt caching, exponential backoff, dead-letter queue, and all five data sources crawling
- [ ] **Phase 3: PostgreSQL Schema & LISTEN/NOTIFY Handoff** - Database schema live with EF Core Migrations, Node→.NET handoff via LISTEN/NOTIFY, keyed-service parser dispatch, JSONB entries stored
- [ ] **Phase 4: Notification Engine** - Diff engine evaluating alert rules, Telegram and Discord delivery, notification logs persisted
- [ ] **Phase 5: .NET REST API** - Full CRUD for sources and alert rules, job management endpoints, paginated entries query, health check
- [ ] **Phase 6: SignalR Real-Time Layer** - SignalR hub pushing new entries to connected clients without polling
- [ ] **Phase 7: Next.js Dashboard — Core Views** - Data table with filters, source management UI, job management UI
- [ ] **Phase 8: Next.js Dashboard — Alerts & Charts** - Alert rule CRUD UI, notification history, volume trend charts
- [ ] **Phase 9: Real-Time Dashboard Integration** - SignalR client wired to dashboard, new entries appear live
- [ ] **Phase 10: Production Deployment** - docker-compose.prod.yml on Oracle Cloud ARM, Nginx/Caddy HTTPS, Vercel dashboard, Redis + Bloom Filter persistence

---

## Phase Details

### Phase 1: Monorepo Foundation & Crawler Skeleton

**Goal**: A working monorepo runs all services via a single `docker compose up`, a BullMQ job successfully fetches EPL data from football-data.org, and Playwright on ARM is proven functional.

**Teaches**: Distributed job queue architecture (URL Frontier pattern); ARM Docker compatibility; monorepo orchestration with Turborepo.

**Depends on**: Nothing (first phase)

**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, CRAWL-01, CRAWL-02, CRAWL-03, SRC-01

**Success Criteria** (what must be TRUE):
  1. `docker compose up` brings up PostgreSQL, Redis, crawler, API, and dashboard containers with `condition: service_healthy` all passing
  2. A BullMQ job fetches EPL standings from football-data.org and logs a structured JSON result visible in winston output
  3. A Playwright smoke test on ARM renders a target page and returns non-empty HTML without crashes or sandbox errors
  4. `turbo build` succeeds across all workspace packages from a clean checkout
  5. BullMQ worker receives SIGTERM and drains its current job before exiting (graceful shutdown confirmed in logs)

**Plans**: 7 plans

Plans:
- [x] 01-01: Turborepo + pnpm workspace scaffold (`apps/crawler`, `apps/api`, `apps/dashboard`, `packages/shared-types`)
- [ ] 01-02: Docker Compose local dev stack (PostgreSQL, Redis with health checks, service containers, ARM64 base images)
- [ ] 01-03: Structured logging setup (winston in Node.js, Serilog in .NET, consistent JSON format)
- [ ] 01-04: BullMQ queue bootstrap — named queue, worker process, job producer, SIGTERM graceful shutdown
- [ ] 01-05: Cheerio crawl worker — HTTP fetch + Cheerio parse, result logged
- [ ] 01-06: Playwright crawl worker — browser pool (max 3), ARM Docker validation, smoke test page render
- [ ] 01-07: football-data.org integration — scheduled job, API fetch, raw response logged as first live crawl

**UI hint**: no

---

### Phase 2: Full URL Frontier & Crawl Hardening

**Goal**: The crawler enforces all production-quality crawling constraints — Bloom Filter URL dedup, per-domain politeness, robots.txt compliance, retry with exponential backoff, dead-letter queue — and all five configured data sources successfully produce raw crawl results.

**Teaches**: Probabilistic data structures (Bloom Filter); rate limiting patterns; fault-tolerant retry design.

**Depends on**: Phase 1

**Requirements**: CRAWL-04, CRAWL-05, CRAWL-06, CRAWL-07, CRAWL-08, CRAWL-09, SRC-02, SRC-03, SRC-04, SRC-05

**Success Criteria** (what must be TRUE):
  1. Submitting the same URL twice results in exactly one crawl job (Bloom Filter blocks the duplicate, verified in logs)
  2. Two requests to the same domain are separated by at least 2 seconds (measured in crawl timestamps)
  3. A domain with `Disallow: /` in robots.txt is never crawled (job created but skipped with `disallowed` status)
  4. A crawl job that fails three times transitions to `status='failed'` dead-letter state and appears in job list with that status
  5. All five sources (football-data.org, HoYoWiki, Riot/u.gg, AniList, MangaDex) produce raw crawl output in logs

**Plans**: 6 plans

Plans:
- [ ] 02-01: Bloom Filter implementation — `bloom-filters` npm, 100k capacity, 0.1% FP, Redis JSON persistence on shutdown/reload
- [ ] 02-02: Per-domain BullMQ rate limiter — one named queue per domain, `concurrency: 1`, `limiter: { max: 1, duration: 2000 }`
- [ ] 02-03: robots.txt fetcher and cache — fetch on first domain visit, cache in Redis with 24h TTL, enforce Disallow rules
- [ ] 02-04: MD5 content hash dedup — hash response body, store in crawl_jobs, skip storage if hash unchanged
- [ ] 02-05: Retry + dead-letter — exponential backoff (5s, 10s, 20s), max 3 attempts, BullMQ `failedJobsRetention`, dead-letter state
- [ ] 02-06: Remaining data sources — HoYoWiki Cheerio scraper, Riot API + u.gg `__NEXT_DATA__` extractor, AniList GraphQL client, MangaDex API client

**UI hint**: no

---

### Phase 3: PostgreSQL Schema, Parsers & LISTEN/NOTIFY Handoff

**Goal**: Crawled data flows from Node.js through PostgreSQL LISTEN/NOTIFY into .NET keyed-service parsers and lands in `data_entries` as structured JSONB rows with stable `entry_key` values.

**Teaches**: Event-driven microservice handoff (outbox/LISTEN/NOTIFY pattern); Strategy Pattern for pluggable parsers; JSONB schema design.

**Depends on**: Phase 2

**Requirements**: STORE-01, STORE-02, STORE-03, STORE-04, PARSE-01, PARSE-02, PARSE-03

**Success Criteria** (what must be TRUE):
  1. `dotnet ef migrations apply` from a clean state creates all five tables (sources, crawl_jobs, data_entries, alert_rules, notification_logs) with correct columns and indexes
  2. A crawl job completion in Node.js triggers a PostgreSQL NOTIFY and the .NET listener logs receipt within 1 second
  3. The correct parser (e.g., `FootballParser`) is resolved by keyed services based on the source's `parser_key` config — confirmed via log of resolved type name
  4. A parsed EPL fixtures response produces a `data_entries` row with a valid JSONB payload and a stable `entry_key` (e.g., `match_12345`)
  5. Querying `data_entries` with a JSONB field filter uses the GIN index (confirmed via `EXPLAIN ANALYZE` showing `Bitmap Index Scan`)

**Plans**: 5 plans

Plans:
- [ ] 03-01: EF Core schema — Migrations for all five tables, GIN index on `data_entries.payload`, `entry_key` unique constraint
- [ ] 03-02: PostgreSQL LISTEN/NOTIFY outbox — Node.js emits NOTIFY after job insert, .NET Npgsql background service subscribes and logs
- [ ] 03-03: `IContentParser` interface + keyed service registration — interface definition, `AddKeyedScoped` registrations, resolver helper
- [ ] 03-04: Football + Genshin parsers — `FootballParser` (standings/fixtures), `GenshinParser` (events), both writing JSONB `data_entries`
- [ ] 03-05: Remaining parsers — `LolParser` (tier list from `__NEXT_DATA__`), `AniListParser` (airing schedule), `MangaDexParser` (chapters)

**UI hint**: no

---

### Phase 4: Notification Engine

**Goal**: After each parse, the system evaluates configured alert rules using a diff engine and delivers matching notifications to Telegram and/or Discord, logging every delivery attempt.

**Teaches**: Event-driven alert evaluation; diff-based change detection; fan-out notification pattern.

**Depends on**: Phase 3

**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07

**Success Criteria** (what must be TRUE):
  1. A new `data_entries` row with an unseen `entry_key` triggers a `new_item` alert and a Telegram message is received within 10 seconds
  2. Changing a tracked JSONB field (e.g., EPL team points) triggers a `field_changed` alert with old and new values in the notification body
  3. A numeric JSONB field crossing a configured threshold triggers a `threshold` alert
  4. A Discord webhook receives the same alert content as Telegram when both channels are configured on the same rule
  5. Every delivery attempt (success or failure) produces a row in `notification_logs` with status and timestamp

**Plans**: 5 plans

Plans:
- [ ] 04-01: Diff engine — `microdiff` integration, snapshot comparison against last `data_entries` payload for same `entry_key`
- [ ] 04-02: Alert rule evaluator — `new_item`, `field_changed`, `threshold` condition handlers, rule-to-entry matching
- [ ] 04-03: Telegram Bot delivery — `node-telegram-bot-api` or direct HTTP, message formatting, error handling
- [ ] 04-04: Discord Webhook delivery — HTTP POST to webhook URL, embed formatting, error handling
- [ ] 04-05: Notification logging — `notification_logs` insert on every attempt, retry on delivery failure (up to 2x), dedup guard

**UI hint**: no

---

### Phase 5: .NET REST API

**Goal**: All dashboard data needs are served by a documented .NET API with full CRUD for sources and alert rules, paginated entries query, job management endpoints, and a health check.

**Teaches**: RESTful API design; cursor pagination; ASP.NET Core 8 minimal API vs controller trade-offs.

**Depends on**: Phase 3

**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06, API-07, API-08, API-09, API-11

**Success Criteria** (what must be TRUE):
  1. `GET /api/entries?category=football&limit=20&cursor=<token>` returns 20 entries and a next-page cursor (verified with two sequential calls)
  2. Full sources CRUD cycle works: POST creates a source, PUT updates its interval, DELETE removes it, and GET no longer returns it
  3. `POST /api/jobs/{id}/retry` on a dead-letter job transitions it back to `pending` and the BullMQ queue picks it up within 5 seconds
  4. Full alert rules CRUD cycle works: POST creates a rule with condition JSON, GET returns it, DELETE removes it
  5. `GET /health` returns `200 OK` with JSON body showing PostgreSQL and Redis connectivity status

**Plans**: 5 plans

Plans:
- [ ] 05-01: API project setup — ASP.NET Core 8, EF Core DbContext wired, Serilog request logging middleware, CORS policy
- [ ] 05-02: Entries endpoint — `GET /api/entries` with category/source/date filters and cursor-based pagination
- [ ] 05-03: Sources CRUD — `GET/POST/PUT/DELETE /api/sources` with validation and EF Core persistence
- [ ] 05-04: Jobs + alert rules endpoints — `GET /api/jobs`, `POST /api/jobs/{id}/retry` (BullMQ Redis bridge), `GET/POST/DELETE /api/alert-rules`
- [ ] 05-05: Health check — `GET /health` checking PostgreSQL ping and Redis ping, returning structured JSON

**UI hint**: no

---

### Phase 6: SignalR Real-Time Layer

**Goal**: Connected dashboard clients receive new `data_entries` rows pushed in real time via a SignalR hub, without polling.

**Teaches**: WebSocket abstraction with SignalR; server-push vs. polling trade-offs; hub connection lifecycle.

**Depends on**: Phase 4, Phase 5

**Requirements**: API-10

**Success Criteria** (what must be TRUE):
  1. Opening two browser tabs to the SignalR test page and triggering a crawl causes both tabs to display the new entry simultaneously without page refresh
  2. A client that disconnects and reconnects within 30 seconds receives entries published during the gap (via SignalR reconnect buffer)
  3. Hub connection count is visible in the `GET /health` response (confirms hub is alive)

**Plans**: 3 plans

Plans:
- [ ] 06-01: SignalR hub — `/hubs/dashboard` hub class, `NewEntry` event method, hub registration in DI
- [ ] 06-02: Hub trigger integration — after `data_entries` insert, `IHubContext<DashboardHub>` broadcasts the new row as JSON
- [ ] 06-03: Client connection test — minimal HTML page with SignalR JS client, connect/display loop, reconnect policy

**UI hint**: no

---

### Phase 7: Next.js Dashboard — Core Views

**Goal**: The dashboard renders a filterable data table, a source management page, and a job management page — all fetching live data from the .NET API.

**Teaches**: Next.js App Router data fetching patterns; server vs. client component split; optimistic UI for CRUD operations.

**Depends on**: Phase 5

**Requirements**: DASH-01, DASH-03, DASH-04

**Success Criteria** (what must be TRUE):
  1. The data table loads entries filtered by category and source, shows a next-page button, and fetching more entries appends rows without a full page reload
  2. A new source added via the source management form appears in the table within one page interaction (no manual refresh)
  3. A failed job on the job status page has a "Retry" button that transitions its status to "pending" and the UI reflects the new status within 5 seconds
  4. All three pages pass Next.js build with zero TypeScript errors

**Plans**: 5 plans

Plans:
- [ ] 07-01: Next.js project setup — App Router, Tailwind CSS, API client module (typed fetch wrappers around .NET API), environment config (`NEXT_PUBLIC_API_URL` vs `API_URL`)
- [ ] 07-02: Data table page — server component fetch, client-side filter controls (category, source, date range), cursor pagination with "Load more"
- [ ] 07-03: Source management page — list view, add/edit modal form, delete confirmation, optimistic UI updates
- [ ] 07-04: Job management page — status-filtered job table, retry button with loading state, auto-refresh every 30s
- [ ] 07-05: Shared layout — navigation sidebar, responsive shell, loading skeletons, error boundary components

**UI hint**: yes

---

### Phase 8: Next.js Dashboard — Alerts & Charts

**Goal**: The dashboard has a working alert rule CRUD interface, a notification history log, and volume trend charts backed by live API data.

**Teaches**: Form handling for complex nested JSON (alert rule conditions); Recharts/Chart.js integration; time-series data aggregation for charting.

**Depends on**: Phase 7

**Requirements**: DASH-02, DASH-05, DASH-06

**Success Criteria** (what must be TRUE):
  1. An alert rule created via the form (with condition type, field path, and threshold) is saved and listed — editing it pre-populates the form correctly
  2. The notification history page shows log entries with status (sent/failed), channel (Telegram/Discord), and timestamp — filterable by source
  3. The volume chart shows entry counts per day for the last 7 days per source, with the correct source labeled on each line
  4. All pages pass Next.js build with zero TypeScript errors

**Plans**: 4 plans

Plans:
- [ ] 08-01: Alert rule CRUD page — list with condition summary, add/edit form with condition type selector and dynamic field inputs, delete
- [ ] 08-02: Notification history page — table with status/channel/message/timestamp columns, filter by source or channel
- [ ] 08-03: Charts page — entry volume over time (line chart), per-source breakdown (bar or stacked), date range selector
- [ ] 08-04: Chart data endpoint — `GET /api/stats/volume?groupBy=day&range=7d` added to .NET API, aggregates `data_entries` by source and date

**UI hint**: yes

---

### Phase 9: Real-Time Dashboard Integration

**Goal**: New data entries appear in the dashboard data table in real time without any page refresh, powered by the SignalR hub.

**Teaches**: Client-side WebSocket state management; React state reconciliation with server-pushed events; connection resilience patterns.

**Depends on**: Phase 6, Phase 8

**Requirements**: DASH-07

**Success Criteria** (what must be TRUE):
  1. Triggering a manual crawl while the dashboard is open causes the new entry to appear at the top of the data table within 3 seconds, without refresh
  2. Closing the laptop lid and reopening it (simulated disconnect) results in the SignalR connection auto-reconnecting and entries flowing again within 30 seconds
  3. The connection status indicator in the nav bar correctly shows "Connected" / "Reconnecting" / "Disconnected" states

**Plans**: 3 plans

Plans:
- [ ] 09-01: SignalR client hook — `useSignalR` React hook wrapping `@microsoft/signalr` JS client, connection state management, auto-reconnect policy
- [ ] 09-02: Live data table integration — hook into data table, prepend new entries from `NewEntry` events, cap at 200 rows before trimming old
- [ ] 09-03: Connection status indicator — nav bar component reflecting hub connection state, toast notification on reconnect

**UI hint**: yes

---

### Phase 10: Production Deployment

**Goal**: The full system runs 24/7 on Oracle Cloud ARM (Ampere A1) behind HTTPS, the dashboard is deployed to Vercel, and Redis/Bloom Filter state survives service restarts.

**Teaches**: Container orchestration for production; reverse proxy with TLS termination; state persistence across restarts.

**Depends on**: Phase 9

**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-05, INFRA-02

**Success Criteria** (what must be TRUE):
  1. `docker compose -f docker-compose.prod.yml up -d` on the Oracle Cloud instance starts all services, all health checks pass, and no container restarts within 5 minutes
  2. `https://<domain>/health` returns `200 OK` through Nginx/Caddy with a valid Let's Encrypt certificate (no browser warnings)
  3. The Vercel-deployed dashboard loads, fetches entries from the production API, and real-time SignalR updates work over HTTPS
  4. After `docker compose restart redis`, the Bloom Filter correctly rejects a URL that was seen before the restart (state reloaded from Redis AOF)
  5. After `docker compose restart crawler`, no in-flight job is duplicated or lost (BullMQ job state survives via Redis persistence)

**Plans**: 5 plans

Plans:
- [ ] 10-01: `docker-compose.prod.yml` — production overrides (restart policies, resource limits, no volume mounts for source, ARM64 image tags)
- [ ] 10-02: Nginx/Caddy config — reverse proxy rules for API and SignalR hub (`/hubs/` path WebSocket upgrade), Let's Encrypt HTTPS, Oracle Cloud VCN + iptables firewall rules documented
- [ ] 10-03: Redis persistence — `appendonly yes` + `appendfsync everysec` in Redis config, validate AOF file written after first crawl
- [ ] 10-04: Bloom Filter persistence validation — trigger shutdown, confirm Redis key written, restart, confirm dedup still works for previously-seen URL
- [ ] 10-05: Vercel dashboard deployment — `NEXT_PUBLIC_API_URL` pointed at production API, SignalR WSS upgrade verified, smoke test all pages

**UI hint**: no

---

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Monorepo Foundation & Crawler Skeleton | 1/1 | Complete   | 2026-04-07 |
| 2. Full URL Frontier & Crawl Hardening | 0/6 | Not started | - |
| 3. PostgreSQL Schema, Parsers & LISTEN/NOTIFY Handoff | 0/5 | Not started | - |
| 4. Notification Engine | 0/5 | Not started | - |
| 5. .NET REST API | 0/5 | Not started | - |
| 6. SignalR Real-Time Layer | 0/3 | Not started | - |
| 7. Next.js Dashboard — Core Views | 0/5 | Not started | - |
| 8. Next.js Dashboard — Alerts & Charts | 0/4 | Not started | - |
| 9. Real-Time Dashboard Integration | 0/3 | Not started | - |
| 10. Production Deployment | 0/5 | Not started | - |
