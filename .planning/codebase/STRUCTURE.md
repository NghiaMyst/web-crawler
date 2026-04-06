# STRUCTURE
_Last updated: 2026-04-06_

## Directory Layout

The project is a planned monorepo. Source code does not yet exist — the structure below
reflects the intended layout as specified in `ROADMAP.md` and `ARCHITECTURE.md`.

```
web-crawler/                        # Monorepo root
├── crawler/                        # Node.js crawler service
│   ├── src/
│   │   ├── frontier/               # URL Frontier: priority queue + politeness queue
│   │   ├── workers/                # Crawl workers (Cheerio and Playwright variants)
│   │   ├── parsers/                # Per-domain content parsers (Strategy Pattern)
│   │   ├── dedup/                  # URL dedup (Bloom Filter) + content dedup (MD5 hash)
│   │   ├── dns/                    # DNS resolver cache layer
│   │   ├── robots/                 # robots.txt fetch + cache
│   │   ├── queues/                 # BullMQ queue definitions and producers
│   │   └── index.ts                # Crawler entry point
│   ├── package.json
│   └── tsconfig.json
│
├── api/                            # .NET ASP.NET Core Web API + background services
│   ├── Controllers/                # REST endpoint controllers
│   ├── Hubs/                       # SignalR hubs (real-time dashboard push)
│   ├── Parsers/                    # IContentParser implementations per domain
│   ├── Workers/                    # IHostedService background workers
│   │   └── NotificationWorker.cs   # Consumes notification queue, sends Telegram/Discord
│   ├── Models/                     # EF Core entity models (Source, CrawlJob, DataEntry, etc.)
│   ├── Migrations/                 # EF Core migration files (naming: YYYYMMDD_description)
│   ├── Services/                   # Business logic services
│   └── Program.cs                  # ASP.NET Core entry point
│
├── dashboard/                      # Next.js frontend dashboard
│   ├── app/                        # Next.js App Router pages
│   ├── components/                 # Reusable UI components
│   ├── lib/                        # API client, utilities
│   └── package.json
│
├── docker-compose.yml              # Local dev: PostgreSQL + Redis + all services
├── docker-compose.prod.yml         # Production: Oracle Cloud deployment config
├── ARCHITECTURE.md                 # System design and component documentation
├── REQUIREMENTS.md                 # Functional and non-functional requirements
├── ROADMAP.md                      # Phased delivery plan (Phase 1–5)
└── SCHEMA.md                       # PostgreSQL schema with SQL DDL and examples
```

## Key File Locations

**Planning and Design Documents (all at repo root):**
- `ARCHITECTURE.md` — Full system design, component details, data flow diagrams
- `REQUIREMENTS.md` — Functional requirements by domain (football, games, anime, music)
- `ROADMAP.md` — Phase-by-phase delivery plan with deliverables per phase
- `SCHEMA.md` — PostgreSQL schema DDL, ERD overview, JSONB payload examples per domain

**Crawler Service (Node.js + TypeScript):**
- `crawler/src/frontier/` — URL Frontier: priority queue + per-domain politeness delay (2s minimum via BullMQ limiter)
- `crawler/src/workers/` — Two worker types: Cheerio (static HTML) and Playwright (JS-rendered SPA)
- `crawler/src/dedup/` — Bloom Filter for URL dedup (`bloom-filters` npm), MD5 hash for content dedup
- `crawler/src/robots/` — robots.txt fetch-and-cache per domain, checked before every crawl
- `crawler/src/dns/` — DNS resolution cache (TTL 10 min) to avoid repeated lookups
- `crawler/src/queues/` — BullMQ queue definitions: `queue:parsed-data`, `queue:notifications`, `queue:new-urls`

**API Service (.NET):**
- `api/Controllers/` — REST endpoints: `/api/entries`, `/api/sources`, `/api/jobs`
- `api/Hubs/` — SignalR hub at `/hubs/dashboard` for real-time data push
- `api/Parsers/` — Per-domain parser classes implementing `IContentParser` (GenshinEventParser, FootballResultParser, AnimeScheduleParser, etc.)
- `api/Workers/NotificationWorker.cs` — Background service consuming `queue:notifications`, dispatching to Telegram Bot API and Discord Webhook
- `api/Models/` — EF Core models corresponding to DB tables: `Source`, `CrawlJob`, `DataEntry`, `AlertRule`, `NotificationLog`
- `api/Migrations/` — EF Core migrations, named `YYYYMMDD_description` (e.g., `20250406_InitialSchema`)

**Dashboard (Next.js):**
- `dashboard/app/` — App Router pages (data table, charts, alert rule CRUD, job status)
- `dashboard/components/` — Shared UI components
- `dashboard/lib/` — API client for `.NET API` and SignalR connection setup

**Infrastructure:**
- `docker-compose.yml` — Local dev stack: PostgreSQL, Redis, crawler, api, dashboard
- `docker-compose.prod.yml` — Production config for Oracle Cloud Always Free (ARM, 4 CPU, 24 GB RAM)

## Organization Conventions

**Monorepo layout:**
Each service (`crawler/`, `api/`, `dashboard/`) is a self-contained package with its own
`package.json` / `.csproj`. Services communicate only via BullMQ queues (async) or HTTP/SignalR
(synchronous dashboard queries). No direct cross-service imports.

**Parser placement:**
Each domain (Genshin, football, anime, etc.) gets its own parser class:
- Node.js parsing utilities live in `crawler/src/parsers/`
- Structured-data parsers implementing `IContentParser` live in `api/Parsers/`

Adding a new domain requires: one new parser class in `api/Parsers/`, one new crawl worker
config in `crawler/src/workers/`, and a new row in the `sources` database table.

**Database migrations:**
All schema changes go through EF Core Migrations in `api/Migrations/`. Naming follows
`YYYYMMDD_description` (e.g., `20250406_AddAlertRules`). Run via:
```bash
dotnet ef migrations add YYYYMMDD_Description  # from api/ directory
dotnet ef database update
```

**Queue naming:**
BullMQ queues use the prefix `queue:` for shared queues and `crawl:{domain}` for per-domain
politeness queues. E.g., `crawl:genshin.gg`, `crawl:sofascore.com`.

**Configuration is data-driven:**
Crawl sources, intervals, priorities, and alert rules are stored in PostgreSQL (`sources` and
`alert_rules` tables) — not hardcoded. Adding a new source does not require a code deploy.

**File naming (planned):**
- TypeScript files: `camelCase.ts` for modules, `PascalCase.ts` for classes
- .NET files: `PascalCase.cs` matching class name (standard C# convention)
- Next.js pages: `kebab-case` directories inside `app/` following App Router convention

**Where to add new code:**

| Task | Location |
|---|---|
| New crawl source (static HTML) | `crawler/src/workers/`, new `sources` DB row |
| New crawl source (JS-rendered) | `crawler/src/workers/` with Playwright, new `sources` DB row |
| New domain parser | `api/Parsers/NewDomainParser.cs` implementing `IContentParser` |
| New REST endpoint | `api/Controllers/` |
| New alert channel | `api/Workers/NotificationWorker.cs` |
| New dashboard page | `dashboard/app/new-page/page.tsx` |
| Schema change | EF Core migration in `api/Migrations/` |
| New BullMQ queue | `crawler/src/queues/` + corresponding consumer in `api/Workers/` |

**Environment secrets:**
`.env` files at each service root (`crawler/.env`, `api/.env` or `appsettings.json`).
Not committed to source control. Required variables documented in `INTEGRATIONS.md`.
