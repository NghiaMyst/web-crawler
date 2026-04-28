# Web Crawler & Data Aggregator

## What This Is

A personal web crawler and data aggregation system that monitors sources across football (EPL, Champions League), games (LoL, Genshin Impact, Wuthering Waves), anime/manga, and music — then delivers alerts via Telegram/Discord and displays data on a Next.js dashboard. Built as a side project with dual goals: working software and learning distributed systems design concepts through hands-on implementation.

## Core Value

Automated monitoring delivers timely alerts for events you care about (new Genshin banners, chapter releases, match results, gift codes) without manual checking.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Crawl HTML and JS-rendered pages from configured sources on a schedule
- [ ] URL deduplication (Bloom Filter) and content deduplication (MD5 hash)
- [ ] Per-domain politeness queue (2s delay, robots.txt compliance)
- [ ] Domain-specific parsers using Strategy Pattern (.NET)
- [ ] PostgreSQL storage with JSONB payload for flexible per-domain schema
- [ ] .NET REST API with CRUD for sources, job status, and entries
- [ ] Telegram Bot and Discord Webhook notification delivery
- [ ] Config-driven alert rule engine (new_item, field_changed, threshold conditions)
- [ ] Next.js dashboard with data tables, charts, and filter by category/source
- [ ] Source management UI (add/edit/delete/enable/disable crawl sources)
- [ ] Job management UI (view status, re-trigger failed jobs, view logs)
- [ ] Deploy to Oracle Cloud Free Tier, running 24/7 with Docker Compose

### Out of Scope

- Commercial use or multi-user accounts — personal side project only
- Crawling behind authentication — public pages only
- Storing copyrighted content (lyrics, manga images) — metadata/structured data only
- Mobile app — web dashboard only
- Real-time collaborative features — single-user

## Context

- Architecture follows ByteByteGo "Design a Web Crawler" pattern (Alex Xu, System Design Interview Vol.1), adapted for Node.js + .NET hybrid stack
- Deliberately uses "overkill" patterns (Bloom Filter, consistent hashing in Phase 5) for learning value — this is intentional, not accidental complexity
- Cost constraint: $0/month target. Oracle Cloud Always Free (4 ARM CPU, 24GB RAM), Vercel free tier for dashboard
- All planning docs written in Vietnamese; implementation language is English
- Database schema fully designed in SCHEMA.md with 5 tables: sources, crawl_jobs, data_entries, alert_rules, notification_logs
- Entity Framework Core Migrations for schema management (YYYYMMDD_description naming)

## Constraints

- **Cost**: $0/month target — Oracle Cloud Always Free, Vercel, Redis on same VPS, no paid services
- **Stack**: Node.js/TypeScript (crawler), .NET ASP.NET Core (API + parser), Next.js (dashboard), PostgreSQL + Redis
- **Deployment**: ARM architecture (Ampere A1) — Docker images must be ARM-compatible
- **Ethics**: Must respect robots.txt, 2s crawl delay per domain, clear User-Agent identification
- **Scope**: Personal project — no auth layer needed for v1 local development

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| BullMQ over Hangfire | Node.js native queue, Redis-backed, distributed-safe; Hangfire is .NET-only | — Pending |
| Bloom Filter for URL dedup | O(1) lookup, ~120KB for 100k URLs vs larger Redis Set | — Pending |
| JSONB for parsed data | Flexible schema per domain with GIN indexing; avoids rigid per-domain tables | — Pending |
| Playwright only when needed | Heavy (Chrome process, ~150-300MB RAM); Cheerio sufficient for static pages | — Pending |
| SignalR for real-time | Native .NET WebSocket abstraction; avoids polling complexity | Validated in Phase 06: hub live, broadcast working, hub_connections on /health |
| Hybrid Node.js + .NET | Crawler in Node.js (JS ecosystem, BullMQ native), API/parsers in .NET (C# strategy pattern, Serilog) | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-28 — Phase 06 complete (signalr-real-time-layer: DashboardHub, HubConnectionTracker, NewEntry broadcast, hub_connections on /health, 88 tests passing)*
