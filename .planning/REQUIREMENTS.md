# Requirements: Web Crawler & Data Aggregator

**Defined:** 2026-04-07
**Core Value:** Automated monitoring delivers timely alerts for events you care about without manual checking

---

## v1 Requirements

### Crawling

- [ ] **CRAWL-01**: System fetches HTML from configured sources on a scheduled interval (per-source configurable)
- [ ] **CRAWL-02**: System supports static HTML sources via Cheerio (fast, lightweight)
- [ ] **CRAWL-03**: System supports JS-rendered SPA sources via Playwright (browser pool, max 3 instances)
- [ ] **CRAWL-04**: System reads and respects `robots.txt` per domain (cached 24h per domain)
- [ ] **CRAWL-05**: System enforces per-domain politeness delay (minimum 2s between requests to same domain)
- [ ] **CRAWL-06**: System deduplicates URLs via Bloom Filter (100k capacity, 0.1% false positive)
- [ ] **CRAWL-07**: System deduplicates content via MD5 hash — unchanged content skips storage and notification
- [ ] **CRAWL-08**: Failed crawl jobs retry automatically (max 3 attempts, exponential backoff starting at 5s)
- [ ] **CRAWL-09**: Jobs exhausting retries go to dead-letter state (`status='failed'`) for manual retry

### Data Sources (Phase 1-2 scope)

- [ ] **SRC-01**: Football source via football-data.org API (EPL standings + fixtures)
- [ ] **SRC-02**: Genshin Impact events via HoYoWiki API + event page scraping
- [ ] **SRC-03**: LoL tier list via Riot API + u.gg script-tag JSON extraction (Cheerio)
- [ ] **SRC-04**: Anime airing schedule via AniList GraphQL API (no auth required)
- [ ] **SRC-05**: Manga new chapters via MangaDex API

### Storage

- [ ] **STORE-01**: Raw crawl metadata (URL, status, content hash, timestamps) stored in `crawl_jobs` table
- [ ] **STORE-02**: Parsed domain data stored in `data_entries` with JSONB payload, GIN-indexed
- [ ] **STORE-03**: Each entry has a stable `entry_key` for diff comparison (e.g., `match_id`, `event_id`)
- [ ] **STORE-04**: PostgreSQL schema managed via Entity Framework Core Migrations

### Parsing

- [ ] **PARSE-01**: Each domain has a dedicated parser class implementing `IContentParser` interface (.NET)
- [ ] **PARSE-02**: Parser selection is config-driven via .NET 8 keyed services (no hardcoded switch)
- [ ] **PARSE-03**: Parsers are triggered via PostgreSQL LISTEN/NOTIFY from Node.js crawler to .NET API

### Notifications

- [x] **NOTIF-01**: System evaluates alert rules against new/changed entries after each parse
- [ ] **NOTIF-02**: Supports `new_item` condition (entry_key not previously seen)
- [ ] **NOTIF-03**: Supports `field_changed` condition (specific JSONB field differs from last snapshot)
- [ ] **NOTIF-04**: Supports `threshold` condition (numeric JSONB field crosses configured value)
- [ ] **NOTIF-05**: Delivers notifications via Telegram Bot API
- [x] **NOTIF-06**: Delivers notifications via Discord Webhook
- [ ] **NOTIF-07**: Notification history stored in `notification_logs` table

### API

- [ ] **API-01**: `GET /api/entries` — query parsed data with filters (category, source, date range, cursor pagination)
- [ ] **API-02**: `GET /api/sources` — list all configured sources
- [ ] **API-03**: `POST /api/sources` — add new crawl source
- [ ] **API-04**: `PUT /api/sources/{id}` — update source (interval, priority, enable/disable)
- [ ] **API-05**: `DELETE /api/sources/{id}` — remove source
- [ ] **API-06**: `GET /api/jobs` — list crawl jobs with status filter
- [ ] **API-07**: `POST /api/jobs/{id}/retry` — manually retry failed job
- [ ] **API-08**: `GET /api/alert-rules` — list alert rules
- [ ] **API-09**: `POST /api/alert-rules` — create alert rule
- [ ] **API-10**: SignalR hub `/hubs/dashboard` — real-time push on new entry
- [ ] **API-11**: `GET /health` — health check endpoint

### Dashboard

- [ ] **DASH-01**: Data table showing entries with filter by category, source, date range
- [ ] **DASH-02**: Charts showing entry volume over time and per-source trends
- [ ] **DASH-03**: Source management page (add/edit/delete/enable/disable)
- [ ] **DASH-04**: Job status page (view pending/running/done/failed jobs, retry failed)
- [ ] **DASH-05**: Alert rule management page (CRUD)
- [ ] **DASH-06**: Notification history page
- [ ] **DASH-07**: Real-time data updates via SignalR (new entries appear without page refresh)

### Infrastructure

- [ ] **INFRA-01**: Docker Compose for local dev (PostgreSQL, Redis, crawler, API, dashboard)
- [ ] **INFRA-02**: All Docker images have ARM64 builds (Oracle Cloud Ampere A1 compatibility)
- [x] **INFRA-03**: Monorepo structure: `apps/crawler`, `apps/api`, `apps/dashboard`, `packages/shared-types`
- [x] **INFRA-04**: Turborepo + pnpm workspaces for monorepo orchestration
- [x] **INFRA-05**: Structured logging: `winston` (Node.js), `Serilog` (.NET)
- [ ] **INFRA-06**: BullMQ graceful shutdown on `SIGTERM` (finish current job before exit)

### Deployment (Phase 4)

- [ ] **DEPLOY-01**: Production Docker Compose for Oracle Cloud (`docker-compose.prod.yml`)
- [ ] **DEPLOY-02**: Nginx/Caddy reverse proxy with HTTPS via Let's Encrypt
- [ ] **DEPLOY-03**: Dashboard deployed to Vercel free tier
- [ ] **DEPLOY-04**: Redis persistence enabled (`appendonly yes`)
- [ ] **DEPLOY-05**: Bloom Filter state persisted to Redis on shutdown, reloaded on startup

---

## v2 Requirements

### Scale (Phase 5)

- **SCALE-01**: Horizontal crawl worker scaling (multiple Node.js processes)
- **SCALE-02**: Distributed URL Frontier with Redis Cluster + consistent hashing
- **SCALE-03**: Object storage for raw HTML snapshots (Cloudflare R2 free 10GB)
- **SCALE-04**: Full-text search with Meilisearch or Typesense
- **SCALE-05**: Metrics dashboard (Grafana + Prometheus or Plausible)
- **SCALE-06**: PostgreSQL read replica for dashboard queries

### Additional Sources

- **SRC-10**: ZingMP3 music charts (requires anti-bot strategy)
- **SRC-11**: Wuthering Waves events
- **SRC-12**: Spotify Charts trending
- **SRC-13**: Transfer news (football)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| User authentication | Personal project — single user, no auth needed |
| Multi-user / team features | Personal side project only |
| Storing manga images / lyrics | Copyright compliance — metadata only |
| Crawling behind authentication | Public pages only |
| Mobile app | Web dashboard sufficient |
| Real-time chat / collaboration | Not a use case |
| ZingMP3 scraping (v1) | High anti-bot risk, defer to v2 |
| Sofascore scraping | High anti-bot risk, use football-data.org instead |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |
| INFRA-05 | Phase 1 | Complete |
| INFRA-06 | Phase 1 | Pending |
| CRAWL-01 | Phase 1 | Pending |
| CRAWL-02 | Phase 1 | Pending |
| CRAWL-03 | Phase 1 | Pending |
| SRC-01 | Phase 1 | Pending |
| CRAWL-04 | Phase 2 | Pending |
| CRAWL-05 | Phase 2 | Pending |
| CRAWL-06 | Phase 2 | Pending |
| CRAWL-07 | Phase 2 | Pending |
| CRAWL-08 | Phase 2 | Pending |
| CRAWL-09 | Phase 2 | Pending |
| SRC-02 | Phase 2 | Pending |
| SRC-03 | Phase 2 | Pending |
| SRC-04 | Phase 2 | Pending |
| SRC-05 | Phase 2 | Pending |
| STORE-01 | Phase 3 | Pending |
| STORE-02 | Phase 3 | Pending |
| STORE-03 | Phase 3 | Pending |
| STORE-04 | Phase 3 | Pending |
| PARSE-01 | Phase 3 | Pending |
| PARSE-02 | Phase 3 | Pending |
| PARSE-03 | Phase 3 | Pending |
| NOTIF-01 | Phase 4 | Complete |
| NOTIF-02 | Phase 4 | Pending |
| NOTIF-03 | Phase 4 | Pending |
| NOTIF-04 | Phase 4 | Pending |
| NOTIF-05 | Phase 4 | Pending |
| NOTIF-06 | Phase 4 | Complete |
| NOTIF-07 | Phase 4 | Pending |
| API-01 | Phase 5 | Pending |
| API-02 | Phase 5 | Pending |
| API-03 | Phase 5 | Pending |
| API-04 | Phase 5 | Pending |
| API-05 | Phase 5 | Pending |
| API-06 | Phase 5 | Pending |
| API-07 | Phase 5 | Pending |
| API-08 | Phase 5 | Pending |
| API-09 | Phase 5 | Pending |
| API-11 | Phase 5 | Pending |
| API-10 | Phase 6 | Pending |
| DASH-01 | Phase 7 | Pending |
| DASH-03 | Phase 7 | Pending |
| DASH-04 | Phase 7 | Pending |
| DASH-02 | Phase 8 | Pending |
| DASH-05 | Phase 8 | Pending |
| DASH-06 | Phase 8 | Pending |
| DASH-07 | Phase 9 | Pending |
| DEPLOY-01 | Phase 10 | Pending |
| DEPLOY-02 | Phase 10 | Pending |
| DEPLOY-03 | Phase 10 | Pending |
| DEPLOY-04 | Phase 10 | Pending |
| DEPLOY-05 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-06 — phase mappings refined after ROADMAP.md creation*
