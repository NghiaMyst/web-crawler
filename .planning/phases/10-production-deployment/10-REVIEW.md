---
phase: 10-production-deployment
reviewed: 2026-05-14T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - apps/api/.env.prod.example
  - apps/api/Program.cs
  - apps/crawler/.env.prod.example
  - apps/crawler/src/index.ts
  - apps/crawler/src/services/bloomFilter.test.ts
  - apps/crawler/src/services/bloomFilter.ts
  - apps/dashboard/.env.production.example
  - apps/dashboard/vercel.json
  - docker-compose.prod.yml
  - docs/deployment/cert-bootstrap.md
  - docs/deployment/oracle-firewall.md
  - docs/deployment/persistence-validation.md
  - docs/deployment/production-deploy.md
  - docs/deployment/vercel-deploy.md
  - .env.prod.example
  - nginx/nginx.conf
  - scripts/issue-cert.sh
  - scripts/preflight-prod-compose.sh
  - scripts/renew-cert.sh
  - scripts/verify-bloom-persistence.sh
  - scripts/verify-bullmq-survival.sh
  - scripts/verify-redis-aof.sh
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-05-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

This review covers all Phase 10 production deployment artifacts: Docker Compose
production config, Nginx reverse proxy, Let's Encrypt cert scripts, three persistence
validation scripts, the crawler entry point and Bloom Filter service, five env example
templates, Vercel config, and the .NET API entry point.

The infrastructure design is sound — ARM64 platform targets, Redis AOF persistence,
DNS-01 cert issuance, no exposed database ports, `restart: always` on all services,
and explicit health checks on all containers. Two critical issues were found: the API
`.env.prod.example` provides a key name (`ConnectionStrings__DefaultConnection`) that
`Program.cs` never reads — the API actually requires `DATABASE_URL` and will throw on
startup if given only the wrong key; and the graceful shutdown callback in
`apps/crawler/src/index.ts` does not guard `saveBloomFilter` errors, meaning a Redis
unavailability at shutdown silently skips all subsequent cleanup (browser pool close,
worker drains). Five warnings cover a cert-renewal edge case, missing temp-file trap,
use of O(N) `KEYS` on production Redis, a CORS env-var fallback that silently permits
localhost origins in production, and a health-check wait condition in
`verify-bullmq-survival.sh` that can pass before workers are initialized. Four info
items cover missing HSTS headers, a hardcoded `sleep 2` after async `BGREWRITEAOF`, a
no-op crawler healthcheck in Docker Compose, and silent error swallowing in
`bloomFilter.ts`.

---

## Critical Issues

### CR-01: `apps/api/.env.prod.example` uses wrong config key — API crashes on startup

**File:** `apps/api/.env.prod.example:5`

**Issue:** The example file sets `ConnectionStrings__DefaultConnection`, which maps to
`Configuration["ConnectionStrings:DefaultConnection"]` in .NET configuration. However
`apps/api/Program.cs:31-33` reads `builder.Configuration["DATABASE_URL"]` and throws
`InvalidOperationException("DATABASE_URL not set")` if it is absent:

```csharp
opt.UseNpgsql(builder.Configuration["DATABASE_URL"]
       ?? throw new InvalidOperationException("DATABASE_URL not set"))
```

When an operator copies the example and fills in the password — as instructed in
`docs/deployment/production-deploy.md:81` — the API container will throw on startup
because `DATABASE_URL` is never provided. `ConnectionStrings__DefaultConnection` is
silently ignored by `UseNpgsql`. The `preflight-prod-compose.sh` script does not
catch this because it only checks for the env var rename in the source code, not
whether the example file matches.

**Fix:**

```diff
# apps/api/.env.prod.example
-ConnectionStrings__DefaultConnection=Host=postgres;Port=5432;Database=webcrawler;Username=crawler;Password=CHANGE_ME_STRONG_PASSWORD
+DATABASE_URL=Host=postgres;Port=5432;Database=webcrawler;Username=crawler;Password=CHANGE_ME_STRONG_PASSWORD
```

```diff
# docs/deployment/production-deploy.md line 81
-  - `ConnectionStrings__DefaultConnection`: replace `CHANGE_ME_STRONG_PASSWORD`...
+  - `DATABASE_URL`: replace `CHANGE_ME_STRONG_PASSWORD`...
```

---

### CR-02: Graceful shutdown skips cleanup if `saveBloomFilter` throws

**File:** `apps/crawler/src/index.ts:94-102`

**Issue:** The `additionalCleanup` callback passed to `setupGracefulShutdown` calls
`await saveBloomFilter()` first (line 95) with no try/catch. `saveBloomFilter` in
`bloomFilter.ts:21-23` does not handle errors either — if `connection.setex` rejects
(e.g., Redis is already stopping when SIGTERM arrives), the rejection propagates and
aborts the entire cleanup callback. The subsequent calls to `browserPool.closeAll()`,
`footballWorker.close()`, and all other worker `.close()` calls are never executed.
This leaves Playwright browser sub-processes running, worker connections open, and
BullMQ jobs potentially in an ambiguous in-flight state.

```typescript
// Fix: wrap saveBloomFilter in try/catch so cleanup always continues
await setupGracefulShutdown(crawlWorker, async () => {
  try {
    await saveBloomFilter();
  } catch (err) {
    logger.error('saveBloomFilter failed on shutdown — bloom state not persisted', { err });
  }
  await browserPool.closeAll();
  await footballWorker.close();
  await genshinWorker.close();
  await lolWorker.close();
  await anilistWorker.close();
  await mangadexWorker.close();
});
```

---

## Warnings

### WR-01: `renew-cert.sh` nginx reload fails silently when nginx is not running

**File:** `scripts/renew-cert.sh:22`

**Issue:** `docker compose exec -T nginx nginx -s reload` exits non-zero when the
nginx container is down or restarting. Because `set -euo pipefail` is active, this
kills the script and logs a failure — even when certbot itself succeeded and wrote a
fresh cert. Cron will log the run as failed and may trigger false-alarm monitoring
alerts, leading operators to dismiss future real failures as noise.

**Fix:** Guard the reload with a running-state check and degrade gracefully:

```bash
echo "[renew-cert] Reloading nginx..."
if docker compose -f "${COMPOSE_FILE}" ps nginx 2>/dev/null | grep -q "running\|Up"; then
  docker compose -f "${COMPOSE_FILE}" exec -T nginx nginx -s reload
  echo "[renew-cert] nginx reloaded"
else
  echo "[renew-cert] WARNING: nginx not running — cert renewed but nginx reload skipped"
fi
```

---

### WR-02: `verify-bullmq-survival.sh` leaks temp file on early exit

**File:** `scripts/verify-bullmq-survival.sh:24,88`

**Issue:** `pre_id_snapshot=$(mktemp)` at line 24 creates a temp file removed only at
line 88 (`rm -f "${pre_id_snapshot}"`). Because `set -euo pipefail` is active, any
`exit 1` between those lines aborts the script without running the cleanup. Repeated
validation runs accumulate stale temp files under `/tmp`.

**Fix:** Register a trap immediately after `mktemp`:

```bash
pre_id_snapshot=$(mktemp)
trap 'rm -f "${pre_id_snapshot}"' EXIT
# ...then remove the explicit rm -f at line 88
```

---

### WR-03: Validation scripts use `KEYS` on a live production Redis

**File:** `scripts/verify-bloom-persistence.sh:14,49` and `scripts/verify-bullmq-survival.sh:14,59`

**Issue:** `redis-cli KEYS "bloom:*"` and `redis-cli KEYS "bull:*"` are O(N) blocking
operations that hold the Redis event loop for the full scan duration. During a live
crawl these will stall BullMQ job processing and delay any in-flight Redis operations
(including crawler writes). The scripts are documented as manual-only, which limits
frequency, but running them during the SC-4/SC-5 sign-off while the crawler is active
will cause measurable disruption.

**Fix:** Replace both `KEYS` calls with `SCAN`:

```bash
pre_keys=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" \
  redis-cli --no-raw SCAN 0 MATCH "${BLOOM_KEY_PREFIX}*" COUNT 1000 \
  | tail -n +2 | sort | tr -d '\r')
```

For the handful of bloom/bull keys expected, a single `SCAN 0 ... COUNT 1000` is
sufficient and non-blocking.

---

### WR-04: `CORS_ALLOWED_ORIGINS` env-var absence silently permits localhost origin in production

**File:** `apps/api/Program.cs:77-83`

**Issue:** If `CORS_ALLOWED_ORIGINS` is missing or empty in the environment,
`?.Split(',')` returns `null` and the fallback `new[] { "http://localhost:3000" }` is
used silently. In production this means a misconfigured API allows cross-origin
requests from localhost while blocking the real Vercel frontend — the operator sees
CORS errors from the dashboard but the API appears to work from a local dev machine,
making diagnosis confusing. An empty string also produces a single-element array
`[""]` which ASP.NET Core CORS treats as an invalid origin pattern.

```csharp
// Fix: fail fast in Production if the var is missing or empty
var corsRaw = Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGINS");
if (string.IsNullOrWhiteSpace(corsRaw) && builder.Environment.IsProduction())
    throw new InvalidOperationException("CORS_ALLOWED_ORIGINS must be set in production.");
var corsOrigins = corsRaw?.Split(',', StringSplitOptions.RemoveEmptyEntries)
    ?? new[] { "http://localhost:3000" };
options.AddDefaultPolicy(policy =>
    policy.WithOrigins(corsOrigins)
          .AllowAnyHeader().AllowAnyMethod().AllowCredentials());
```

---

### WR-05: `verify-bullmq-survival.sh` health-check loop can pass before workers initialize

**File:** `scripts/verify-bullmq-survival.sh:46-55`

**Issue:** The loop that waits for the crawler after restart uses an `||` fallback:

```bash
if echo "${status}" | grep -q '"Health":"healthy"' || \
   docker compose ... ps "${CRAWLER_SVC}" | grep -q "running"; then
```

The second condition (`grep -q "running"`) matches a container that is in the
`running` state but whose health check has not yet passed — i.e., the crawler process
is alive but BullMQ workers may not have re-registered or completed stall-recovery.
Job counter assertions made immediately after this can reflect pre-recovery state,
producing a false positive PASS.

**Fix:** Remove the `running` fallback and rely solely on the `healthy` health status:

```bash
for i in $(seq 1 60); do
  status=$(docker compose -f "${COMPOSE_FILE}" ps --format json "${CRAWLER_SVC}" 2>/dev/null)
  if echo "${status}" | grep -q '"Health":"healthy"'; then
    break
  fi
  sleep 1
  if [[ "${i}" -eq 60 ]]; then
    echo "[verify-bullmq] FAIL: crawler did not return to healthy within 60s"
    exit 1
  fi
done
```

---

## Info

### IN-01: `bloomFilter.ts` — errors swallowed silently with no log output

**File:** `apps/crawler/src/services/bloomFilter.ts:15-17`

**Issue:** The catch block in `loadBloomFilter` is empty — no log statement, no
metric, no indication that the filter fell back to a fresh state. In production,
silent fallback means operators will not know the bloom filter is operating without
its persisted history (causing re-crawl of already-seen URLs) unless they happen to
check Redis directly.

**Fix:**

```typescript
} catch (err) {
  // logger must be imported; adjust import path as needed
  logger.warn('loadBloomFilter: Redis read failed — starting with fresh filter', { err });
}
```

Similarly, add error logging (or re-throw after logging) in `saveBloomFilter` if
`connection.setex` rejects, so the critical-shutdown path in `index.ts` can log the
failure before continuing cleanup.

---

### IN-02: Docker Compose crawler healthcheck is a no-op

**File:** `docker-compose.prod.yml:71`

**Issue:** The crawler healthcheck is `["CMD", "node", "-e", "process.exit(0)"]`.
This always returns healthy as long as `node` is in PATH — it does not verify that
the crawler process (PID 1 inside the container) is alive, that BullMQ workers are
registered, or that any queue connection is open. A crashed crawler that leaves the
`node` binary accessible would still appear healthy.

**Fix:** At minimum, check that the main process is still alive:

```yaml
healthcheck:
  test: ["CMD", "sh", "-c", "kill -0 1 2>/dev/null || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

A more robust option is to expose a lightweight HTTP liveness endpoint from the
crawler process and poll that.

---

### IN-03: nginx.conf missing HSTS and basic security response headers

**File:** `nginx/nginx.conf:41-75`

**Issue:** The HTTPS server block sends no `Strict-Transport-Security` header.
Without HSTS, browsers do not automatically upgrade future HTTP requests and users
can be downgraded on first visit. `X-Content-Type-Options` and `X-Frame-Options` are
also absent.

**Fix:** Add to the `server { listen 443 ssl; }` block, outside the `location` blocks:

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
```

---

### IN-04: `verify-redis-aof.sh` uses a fixed `sleep 2` after async `BGREWRITEAOF`

**File:** `scripts/verify-redis-aof.sh:34-36`

**Issue:** `BGREWRITEAOF` is asynchronous. On a Redis instance with many keys or
under load, the rewrite may not complete within 2 seconds, causing the subsequent
`ls /data` check to miss the AOF artifact and produce a false failure. Under normal
first-deploy conditions (sparse data) 2 seconds is ample, but this is a latent
fragility on busy instances.

**Fix:** Poll `INFO persistence` for completion:

```bash
docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli BGREWRITEAOF >/dev/null
for i in $(seq 1 15); do
  in_progress=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" \
    redis-cli INFO persistence | grep -c 'aof_rewrite_in_progress:1' || true)
  [[ "${in_progress}" -eq 0 ]] && break
  sleep 1
done
```

---

_Reviewed: 2026-05-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
