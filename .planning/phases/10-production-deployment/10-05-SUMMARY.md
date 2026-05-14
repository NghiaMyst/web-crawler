---
phase: 10-production-deployment
plan: "05"
subsystem: infra
tags: [deployment, runbook, oracle-cloud, production, docker-compose, signoff, shell]

# Dependency graph
requires:
  - phase: 10-01
    provides: docker-compose.prod.yml, .env.prod.example files, CORS_ALLOWED_ORIGINS rename
  - phase: 10-02
    provides: oracle-firewall.md, cert-bootstrap.md, issue-cert.sh, renew-cert.sh, nginx/nginx.conf
  - phase: 10-03
    provides: vercel-deploy.md, Vercel env setup, CORS handoff procedure
  - phase: 10-04
    provides: persistence-validation.md, verify-redis-aof.sh, verify-bloom-persistence.sh, verify-bullmq-survival.sh
provides:
  - scripts/preflight-prod-compose.sh — idempotent compose-file sanity check enforcing all Phase 10 invariants
  - docs/deployment/production-deploy.md — master 10-step deploy runbook with SC-1..SC-5 sign-off block
affects: [operator deploying phase 10, any future phase 10 runbook references]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Preflight gate pattern: run bash script before deploy to catch regressions early"
    - "CORS sequencing constraint: Vercel deploy before CORS env var update before API start"
    - "Linear runbook with numbered steps ensures operator follows correct order"

key-files:
  created:
    - scripts/preflight-prod-compose.sh
    - docs/deployment/production-deploy.md
  modified: []

key-decisions:
  - "Preflight script runs docker compose config --no-interpolate for YAML validation without needing real env vars"
  - "CORS sequencing constraint made explicit in Step 5 callout: Vercel deploy (Step 5) → CORS update (Step 6) → API start (Step 7)"
  - "Rollback section explicitly warns NEVER run down -v in production to prevent data loss"
  - "Troubleshooting table maps symptom to step to doc for quick operator triage"

patterns-established:
  - "preflight-before-deploy: bash scripts/preflight-prod-compose.sh as first action before any deploy"
  - "SC sign-off block: each success criterion has a specific command + expected output + checkbox"

requirements-completed: [DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-05, INFRA-02]

# Metrics
duration: 7min
completed: 2026-05-13
---

# Phase 10 Plan 05: Production Deployment Runbook + Preflight Script Summary

**Preflight compose sanity-check script + master 10-step deploy runbook with SC-1..SC-5 sign-off block closes Phase 10 operationally**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-13T14:33:39Z
- **Completed:** 2026-05-13T14:40:41Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `scripts/preflight-prod-compose.sh`: idempotent 16-check sanity script enforcing all Phase 10 invariants (AOF flags, redis_data volume, no dashboard, no exposed DB ports, 5x ARM64/restart-always, CORS env rename, referenced files exist); exits non-zero on any regression; passes against current `docker-compose.prod.yml`
- `docs/deployment/production-deploy.md`: 301-line master runbook ordering preflight → firewall → clone → .env.prod → cert → Vercel → CORS handoff → first up → cert renewal cron → SC sign-off → mark complete; includes explicit CORS sequencing gate callout
- SC-1 through SC-5 sign-off block: each criterion has a specific shell command, expected output, and checkbox; provides formal yes/no answer for Phase 10 completion

## Task Commits

Each task was committed atomically:

1. **Task 1: Author scripts/preflight-prod-compose.sh** - `6842f7b` (feat)
2. **Task 2: Author docs/deployment/production-deploy.md** - `5e8000a` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `scripts/preflight-prod-compose.sh` — Idempotent compose-file sanity check; validates YAML, all Phase 10 invariants (D-04/D-07/D-08), referenced files, and CORS env rename; exits non-zero on failure
- `docs/deployment/production-deploy.md` — Master Phase 10 deployment runbook: prerequisites, 10-step deploy procedure, SC-1..SC-5 sign-off block, rollback section with `down -v` warning, troubleshooting table

## Decisions Made

- **Preflight uses `--no-interpolate`**: `docker compose config --no-interpolate` validates YAML without requiring real secrets in environment — safe to run on any machine
- **CORS sequencing constraint made explicit**: Step 5 callout box states "This Vercel deploy MUST happen before Step 6" to prevent the common failure mode of starting the API before the Vercel URL is known
- **Rollback avoids `down -v`**: Rollback section explicitly says "NEVER run `down -v` in production" with consequence explanation (wipes postgres_data, redis_data, letsencrypt volumes)
- **Troubleshooting table uses doc references**: Each row includes the supporting doc (cert-bootstrap.md, oracle-firewall.md, etc.) so operator can go deep without re-reading the master runbook

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Phase 10 requires operator intervention for production deployment. The runbook in
`docs/deployment/production-deploy.md` covers all manual steps end-to-end:

- Oracle Cloud VCN security rules (TCP 80/443)
- DuckDNS subdomain setup
- Vercel account + import + env vars
- `.env.prod` population with real secrets
- Let's Encrypt cert issuance
- Cert renewal cron setup

## Next Phase Readiness

Phase 10 is the final phase. After the operator follows the runbook and all 5 SC boxes are
ticked, the project is complete at v1.0.

Formal completion:
1. Operator runs `docs/deployment/production-deploy.md` top-to-bottom on Oracle server
2. All SC-1..SC-5 checkboxes pass
3. Operator updates `ROADMAP.md` per Step 10

---
*Phase: 10-production-deployment*
*Completed: 2026-05-13*
