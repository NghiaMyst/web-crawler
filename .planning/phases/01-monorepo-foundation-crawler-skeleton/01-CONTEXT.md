# Phase 1: Monorepo Foundation & Crawler Skeleton - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up the monorepo skeleton (Turborepo + pnpm workspaces), wire all services into Docker Compose, validate Playwright on ARM64, bootstrap BullMQ queue infrastructure, and run the first live crawl against football-data.org. This phase delivers working infrastructure — not crawl logic.

New capabilities (URL dedup, politeness, parsers, storage) belong in later phases.

</domain>

<decisions>
## Implementation Decisions

### Directory Layout
- **D-01:** Use `apps/` prefix convention — `apps/crawler`, `apps/api`, `apps/dashboard`, `packages/shared-types`. Standard Turborepo layout. STRUCTURE.md and CONVENTIONS.md must be updated to reflect this (they currently show flat root layout).

### Playwright Docker Strategy
- **D-02:** Use the official Playwright image `mcr.microsoft.com/playwright:v1.x-noble` as the base for the crawler Dockerfile. Pre-installed Chromium, ARM64 supported — simplest path to validating ARM compatibility in Phase 1.

### Dashboard Scaffold Depth
- **D-03:** Phase 1 delivers a real Next.js App Router scaffold — not a stub. Include proper `app/` directory structure with at least a root layout and a landing page. No feature content needed yet, but the scaffold must be production-shaped so later dashboard phases build on a real foundation.

### Env Var Management
- **D-04:** Per-service `.env` files: `apps/crawler/.env`, `apps/api/.env`, `apps/dashboard/.env`. Each service owns its secrets. Docker Compose references these via `env_file:` directives. A root `.env.example` documents required variables per service for onboarding.

### Claude's Discretion
- Playwright smoke test target page — any stable public page (e.g., `example.com`) that exercises JS rendering. Claude picks.
- Node.js version — pin to LTS (Node 20) via `.nvmrc` and Docker base image.
- TypeScript strictness — `"strict": true` per CONVENTIONS.md; each app has its own `tsconfig.json` extending a root `tsconfig.base.json`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Architecture
- `.planning/codebase/ARCHITECTURE.md` — Full system design, component layout, data flow
- `.planning/codebase/STACK.md` — Technology choices with rationale (BullMQ, Playwright, Cheerio, etc.)
- `.planning/codebase/STRUCTURE.md` — Planned directory layout (NOTE: flat layout here is WRONG — D-01 overrides it to `apps/` prefix)
- `.planning/codebase/CONVENTIONS.md` — Coding conventions for TypeScript and C# (NOTE: structure section shows flat layout — D-01 overrides)

### Requirements & Schema
- `.planning/REQUIREMENTS.md` — Phase 1 requirements: INFRA-01 through INFRA-06, CRAWL-01, CRAWL-02, CRAWL-03, SRC-01
- `SCHEMA.md` — PostgreSQL schema (not needed for Phase 1 but referenced for shared-types design)

### Roadmap
- `.planning/ROADMAP.md` — Phase 1 plans (01-01 through 01-07), success criteria, and dependencies

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — project is greenfield. No source code exists yet.

### Established Patterns
- Queue naming: `crawl:{domain}` for per-domain queues, `queue:parsed-data` for shared queues (from CONVENTIONS.md)
- DB field names: `snake_case` (PostgreSQL convention)
- TypeScript: strict mode, `async/await`, no `.then()` chains

### Integration Points
- Docker Compose will be the integration point for all services in Phase 1
- `packages/shared-types` is the shared boundary for TypeScript types used across crawler and dashboard

</code_context>

<specifics>
## Specific Ideas

- Real Next.js App Router scaffold (not a stub) — user explicitly wants the dashboard shaped correctly from Phase 1 so later phases don't need to restructure
- Per-service `.env` files referenced via Docker Compose `env_file:` — each service is self-contained with its secrets

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-monorepo-foundation-crawler-skeleton*
*Context gathered: 2026-04-07*
