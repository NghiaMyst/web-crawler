---
phase: 10-production-deployment
plan: "03"
subsystem: infra
tags: [vercel, nextjs, dashboard, signalr, wss, monorepo, cors]

# Dependency graph
requires:
  - phase: 10-02
    provides: Nginx HTTPS config with WSS upgrade headers; https://<DUCKDNS_DOMAIN>/health accessible
provides:
  - apps/dashboard/vercel.json — Vercel build config with nextjs framework and monorepo-aware buildCommand
  - apps/dashboard/.env.production.example — production env var template (HTTPS placeholders)
  - docs/deployment/vercel-deploy.md — 6-step deploy runbook; produces the Vercel URL for Plan 10-05
affects:
  - 10-05 (receives Vercel production URL as CORS_ALLOWED_ORIGINS input)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vercel pnpm monorepo: buildCommand runs from root with --filter to build shared-types before dashboard"
    - "NEXT_PUBLIC_* baking: env vars set in Vercel UI before deploy; runtime changes require redeploy"
    - "CORS handoff sequencing: Vercel deploy first (produces URL), then Oracle API restart with that URL"

key-files:
  created:
    - apps/dashboard/vercel.json
    - apps/dashboard/.env.production.example
    - docs/deployment/vercel-deploy.md
  modified: []

key-decisions:
  - "vercel.json buildCommand uses cd ../.. + pnpm --filter to build shared-types before dashboard in monorepo context"
  - "regions: sin1 (Singapore) chosen as closest to Oracle Cloud APAC; operator can change for other regions"
  - "Runbook Step 4 explicitly marks pre-CORS CORS error as expected (operator must not abort deployment)"
  - "Runbook Step 5 orders CORS handoff: stable production URL only (NOT preview deploy URL) to CORS_ALLOWED_ORIGINS"

patterns-established:
  - "Pattern: Vercel monorepo deploy — Root Directory = apps/dashboard; buildCommand builds workspace dependencies first"
  - "Pattern: Deploy sequencing gate — Vercel URL must be known before Plan 10-05 sets CORS_ALLOWED_ORIGINS"

requirements-completed:
  - DEPLOY-03

# Metrics
duration: 5min
completed: "2026-05-13"
---

# Phase 10 Plan 03: Vercel Dashboard Deployment Config and Runbook Summary

**Vercel build config (vercel.json) + production env template (.env.production.example) + 6-step runbook (vercel-deploy.md) enabling zero-trial-error Vercel Hobby deploy with wss:// SignalR and explicit CORS handoff to Plan 10-05**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-13T13:46:01Z
- **Completed:** 2026-05-13T13:51:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `apps/dashboard/vercel.json` with `framework: nextjs`, monorepo-aware `buildCommand` that builds `shared-types` first, and Singapore region (`sin1`)
- Created `apps/dashboard/.env.production.example` documenting both `NEXT_PUBLIC_API_URL` and `API_URL` with `https://<DUCKDNS_DOMAIN>` placeholders (no localhost values)
- Created `docs/deployment/vercel-deploy.md` (119 lines) — 6-step runbook covering: connect repo (Root Directory critical), set env vars (baked-at-build-time warning), deploy, pre-CORS smoke test (expected failure documented), CORS handoff to Plan 10-05, and post-CORS WSS validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Author Vercel build configuration (vercel.json + env template)** - `6b4381e` (chore)
2. **Task 2: Author Vercel deployment runbook with WSS smoke test and CORS handoff** - `c812f29` (docs)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `apps/dashboard/vercel.json` — Vercel build config: `framework=nextjs`, monorepo buildCommand building shared-types first, `outputDirectory=.next`, `regions=["sin1"]`
- `apps/dashboard/.env.production.example` — Production env var template: `NEXT_PUBLIC_API_URL=https://<DUCKDNS_DOMAIN>`, `API_URL=https://<DUCKDNS_DOMAIN>`, no localhost values
- `docs/deployment/vercel-deploy.md` — 6-step deploy runbook: connect repo → set env vars → deploy → pre-CORS smoke test (expected CORS failure) → CORS handoff to Plan 10-05 → post-CORS WSS validation; plus troubleshooting table and Hobby tier limits

## Decisions Made

- `buildCommand` uses `cd ../.. && pnpm install --frozen-lockfile --filter @web-crawler/dashboard... && pnpm --filter @web-crawler/shared-types build && pnpm --filter @web-crawler/dashboard build` to solve the pnpm workspace dependency ordering problem on Vercel
- `regions: ["sin1"]` (Singapore) as default; matches Oracle Cloud APAC; documented as operator-adjustable
- Runbook explicitly calls out that pre-CORS CORS errors in Step 4 are expected — prevents operator from abandoning the deployment
- Step 5 explicitly says "stable production URL — NOT a preview deploy URL" to satisfy T-10-15 (spoofing via preview URL in CORS)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — this plan produces documentation and configuration artifacts, not UI components or data-rendering code.

## Threat Flags

No new network endpoints or auth paths introduced. All files are configuration and documentation. The threat model in the plan's frontmatter covers all relevant surfaces:
- T-10-12: CORS wildcard — mitigated by exact URL in runbook Step 5
- T-10-13: NEXT_PUBLIC_API_URL wrong URL — accepted; runbook Step 2 instructs correct https:// value
- T-10-14: Mixed content ws:// — mitigated; NEXT_PUBLIC_API_URL is HTTPS, runbook Step 6 validates wss://
- T-10-15: Preview URL in CORS — mitigated; runbook Step 3 and Step 5 both say "stable production URL"
- T-10-16: Hobby tier limits — accepted; documented in "Limits to Watch" section

## Next Phase Readiness

- Plan 10-04 (Redis AOF persistence): independent, no dependency on this plan
- Plan 10-05 (final runbook / CORS wiring): depends on this plan — needs the Vercel production URL from Step 3 to set `CORS_ALLOWED_ORIGINS` on Oracle
- The artifact chain is complete: vercel.json enables build → runbook produces URL → Plan 10-05 uses URL

## Self-Check: PASSED

- FOUND: apps/dashboard/vercel.json
- FOUND: apps/dashboard/.env.production.example
- FOUND: docs/deployment/vercel-deploy.md
- FOUND: .planning/phases/10-production-deployment/10-03-SUMMARY.md
- Commits verified by task execution: 6b4381e (Task 1), c812f29 (Task 2)

---
*Phase: 10-production-deployment*
*Completed: 2026-05-13*
