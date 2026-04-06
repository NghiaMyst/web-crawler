# CONCERNS
_Last updated: 2026-04-06_

## Overview

The project is **pre-implementation** — only planning documents exist (REQUIREMENTS.md, ARCHITECTURE.md, ROADMAP.md, SCHEMA.md). Concerns below are derived from design decisions and known risks in the planned architecture, not from observed code issues.

---

## Technical Debt (Pre-Implementation Risks)

- **Bloom Filter persistence not addressed**: The architecture shows an in-memory Bloom Filter for URL dedup. If the crawler process restarts, the filter is lost → all URLs re-crawled until rebuilt. Persistence (Redis bitmap or serialized to disk) is not mentioned.
- **DNS cache is in-memory Map**: Same restart problem. No TTL eviction strategy specified beyond a 10-minute TTL — no LRU bound mentioned, unbounded growth possible.
- **robots.txt cache**: Also in-memory with no specified eviction. Long-running process could accumulate stale entries.
- **Single Bloom Filter for all domains**: No plan for when the 100k URL capacity is exceeded without a restart.
- **Cross-language queue contract**: Crawler (Node.js) writes to BullMQ queues, .NET reads them. No schema contract (Protobuf/Avro/JSON Schema) specified — silent breaking changes are a risk.

---

## Security Concerns

- **No authentication on .NET API**: The roadmap shows dashboard endpoints with full CRUD for sources and jobs. With no auth layer mentioned until at least Phase 4, the API is wide open during local dev — easy to forget before deploying.
- **User-Agent identifiability**: The architecture specifies `PersonalCrawlerBot/1.0` as the User-Agent. This is correct ethically, but means the bot is easily rate-limited or blocked by sites. No rotation or fallback strategy specified.
- **Telegram Bot token / Discord Webhook URL storage**: No secrets management strategy mentioned (env vars, Vault, etc.). Risk of accidental hardcoding in config files.
- **Raw HTML storage**: Storing raw HTML could inadvertently capture PII or session tokens if crawling pages that embed user data. Noted as low risk since only public pages are targeted, but worth auditing per source.

---

## Performance Risks

- **Playwright worker pool sizing**: No pool size or concurrency limit specified for Playwright (Chromium) instances. Each instance uses ~150–300MB RAM. On Oracle Free Tier (24GB), uncapped concurrency could exhaust memory.
- **N+1 alert rule evaluation**: For each parsed data item, the system loads alert rules and evaluates conditions. If rules are loaded per-item from DB without caching, this becomes N DB reads per crawl cycle.
- **SignalR broadcast on every data insert**: If every crawled item triggers a SignalR push to all dashboard clients, high-frequency crawling could flood clients. No debounce or batching strategy specified.
- **PostgreSQL JSONB query performance**: Querying inside JSONB without GIN indexes will be slow at scale. Schema.md should specify index strategy.

---

## Incomplete Areas

- **No source code exists yet** — entire implementation is pending.
- **No Docker Compose file** — required for Phase 1 local dev setup.
- **No monorepo tooling decision** — ROADMAP mentions `crawler/`, `api/`, `dashboard/` but no monorepo manager (Turborepo, Nx, plain npm workspaces) specified.
- **Diff engine design not detailed** — Phase 3 mentions a "diff engine" to detect changes in JSONB data, but no algorithm or library is specified.
- **Alert rule DSL not finalized** — The JSON example in ROADMAP.md is illustrative, not a formal schema. Condition types (`new_item`, `changed`, `match_finished`) are not fully enumerated.
- **Database migration strategy** — SCHEMA.md exists but no migration tool (Flyway, EF Core Migrations, Liquibase) is specified.
- **Dead-letter queue handling** — REQUIREMENTS.md mentions DLQ for failed jobs but the re-processing UI/workflow is not designed.

---

## Ethical / Compliance Concerns

- **robots.txt compliance is critical** — Project explicitly lists this as a requirement. Skipping Phase 1 shortcuts could ship a crawler that ignores robots.txt temporarily.
- **Copyright risk** — Requirements correctly note "no storing copyrighted content (lyrics, manga images)." Parser implementations must enforce this per-source — easy to accidentally store more than metadata.
- **Crawl frequency vs site size** — The politeness rules (2s delay, per-domain queue) are designed for the listed sources. Adding new sources without reviewing their terms of service could violate rules.

---

## Other Notes

- Project is intentionally a learning project ("ưu tiên học được kiến thức system design"). Some over-engineering (Bloom Filter, consistent hashing) is by design for educational value.
- Oracle Cloud Free Tier dependency is a hard constraint — architecture choices must fit within 4 ARM CPU / 24GB RAM / 200GB storage.
- All documents are in Vietnamese (requirements, architecture, roadmap). Any future contributors should be aware of this language choice.
