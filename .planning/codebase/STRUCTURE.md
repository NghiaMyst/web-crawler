# STRUCTURE
_Last updated: 2026-04-07_

## Directory Layout

The project is a planned monorepo. Source code does not yet exist — the structure below
reflects the intended layout as specified in `ROADMAP.md` and `REQUIREMENTS.md`.

**Note:** Services live under `apps/` (Turborepo convention). Confirmed in Phase 1 context (D-01).

```
web-crawler/                        # Monorepo root
├── apps/
│   ├── crawler/                    # Node.js crawler service
│   │   ├── src/
│   │   │   ├── frontier/           # URL Frontier: priority queue + politeness queue
│   │   │   ├── workers/            # Crawl workers (Cheerio and Playwright variants)
│   │   │   ├── parsers/            # Per-domain content parsers (Strategy Pattern)
│   │   │   ├── dedup/              # URL dedup (Bloom Filter) + content dedup (MD5 hash)
│   │   │   ├── dns/                # DNS resolver cache layer
│   │   │   ├── robots/             # robots.txt fetch + cache
│   │   │   ├── queues/             # BullMQ queue definitions and producers
│   │   │   └── index.ts            # Crawler entry point
│   │   ├── .env                    # Per-service secrets (not committed)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── api/                        # .NET ASP.NET Core Web API + background services
│   │   ├── Controllers/            # REST endpoint controllers
│   │   ├── Hubs/                   # SignalR hubs (real-time dashboard push)
│   │   ├── Parsers/                # IContentParser implementations per domain
│   │   ├── Workers/                # IHostedService background workers
│   │   │   └── NotificationWorker.cs
│   │   ├── Models/                 # EF Core entity models
│   │   ├── Migrations/             # EF Core migration files (YYYYMMDD_description)
│   │   ├── Services/               # Business logic services
│   │   ├── .env                    # Per-service secrets (not committed)
│   │   └── Program.cs              # ASP.NET Core entry point
│   │
│   └── dashboard/                  # Next.js frontend dashboard
│       ├── app/                    # Next.js App Router pages (real scaffold, not stub)
│       │   ├── layout.tsx          # Root layout
│       │   └── page.tsx            # Root page
│       ├── components/             # Reusable UI components
│       ├── lib/                    # API client, utilities
│       ├── .env                    # Per-service secrets (not committed)
│       └── package.json
│
├── packages/
│   └── shared-types/               # Shared TypeScript interfaces (crawler ↔ dashboard)
│       ├── src/
│       └── package.json
│
├── turbo.json                      # Turborepo pipeline config
├── pnpm-workspace.yaml             # pnpm workspace definition
├── package.json                    # Root package.json (workspace root)
├── tsconfig.base.json              # Base TypeScript config extended per app
├── .nvmrc                          # Node.js version pin (Node 20 LTS)
├── docker-compose.yml              # Local dev: PostgreSQL + Redis + all services
├── docker-compose.prod.yml         # Production: Oracle Cloud deployment config
├── ARCHITECTURE.md                 # System design and component documentation
├── REQUIREMENTS.md                 # Functional and non-functional requirements
├── ROADMAP.md                      # Phased delivery plan (Phase 1–10)
└── SCHEMA.md                       # PostgreSQL schema with SQL DDL and examples
```

## Key File Locations

**Planning and Design Documents (all at repo root):**
- `ARCHITECTURE.md` — Full system design, component details, data flow diagrams
- `REQUIREMENTS.md` — Functional requirements by domain (football, games, anime, music)
- `ROADMAP.md` — Phase-by-phase delivery plan with deliverables per phase
- `SCHEMA.md` — PostgreSQL schema DDL, ERD overview, JSONB payload examples per domain

**Crawler Service (Node.js + TypeScript):**
- `apps/crawler/src/frontier/` — URL Frontier: priority queue + per-domain politeness delay (2s via BullMQ limiter)
- `apps/crawler/src/workers/` — Two worker types: Cheerio (static HTML) and Playwright (JS-rendered SPA)
- `apps/crawler/src/dedup/` — Bloom Filter for URL dedup (`bloom-filters` npm), MD5 hash for content dedup
- `apps/crawler/src/robots/` — robots.txt fetch-and-cache per domain, checked before every crawl
- `apps/crawler/src/dns/` — DNS resolution cache (TTL 10 min) to avoid repeated lookups
- `apps/crawler/src/queues/` — BullMQ queue definitions: `queue:parsed-data`, `queue:notifications`, `queue:new-urls`

**API Service (.NET):**
- `apps/api/Controllers/` — REST endpoints: `/api/entries`, `/api/sources`, `/api/jobs`
- `apps/api/Hubs/` — SignalR hub at `/hubs/dashboard` for real-time data push
- `apps/api/Parsers/` — Per-domain parser classes implementing `IContentParser`
- `apps/api/Workers/NotificationWorker.cs` — Background service dispatching to Telegram Bot API and Discord Webhook
- `apps/api/Models/` — EF Core models: `Source`, `CrawlJob`, `DataEntry`, `AlertRule`, `NotificationLog`
- `apps/api/Migrations/` — EF Core migrations, named `YYYYMMDD_description`

**Dashboard (Next.js):**
- `apps/dashboard/app/` — App Router pages (data table, charts, alert rule CRUD, job status)
- `apps/dashboard/components/` — Shared UI components
- `apps/dashboard/lib/` — API client for .NET API and SignalR connection setup

**Shared Types:**
- `packages/shared-types/src/` — TypeScript interfaces shared between crawler and dashboard

**Infrastructure:**
- `docker-compose.yml` — Local dev stack: PostgreSQL, Redis, crawler, api, dashboard
- `docker-compose.prod.yml` — Production config for Oracle Cloud Always Free (ARM, 4 CPU, 24 GB RAM)

## Organization Conventions

**Monorepo layout:**
Each service (`apps/crawler`, `apps/api`, `apps/dashboard`) is a self-contained package with its own
`package.json` / `.csproj`. Services communicate only via BullMQ queues (async) or HTTP/SignalR
(synchronous dashboard queries). No direct cross-service imports — shared types go through `packages/shared-types`.

**Parser placement:**
Each domain (Genshin, football, anime, etc.) gets its own parser class:
- Node.js parsing utilities live in `apps/crawler/src/parsers/`
- Structured-data parsers implementing `IContentParser` live in `apps/api/Parsers/`

Adding a new domain requires: one new parser class in `apps/api/Parsers/`, one new crawl worker
config in `apps/crawler/src/workers/`, and a new row in the `sources` database table.

**Database migrations:**
All schema changes go through EF Core Migrations in `apps/api/Migrations/`. Naming follows
`YYYYMMDD_description`. Run via:
```bash
dotnet ef migrations add YYYYMMDD_Description  # from apps/api/ directory
dotnet ef database update
```

**Queue naming:**
BullMQ queues use the prefix `queue:` for shared queues and `crawl:{domain}` for per-domain
politeness queues. E.g., `crawl:genshin.gg`, `crawl:api.football-data.org`.

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
| New crawl source (static HTML) | `apps/crawler/src/workers/`, new `sources` DB row |
| New crawl source (JS-rendered) | `apps/crawler/src/workers/` with Playwright, new `sources` DB row |
| New domain parser | `apps/api/Parsers/NewDomainParser.cs` implementing `IContentParser` |
| New REST endpoint | `apps/api/Controllers/` |
| New alert channel | `apps/api/Workers/NotificationWorker.cs` |
| New dashboard page | `apps/dashboard/app/new-page/page.tsx` |
| Schema change | EF Core migration in `apps/api/Migrations/` |
| New BullMQ queue | `apps/crawler/src/queues/` + corresponding consumer in `apps/api/Workers/` |

**Environment secrets:**
Per-service `.env` files: `apps/crawler/.env`, `apps/api/.env`, `apps/dashboard/.env`.
Not committed to source control. Docker Compose references them via `env_file:` directives.
A root `.env.example` documents required variables per service for onboarding.
