# Phase 1: Monorepo Foundation & Crawler Skeleton - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 01-monorepo-foundation-crawler-skeleton
**Areas discussed:** Directory Layout, Playwright Docker Strategy, Dashboard Scaffold Depth, Env Var Management

---

## Directory Layout

| Option | Description | Selected |
|--------|-------------|----------|
| `apps/` prefix | apps/crawler, apps/api, apps/dashboard — standard Turborepo convention | |
| Flat root | crawler/, api/, dashboard/ at repo root — as currently in STRUCTURE.md | |
| Claude's discretion | Claude picks the best layout and updates docs | ✓ |

**User's choice:** Claude's discretion — pick the best and update docs.
**Notes:** Claude selected `apps/` prefix as the standard Turborepo convention. STRUCTURE.md and CONVENTIONS.md contain the old flat layout and must be updated.

---

## Playwright Docker Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Official Playwright image | mcr.microsoft.com/playwright:v1.x-noble — pre-installed Chromium, ARM64 supported, ~1.5GB | ✓ |
| Node Alpine + install | node:20-alpine base, install playwright at build time — lighter but ARM support unproven | |
| Claude's discretion | Claude decides based on ARM64 + $0/month constraint | |

**User's choice:** Official Playwright image.
**Notes:** Simplest path to validating ARM compatibility. Accepted the image size trade-off.

---

## Dashboard Scaffold Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Real App Router scaffold | Full Next.js App Router structure with app/ directory, layout, pages | ✓ |
| Minimal stub | Single page, no structure — just enough for docker compose up | |

**User's choice:** Real App Router scaffold.
**Notes:** User explicitly wants the dashboard shaped correctly from Phase 1 so later dashboard phases (7, 8, 9) build on a real foundation without restructuring.

---

## Env Var Management

| Option | Description | Selected |
|--------|-------------|----------|
| Per-service .env files | apps/crawler/.env, apps/api/.env, apps/dashboard/.env | ✓ |
| Root-level .env | Single .env shared across all services | |

**User's choice:** Per-service .env files.
**Notes:** Each service owns its secrets. Docker Compose uses `env_file:` per service.

---

## Claude's Discretion

- Playwright smoke test target page — Claude picks any stable public page
- Node.js version — pinned to LTS (Node 20)
- TypeScript strictness — strict mode, root tsconfig.base.json extended per app

## Deferred Ideas

None.
