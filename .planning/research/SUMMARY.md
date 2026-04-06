# Research Summary
_Synthesized: 2026-04-07_

## Key Findings

### Stack Decisions Confirmed
- **BullMQ**: Use one named queue per domain (`crawl:{domain}`) with `concurrency: 1` + `limiter: { max: 1, duration: 2000 }`. Set `jobId: url_hash` for deduplication.
- **Playwright**: Use a browser pool (max 2-3 instances). Requires `--disable-dev-shm-usage` + `--no-sandbox` in Docker. Use official `mcr.microsoft.com/playwright` base image for ARM.
- **Bloom Filter**: Persist to Redis as serialized JSON on graceful shutdown. Use 0.1% false positive rate (negligible size difference).
- **.NET integration**: Use PostgreSQL `LISTEN/NOTIFY` outbox pattern, not shared BullMQ queues.

### Architecture Decisions Confirmed
- **Monorepo**: Turborepo + pnpm workspaces. .NET project gets a thin `package.json` wrapper.
- **Docker Compose**: `condition: service_healthy` on all `depends_on`. Separate `NEXT_PUBLIC_API_URL` vs `API_URL` for browser vs SSR.
- **Strategy Pattern**: .NET 8 keyed services (`AddKeyedScoped<IContentParser, XParser>("source_name")`).

### Data Source Strategy
- **Football**: football-data.org free API (stable, JSON, no scraping)
- **Genshin**: HoYoWiki API + event page scraping (Cheerio)
- **LoL**: Riot Games API (free key) + u.gg scraping (script tag JSON, no Playwright)
- **Anime/Manga**: AniList GraphQL (free, no auth) + Jikan API (MAL wrapper)
- **Music**: Spotify Charts CSV (no auth) — defer ZingMP3 (anti-bot risk)
- **Gift codes**: Scrape community sites (static pages, Cheerio)

### Critical Risks to Address Early
1. **Playwright on ARM** — Test container in Phase 1 before building crawl logic around it
2. **Oracle Cloud firewall** — Document VCN + OS-level `iptables` rules before Phase 4 deploy
3. **BullMQ graceful shutdown** — Implement `SIGTERM` handler in Phase 1 to prevent job loss

### Surprises / Non-Obvious Findings
- u.gg (LoL tier lists) embeds full data in `<script id="__NEXT_DATA__">` — Cheerio can parse it, no Playwright needed
- AniList GraphQL requires no API key — simpler than expected for anime data
- PostgreSQL `LISTEN/NOTIFY` is the cleanest Node.js → .NET handoff mechanism; no shared queue client needed
- Bloom Filter Redis serialization is straightforward with `bloom-filters` npm package's built-in `saveAsJSON()`/`fromJSON()`

## Impact on Roadmap

| Phase | Finding | Impact |
|-------|---------|--------|
| Phase 1 | Test Playwright ARM container early | Add Docker ARM validation to Phase 1 |
| Phase 1 | football-data.org API eliminates scraping complexity | Phase 1 source should be football-data.org |
| Phase 2 | LISTEN/NOTIFY pattern for Node→.NET | Replace BullMQ consumer in .NET with Npgsql listener |
| Phase 3 | json-diff for alert conditions | Use `microdiff` npm package (lighter than json-diff) |
| Phase 4 | Oracle firewall is #1 deploy risk | Document firewall steps explicitly in Phase 4 plan |
