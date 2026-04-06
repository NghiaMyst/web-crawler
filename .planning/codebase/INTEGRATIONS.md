# External Integrations
_Last updated: 2026-04-06_

> **Note:** This project has no source code yet. All integration decisions are documented in `ARCHITECTURE.md`, `ROADMAP.md`, and `REQUIREMENTS.md`. This document reflects the intended/designed integrations.

---

## Message Queue

**BullMQ / Redis:**
- Provider: Self-hosted Redis (local Docker, then Oracle Cloud VPS)
- Purpose: Decouples crawler layer from storage and notification layers
- Named queues:
  - `crawl:{domain}` — Per-domain crawl jobs with politeness limiter (min 2s delay)
  - `queue:parsed-data` — Parsed data waiting to be written to PostgreSQL
  - `queue:notifications` — Events that trigger alert delivery
  - `queue:new-urls` — Newly discovered URLs fed back into the URL Frontier
- Features used: `limiter` per queue name (politeness), `attempts: 3`, exponential backoff (`delay: 5000`), dead-letter queue for jobs exhausting retries

---

## Data Storage

**PostgreSQL:**
- Provider: Self-hosted (local Docker for dev; Oracle Cloud Always Free or Railway free tier for prod)
- Purpose: Primary data store for all crawled and parsed data
- Key tables: `sources`, `crawl_jobs`, `data_entries`, `alert_rules`, `notification_logs`
- JSONB used for `data_entries.payload` and `alert_rules.condition` — flexible per-domain schema with GIN indexing
- ORM: Entity Framework Core (code-first migrations)
- Connection: Via EF Core connection string (env var, not yet defined)

**Redis:**
- Provider: Self-hosted on same VPS as other services
- Purpose: BullMQ backing store; DNS resolution cache (TTL 10 min); URL Frontier distributed sorted set (Phase 5)
- Connection: Standard Redis URL (env var, not yet defined)

**Object Storage (Phase 5 — Planned):**
- Provider: Cloudflare R2
- Purpose: Raw HTML archival storage
- Free tier: 10 GB included

---

## Notification Channels

**Telegram Bot API:**
- Purpose: Push alerts when triggers fire (new game events, chapter releases, match results, gift codes)
- Implementation: .NET `NotificationWorker` (`IHostedService` / `BackgroundService`) consumes `queue:notifications` and calls Telegram Bot API
- Auth: Bot token (env var, not yet defined)
- Example message: `"🎮 Genshin event mới: {event_name}"`

**Discord Webhook:**
- Purpose: Alternative notification channel to Telegram; configurable per alert rule
- Implementation: Same `NotificationWorker`; dispatches to Discord webhook URL based on `alert_rules.channel` field
- Auth: Webhook URL (env var, not yet defined)
- Example message: `"⚔️ LoL patch mới: {patch_version}"`

---

## Real-Time Communication

**SignalR:**
- Provider: ASP.NET Core built-in
- Purpose: Push real-time updates to the Next.js dashboard when new data arrives
- Hub endpoint: `/hubs/dashboard`
- Triggered by: .NET API after new `data_entries` are written
- Client: Next.js dashboard (SignalR JS client)

---

## Data Sources (Crawl Targets)

The crawler fetches from public web pages and APIs. No authentication is used (public data only).

**Football:**
- football-data.org — Free tier JSON API (requires API key); Premier League, Champions League results and standings
- Sofascore — Undocumented internal API endpoints (discovered via network inspection); match results
- General football sites — HTML scraping for standings, transfer news

**Games:**
- Genshin Impact wiki — Static HTML; Cheerio sufficient; events, banner info
- League of Legends — Meta/tier list sites (e.g., u.gg, op.gg style); patch-based champion data
- Wuthering Waves — Events and banner info (sites TBD)
- Pricon — Gift codes and patch notes (sites TBD)

**Anime / Manga:**
- MyAnimeList (MAL) — Ratings, rankings, airing schedule
- AniList — Ratings, rankings, season schedule
- Manga tracking sites — New chapter detection for followed series

**Music:**
- Spotify Charts — Public chart pages
- ZingMP3 — Vietnamese music charts

**robots.txt:**
- Fetched once per domain, cached in memory
- Every URL checked against parsed rules before crawling
- User-Agent declared as `PersonalCrawlerBot/1.0`

---

## Hosting & Deployment

**Production VPS:**
- Provider: Oracle Cloud Always Free
- Spec: 4x Ampere A1 CPU (ARM architecture), 24 GB RAM, 200 GB block storage
- Hosts: PostgreSQL, Redis, .NET API, Node.js crawler
- TLS: Let's Encrypt via Nginx or Caddy reverse proxy

**Frontend Hosting:**
- Provider: Vercel free tier
- Hosts: Next.js dashboard only

---

## Observability (Planned Phase 4+)

**Logging:**
- Serilog — Structured logging in .NET API and notification service
- winston — Structured logging in Node.js crawler
- No centralized log aggregation defined yet

**Metrics (Phase 5 — Planned):**
- Prometheus + Grafana — Metrics collection and dashboards
- Alternative: Plausible (simpler)

**Health Checks (Phase 4 — Planned):**
- `GET /health` endpoint on .NET API

---

## Secrets & Environment Configuration

No `.env.example` file exists yet. Expected environment variables (inferred from architecture):

| Variable | Used By | Purpose |
|---|---|---|
| `DATABASE_URL` or connection string | .NET API / EF Core | PostgreSQL connection |
| `REDIS_URL` | Node.js crawler / .NET API | BullMQ and cache |
| `TELEGRAM_BOT_TOKEN` | .NET notification worker | Telegram Bot API auth |
| `DISCORD_WEBHOOK_URL` | .NET notification worker | Discord webhook delivery |
| `FOOTBALL_DATA_API_KEY` | Node.js crawler | football-data.org free tier key |
