---
phase: 10
plan: "04"
subsystem: persistence-validation
tags:
  - redis
  - persistence
  - aof
  - bloom-filter
  - bullmq
  - validation
  - scripts
dependency_graph:
  requires:
    - "10-01"  # docker-compose.prod.yml with redis_data volume + AOF command
  provides:
    - "DEPLOY-04 operational test (verify-redis-aof.sh)"
    - "DEPLOY-05 operational test (verify-bloom-persistence.sh)"
    - "SC-5 operational test (verify-bullmq-survival.sh)"
    - "Persistence runbook for Plan 10-05 final sign-off"
  affects:
    - "10-05"  # Final deploy sign-off references these scripts
tech_stack:
  added: []
  patterns:
    - "Bash idempotent validation scripts with set -euo pipefail"
    - "docker compose exec -T for non-interactive container commands"
    - "Snapshot-restart-compare pattern for persistence assertions"
key_files:
  created:
    - scripts/verify-redis-aof.sh
    - scripts/verify-bloom-persistence.sh
    - scripts/verify-bullmq-survival.sh
    - docs/deployment/persistence-validation.md
  modified: []
decisions:
  - "Scripts use prefix-based KEYS scans (bloom:* / bull:*) rather than hardcoded key names — resilient to key name changes in BullMQ/bloom-filters npm packages"
  - "BLOOM key assertion uses STRLEN (not value) to avoid logging sensitive data — T-10-19 mitigation"
  - "BullMQ assertion checks :id counter monotonicity rather than full snapshot diff — detects duplication risk while being stable to new-job additions during restart window"
  - "bloom/bullmq scripts are NOT cron-safe (they restart services); only verify-redis-aof.sh is scheduled-safe"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-13"
  tasks_completed: 3
  files_created: 4
---

# Phase 10 Plan 04: Redis Persistence Validation Scripts Summary

Three executable validation scripts and one runbook that operationally test Redis AOF persistence, Bloom Filter survival, and BullMQ job survival — closing DEPLOY-04, DEPLOY-05, and SC-5 with repeatable pass/fail assertions.

## What Was Built

### scripts/verify-redis-aof.sh (DEPLOY-04)
Validates Redis AOF is enabled and persisted:
- `redis-cli CONFIG GET appendonly` asserts `yes`
- `redis-cli CONFIG GET appendfsync` asserts `everysec`
- Forces `BGREWRITEAOF` then asserts `appendonly.aof` (Redis 6) or `appendonlydir/` (Redis 7) exists in `/data`
- `docker inspect` confirms `/data` is a real volume (not tmpfs)
- Commit: `c767170`

### scripts/verify-bloom-persistence.sh (DEPLOY-05 / SC-4)
Validates Bloom Filter state survives `docker compose restart redis`:
- Captures `bloom:*` key count + STRLEN per key before restart
- Restarts Redis, waits up to 30s for PING=PONG
- Re-reads keys post-restart; asserts identical count AND identical STRLEN per key
- Commit: `d6442c5`

### scripts/verify-bullmq-survival.sh (DEPLOY-05 / SC-5)
Validates BullMQ jobs survive `docker compose restart crawler`:
- Snapshots `bull:*` keys and all `:id` counter values before restart
- Restarts crawler, waits up to 60s for health
- Asserts key count is non-decreasing (no job loss)
- Asserts each `:id` counter is monotonically non-decreasing (no ID reset = no duplicate risk)
- Commit: `d6442c5`

### docs/deployment/persistence-validation.md
Runbook orchestrating the three scripts as the Phase 10 SC-4 + SC-5 sign-off:
- Prerequisites (stack running, at least one crawl triggered)
- Step-by-step execution for each script
- Combined sign-off block: `set -e` chain of all three scripts
- 11-row failure triage table covering all common failure modes
- Environment variable overrides for non-standard deployments
- Cron guidance (AOF script only — restart scripts are manual)
- Commit: `4eb4d20`

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: verify-redis-aof.sh | c767170 | scripts/verify-redis-aof.sh |
| Task 2: verify-bloom-persistence.sh + verify-bullmq-survival.sh | d6442c5 | scripts/verify-bloom-persistence.sh, scripts/verify-bullmq-survival.sh |
| Task 3: persistence-validation.md runbook | 4eb4d20 | docs/deployment/persistence-validation.md |

## Deviations from Plan

None — plan executed exactly as written.

## Open Follow-ups

1. **Depends on Plan 10-01**: scripts use `docker-compose.prod.yml` and the `redis_data` named volume configured in that plan. Running these scripts before Plan 10-01 is deployed will fail.
2. **Depends on Plan 10-05**: scripts require a live running stack with at least one crawl completed (so `bloom:*` and `bull:*` keys exist in Redis). Plan 10-05 documents triggering a manual crawl as part of the deploy sign-off procedure before running these validation scripts.
3. **Bloom filter key name**: scripts scan `bloom:*` prefix. If the Phase 2 bloom-filters implementation uses a different prefix (e.g., `bf:`), set `BLOOM_KEY_PREFIX=bf:` before running verify-bloom-persistence.sh.

## Known Stubs

None — all scripts perform real operational assertions against the running stack.

## Self-Check: PASSED
- scripts/verify-redis-aof.sh exists and is executable
- scripts/verify-bloom-persistence.sh exists and is executable
- scripts/verify-bullmq-survival.sh exists and is executable
- docs/deployment/persistence-validation.md exists with 125 lines (>40 minimum)
- Commits c767170, d6442c5, 4eb4d20 verified in git log
