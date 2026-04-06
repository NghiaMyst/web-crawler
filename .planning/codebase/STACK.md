# Technology Stack
_Last updated: 2026-04-06_

> **Note:** This project has no source code yet. All stack decisions are documented in `ARCHITECTURE.md`, `ROADMAP.md`, and `REQUIREMENTS.md`. This document reflects the intended/designed stack.

---

## Languages

**Primary:**
- TypeScript — Crawler layer (`/crawler` service, Node.js)
- C# — API backend and notification service (`/api` service, ASP.NET Core)
- TypeScript/TSX — Frontend dashboard (`/dashboard` service, Next.js)

**Secondary:**
- SQL — PostgreSQL schema and migrations (managed via Entity Framework Core)

---

## Runtime

**Node.js:**
- Version: Not pinned yet (no `.nvmrc` present)
- Used for: Crawler layer, BullMQ workers, Cheerio/Playwright HTML fetching

**.NET:**
- Version: Not pinned yet (no `global.json` present)
- Used for: REST API, SignalR hub, notification background service

---

## Package Manager

- **Node.js side:** Not yet determined (no `package.json` or lockfile present)
- **NuGet:** Expected for .NET dependencies (standard for ASP.NET Core)

---

## Project Structure (Planned)

Monorepo layout defined in ROADMAP.md Phase 1:

```
/
├── crawler/      # Node.js — crawl workers, URL frontier, BullMQ jobs
├── api/          # .NET ASP.NET Core — REST API, SignalR, notification worker
└── dashboard/    # Next.js — frontend UI, charts, filter UI
```

---

## Frameworks

**Crawler Layer (Node.js):**
- `BullMQ` — Job queue backed by Redis; handles URL frontier, politeness rate limiting, retry with exponential backoff, dead-letter queue
- `Cheerio` — Fast HTML parsing for static/server-rendered pages (jQuery-like API)
- `Playwright` (`@playwright/test` / `playwright`) — Headless Chromium for JavaScript-rendered SPAs; used only when Cheerio is insufficient
- `axios` — HTTP client for fetching page content
- `bloom-filters` (npm) — Bloom Filter for URL deduplication (100k URLs, 1% false positive rate, ~120KB memory)
- `winston` — Structured logging (mentioned for Node.js side in ROADMAP Phase 4)

**API Layer (.NET):**
- `ASP.NET Core Web API` — REST endpoints
- `SignalR` — WebSocket abstraction for real-time dashboard push
- `Entity Framework Core` — ORM + database migrations
- `Serilog` — Structured logging (mentioned in REQUIREMENTS 2.5 and ROADMAP Phase 4)

**Frontend (Next.js):**
- `Next.js` — React-based dashboard
- Charting library: Not yet specified (dashboard shows "charts, tables, filter by category and source")

---

## Key Dependencies

**Critical:**
- `BullMQ` — Central to the queue-based architecture; decouples crawler, storage, and notification layers; provides `limiter` per queue name for domain-level politeness
- `bloom-filters` — URL deduplication with O(1) lookup; configured as `BloomFilter.create(100000, 0.01)`
- `Playwright` (chromium) — Required for JavaScript-rendered sites (Genshin wiki, modern anime pages); heavy dependency (full Chrome process)
- `Entity Framework Core` — Manages PostgreSQL schema via code-first migrations with naming convention `YYYYMMDD_description`

**Infrastructure:**
- `Redis` — Backing store for BullMQ queues; also used for DNS cache and URL Frontier in Phase 5 (Redis Sorted Set)
- `PostgreSQL` — Primary data store; JSONB columns (`payload`) for flexible per-domain structured data with GIN indexing

---

## Build / Dev Tooling

**Containerization (Planned Phase 4):**
- `Docker` + `docker-compose.yml` — Local development stack
- `docker-compose.prod.yml` — Oracle Cloud production deployment

**Reverse Proxy (Planned Phase 4):**
- `Nginx` or `Caddy` — HTTPS termination with Let's Encrypt certificates

**Search (Planned Phase 5):**
- `Meilisearch` or `Typesense` — Full-text search over crawled data entries

**Metrics (Planned Phase 5):**
- `Grafana` + `Prometheus` — Metrics dashboard (or Plausible as simpler alternative)

---

## Configuration

**Environment:**
- No `.env.example` present yet
- Expected env vars (inferred from architecture): database connection string, Redis URL, Telegram Bot token, Discord Webhook URL

**Database Migrations:**
```bash
dotnet ef migrations add YYYYMMDD_description
dotnet ef database update
```

---

## Platform Requirements

**Development:**
- Docker and Docker Compose for local PostgreSQL and Redis
- Node.js runtime for crawler
- .NET SDK for API

**Production (Planned Phase 4):**
- Oracle Cloud Always Free — 4x Ampere A1 CPU (ARM), 24 GB RAM, 200 GB block storage
- Hosts: PostgreSQL, Redis, .NET API, Node.js crawler
- Dashboard deployed separately on Vercel free tier

**Object Storage (Planned Phase 5):**
- Cloudflare R2 — Raw HTML storage (10 GB free tier)
