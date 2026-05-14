# Persistence Validation Runbook — DEPLOY-04 + DEPLOY-05

Run these three scripts in order to validate the production stack persists state
across container restarts. They satisfy Phase 10 ROADMAP success criteria SC-4 and
SC-5:

- **SC-4:** After `docker compose restart redis`, the Bloom Filter correctly rejects a
  URL that was seen before the restart (state reloaded from Redis AOF).
- **SC-5:** After `docker compose restart crawler`, no in-flight job is duplicated or
  lost (BullMQ job state survives via Redis persistence).

## Prerequisites

1. `docker compose -f docker-compose.prod.yml up -d` has been run on the Oracle
   server (Plan 10-05 brings up the stack).
2. At least one crawl has run successfully. Trigger one manually if needed:
   ```bash
   # Example: trigger a football-data.org crawl via the API.
   curl -X POST https://<DUCKDNS_DOMAIN>/api/jobs \
     -H 'Content-Type: application/json' \
     -d '{"sourceId": "<source-uuid>"}'
   # Then wait ~30s for the BullMQ worker to process it.
   ```
3. Working directory is the deploy root (e.g., `/opt/webcrawler`) where
   `docker-compose.prod.yml` lives.
4. All three script files must be executable. If not:
   ```bash
   chmod +x ./scripts/verify-redis-aof.sh ./scripts/verify-bloom-persistence.sh ./scripts/verify-bullmq-survival.sh
   ```

## Step 1 — DEPLOY-04: Redis AOF Presence

```bash
./scripts/verify-redis-aof.sh
```

Asserts:
- `redis-cli CONFIG GET appendonly` returns `yes`
- `redis-cli CONFIG GET appendfsync` returns `everysec`
- `/data` has an `appendonly.aof` file (Redis 6) or `appendonlydir/` directory (Redis 7)
- `/data` is a real Docker volume mount (not tmpfs), verified via `docker inspect`

Exit 0 = PASS, non-zero = FAIL with diagnostic output.

## Step 2 — DEPLOY-05 (Redis side): Bloom Filter Survival

```bash
./scripts/verify-bloom-persistence.sh
```

Asserts: same count of `bloom:*` keys before and after `docker compose restart redis`,
AND each key has identical byte size (STRLEN) post-restart.

**Note:** This restarts Redis, briefly disconnecting the API and crawler. They
re-establish connections automatically (BullMQ + ioredis auto-reconnect). Allow ~5s
after script completion for full re-stabilization.

## Step 3 — SC-5: BullMQ Job Survival Across Crawler Restart

```bash
./scripts/verify-bullmq-survival.sh
```

Asserts:
- `bull:*` key count does not DECREASE across `docker compose restart crawler`
  (allowed to grow — new jobs may have queued during restart)
- Each per-queue `:id` counter is monotonic non-decreasing (no ID reset means no
  duplicate job IDs possible)

## Combined Sign-Off

Run all three sequentially; record the exit codes:

```bash
set -e
./scripts/verify-redis-aof.sh        && echo "DEPLOY-04: PASS"
./scripts/verify-bloom-persistence.sh && echo "DEPLOY-05 (bloom): PASS"
./scripts/verify-bullmq-survival.sh   && echo "SC-5 (bullmq): PASS"
```

If all three print PASS, Phase 10 SC-4 + SC-5 are signed off.

## Failure Triage

| Script | Failure message | Likely cause |
|--------|-----------------|--------------|
| verify-redis-aof | `appendonly=no` | `docker-compose.prod.yml` redis `command` missing `--appendonly yes` — re-check Plan 10-01 |
| verify-redis-aof | `/data is a tmpfs` | redis service missing `redis_data:/data` volume mount — re-check Plan 10-01 |
| verify-redis-aof | `no AOF file/dir found in /data` | AOF disabled at startup, or volume just provisioned with no writes yet — run a crawl first |
| verify-redis-aof | `/data is not mounted` | redis container has no /data mount at all — check compose volumes section |
| verify-bloom-persistence | `0 keys matching bloom:*` | Crawler has not inserted any URL yet — trigger a crawl and wait ~30s |
| verify-bloom-persistence | `size changed across restart` | AOF not fsyncing fast enough — should not happen with `everysec`; investigate Redis logs |
| verify-bloom-persistence | `redis did not come back online within 30s` | Redis startup failure — check `docker compose logs redis` |
| verify-bullmq-survival | `no BullMQ keys matching bull:*` | Crawler has not started any queues yet — ensure crawler is running and has processed a job |
| verify-bullmq-survival | `bull key count decreased` | BullMQ stall-recovery did NOT re-queue an in-flight job — check BullMQ worker logs for "stall" events |
| verify-bullmq-survival | `:id counter regressed` | Redis state was lost — volume mount is likely missing or wrong; re-check Plan 10-01 |
| verify-bullmq-survival | `${key} disappeared after restart` | A BullMQ :id key was lost — likely Redis restarted without AOF; check verify-redis-aof first |

## Environment Variable Overrides

All three scripts support these env var overrides for non-standard deployments:

| Variable | Default | Description |
|----------|---------|-------------|
| `COMPOSE_FILE` | `docker-compose.prod.yml` | Path to the compose file |
| `REDIS_SVC` | `redis` | Docker Compose service name for Redis |
| `CRAWLER_SVC` | `crawler` | Docker Compose service name for the crawler (bullmq script only) |
| `BLOOM_KEY_PREFIX` | `bloom:` | Redis key prefix used by the Bloom Filter |
| `BULL_KEY_PREFIX` | `bull:` | Redis key prefix used by BullMQ |

Example — run against a staging compose file:
```bash
COMPOSE_FILE=docker-compose.staging.yml ./scripts/verify-redis-aof.sh
```

## Cron-Based Continuous Validation (optional)

Once the stack is stable, the operator may add a daily AOF presence check:
```cron
0 4 * * * cd /opt/webcrawler && ./scripts/verify-redis-aof.sh >> /var/log/persistence-check.log 2>&1
```

Only the AOF presence script is safe for cron — the bloom/bullmq scripts deliberately
restart services and should be run manually as part of the deploy sign-off, not on a
schedule.
