---
phase: 12-ci-cd-pipeline-and-observability-github-actions-deploy-to-gc
reviewed: 2026-05-26T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - .github/workflows/deploy.yml
  - .gitignore
  - apps/api.Tests/Endpoints/MetricsEndpointTests.cs
  - apps/api.Tests/WebCrawlerApi.Tests.csproj
  - apps/api/Program.cs
  - apps/api/WebCrawlerApi.csproj
  - apps/crawler/package.json
  - apps/crawler/src/index.ts
  - apps/crawler/src/metrics/crawlMetrics.test.ts
  - apps/crawler/src/metrics/crawlMetrics.ts
  - apps/crawler/src/metrics/metricsServer.test.ts
  - apps/crawler/src/metrics/metricsServer.ts
  - docker-compose.prod.yml
  - docs/deployment/artifact-registry-setup.md
  - docs/deployment/grafana-setup.md
  - monitoring/grafana/dashboards/api.json
  - monitoring/grafana/dashboards/crawler.json
  - monitoring/grafana/provisioning/dashboards/provider.yml
  - monitoring/grafana/provisioning/datasources/prometheus.yml
  - monitoring/prometheus/prometheus.yml
  - nginx/nginx.conf
findings:
  critical: 3
  warning: 5
  info: 3
  total: 11
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-05-26
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

This phase introduces the full CI/CD pipeline (GitHub Actions build-push-deploy), Prometheus/Grafana observability stack, and associated infrastructure. The overall architecture is sound — Workload Identity Federation is used correctly (no JSON key leakage), secrets are managed via GitHub Secrets, and the Docker Compose resource limits are well-considered for a $300 free-credit GCP VM.

Three critical issues were found:

1. The nginx config contains unresolved `<DUCKDNS_DOMAIN>` template placeholders that will cause nginx to misconfigure TLS and silently serve the wrong virtual host in production.
2. The SSH deploy step uses the wrong parameter name (`fingerprint` instead of `known_hosts`), which disables host key verification and exposes the deploy to MITM attacks.
3. The VM public IP address (`34.87.36.185`) is hardcoded in a committed documentation file, exposing the attack surface.

Additionally, the deploy script has a first-run failure bug (the `sed` command aborts on a non-existent `.env.prod` before the fallback `grep` append can run), and the crawler healthcheck provides no actual health signal.

---

## Critical Issues

### CR-01: nginx `server_name` and TLS cert paths contain unresolved template placeholders

**File:** `nginx/nginx.conf:44,52,53`
**Issue:** The `server_name` directive and both TLS `ssl_certificate` / `ssl_certificate_key` paths use the literal string `<DUCKDNS_DOMAIN>` rather than the actual domain. nginx will start with this as-is — it will not match any real request, and TLS initialization will fail because the certificate path does not exist. Every HTTPS request will return a connection error. If nginx does start despite the missing cert file, the HTTP-to-HTTPS redirect server (line 44) will also match nothing.
**Fix:** Replace all three occurrences before deployment:
```nginx
server_name webcrawler-myst.duckdns.org;

ssl_certificate     /etc/letsencrypt/live/webcrawler-myst.duckdns.org/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/webcrawler-myst.duckdns.org/privkey.pem;
```
If the domain must remain configurable, pass it as an environment variable using `envsubst` in the Docker entrypoint or use a templated nginx config file.

---

### CR-02: SSH deploy uses `fingerprint` instead of `known_hosts`, disabling host verification

**File:** `.github/workflows/deploy.yml:79`
**Issue:** `appleboy/ssh-action` does not have a `fingerprint` parameter — the correct parameter for host verification is `known_hosts`. When an unknown parameter is passed, the action silently ignores it and falls back to `StrictHostKeyChecking=no`. This means the deploy step performs SSH without verifying the server's host key, making the connection vulnerable to a machine-in-the-middle attack against the CI deploy pipeline. An attacker who intercepts the SSH connection during deploy could execute arbitrary commands on the runner.
**Fix:** Rename the parameter from `fingerprint` to `known_hosts`. The secret value should be the full output of `ssh-keyscan -H <VM_IP>` stored in the `GCE_SSH_KNOWN_HOSTS` secret:
```yaml
with:
  host: ${{ secrets.GCE_SSH_HOST }}
  username: ${{ secrets.GCE_SSH_USER }}
  key: ${{ secrets.GCE_SSH_PRIVATE_KEY }}
  known_hosts: ${{ secrets.GCE_SSH_KNOWN_HOSTS }}
```

---

### CR-03: VM public IP address hardcoded in committed documentation file

**File:** `docs/deployment/artifact-registry-setup.md:194,199,209,237,244`
**Issue:** The GCE VM's public IP `34.87.36.185` appears multiple times in a file committed to the repository. The repository appears to be public (GitHub Actions use OIDC federation with a public GitHub org). Committing the VM's IP reduces the effort required to target it — port scans, brute-force attacks, and CVE exploitation can all be directed at a known IP.
**Fix:** Replace the hardcoded IP with the placeholder `<GCE_VM_IP>` throughout the document and add a note at the top instructing the reader to substitute their actual VM IP. The real IP should only exist in the `GCE_SSH_HOST` GitHub Secret and in operator notes kept off-repository.

---

## Warnings

### WR-01: Deploy script fails on first deploy when `.env.prod` does not exist

**File:** `.github/workflows/deploy.yml:87-88`
**Issue:** The `sed -i` command on line 87 runs under `set -e`. If `.env.prod` does not exist (first deploy, or after a VM rebuild), `sed` exits with a non-zero code and the script aborts immediately. The fallback `grep | echo` append on line 88 never runs. The deploy will fail with a cryptic `sed: can't read .env.prod: No such file or directory` error.
**Fix:** Use a guard that creates the file if missing, then runs `sed`, falling back to append only if the key is absent:
```bash
touch .env.prod
if grep -q "^IMAGE_TAG=" .env.prod; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env.prod
else
  echo "IMAGE_TAG=${IMAGE_TAG}" >> .env.prod
fi
```

---

### WR-02: Crawler healthcheck always returns healthy regardless of process state

**File:** `docker-compose.prod.yml:65-67`
**Issue:** The crawler healthcheck runs `node -e process.exit(0)`, which always exits 0. This tells Docker the container is healthy even if the BullMQ workers have silently crashed, if the Redis connection is broken, or if the metrics server is down. Docker's restart policy and the `api` depends_on chain cannot detect a stuck crawler.
**Fix:** Replace the healthcheck with one that actually probes the metrics server (which is only started after workers initialize):
```yaml
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost:9464/metrics"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 30s
```
If `wget` is not available in the crawler image, use `curl -sf http://localhost:9464/metrics` or a small Node script that issues an HTTP GET and exits non-zero on failure.

---

### WR-03: Redis URL stripping in Program.cs corrupts TLS and authenticated connection strings

**File:** `apps/api/Program.cs:38`
**Issue:** `redisConnStr.Replace("redis://", "")` is a naive string replacement. It will silently corrupt any URL that uses:
- `rediss://` (TLS) — becomes `s://host:port` which is invalid
- `redis://:password@host:port` — becomes `:password@host:port` (malformed)
- `redis://user:password@host:port` — strips scheme but leaves credentials in an unexpected format

StackExchange.Redis `ConfigurationOptions.Parse()` does not accept URIs with schemes, so some replacement is required — but the current approach is brittle.
**Fix:** Use `Uri` parsing to extract only the host and port, then rebuild the StackExchange.Redis connection string:
```csharp
var redisConnStr = builder.Configuration["REDIS_URL"] ?? "localhost:6379";
var redisEndpoint = redisConnStr.StartsWith("redis")
    ? new Uri(redisConnStr).Authority   // "host:port"
    : redisConnStr;
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect(redisEndpoint));
```
For full URI support including passwords, use `ConfigurationOptions` directly.

---

### WR-04: GCP project ID hardcoded in docker-compose.prod.yml image paths

**File:** `docker-compose.prod.yml:53,81`
**Issue:** The image names embed the literal GCP project ID `project-c67469b2-5925-4167-b6a`:
```
asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler/crawler:${IMAGE_TAG:-latest}
```
The deploy workflow pulls this value from `${{ secrets.GCP_PROJECT_ID }}` but the compose file has no way to read that secret. If the GCP project is ever migrated or recreated, both lines must be manually updated and a broken deploy will result. The hardcoded project ID also constitutes a minor information disclosure.
**Fix:** Parameterize via the `.env.prod` file that is already used at deploy time:
```yaml
# In .env.prod (on VM, not committed):
GCP_PROJECT_ID=project-c67469b2-5925-4167-b6a

# In docker-compose.prod.yml:
image: asia-southeast1-docker.pkg.dev/${GCP_PROJECT_ID}/webcrawler/crawler:${IMAGE_TAG:-latest}
```
The deploy script already calls `--env-file .env.prod`, so this variable will be resolved correctly.

---

### WR-05: Metrics server port not exposed from `startMetricsServer`, causing test resource leak

**File:** `apps/crawler/src/metrics/metricsServer.ts:10`, `apps/crawler/src/metrics/metricsServer.test.ts:11-19`
**Issue:** `startMetricsServer` starts an HTTP server but returns `void` — the `http.Server` instance is not exposed to callers. The test file uses a `serverStarted` boolean flag to avoid calling `startMetricsServer` twice, but there is no `afterAll` hook to close the server. This leaves a TCP listener on port 19464 open after the test suite completes, which will cause a port-in-use error if tests are re-run in the same process or if another test file attempts to start a server on the same port.

Additionally, the 100ms `setTimeout` on line 19 is a timing-dependent heuristic that can be flaky under CI load.
**Fix:** Return the server instance from `startMetricsServer`:
```typescript
export function startMetricsServer(queues: Queue[], port = 9464): http.Server {
  const server = createServer(async (req, res) => { /* ... */ });
  server.listen(port, () => { console.info(`Metrics server listening on :${port}/metrics`); });
  return server;
}
```
Then add cleanup in the test:
```typescript
let server: http.Server;
afterAll(() => { server?.close(); });

it('GET /metrics returns 200', async () => {
  server = startMetricsServer([], TEST_PORT);
  await new Promise<void>(resolve => server.once('listening', resolve));
  // ...
});
```
Using the `'listening'` event eliminates the arbitrary 100ms delay.

---

## Info

### IN-01: `console.info` used in production code instead of project logger

**File:** `apps/crawler/src/metrics/metricsServer.ts:35`
**Issue:** The metrics server startup message uses `console.info(...)`. All other crawler modules use the `winston` logger imported from `./logger.js`. Using `console` bypasses the structured logging pipeline (JSON format, log levels, timestamps) established by winston.
**Fix:**
```typescript
import { logger } from '../logger.js';
// ...
server.listen(port, () => {
  logger.info('Metrics server listening', { port, path: '/metrics' });
});
```

---

### IN-02: Grafana dashboard datasource UID uses hardcoded `"-- Default --"` sentinel

**File:** `monitoring/grafana/dashboards/api.json:14,27,40`, `monitoring/grafana/dashboards/crawler.json:14,27,41`
**Issue:** All dashboard panels reference the datasource using `"uid": "-- Default --"`. This works when there is exactly one Prometheus datasource configured as default, but is a fragile convention that can silently break if Grafana provisioning changes or a second datasource is added. Grafana documentation recommends using the actual provisioned UID.
**Fix:** Set a stable UID in the datasource provisioning and reference it explicitly:
```yaml
# prometheus.yml datasource provisioning:
uid: prometheus-main
```
```json
// In dashboard JSON:
"datasource": { "type": "prometheus", "uid": "prometheus-main" }
```

---

### IN-03: Grafana dashboard provider has `disableDeletion: false` and `allowUiUpdates: true`

**File:** `monitoring/grafana/provisioning/dashboards/provider.yml:8,10`
**Issue:** `disableDeletion: false` allows dashboards provisioned from files to be deleted via the Grafana UI, and `allowUiUpdates: true` allows UI edits that will be lost on next container restart (because the source of truth is the file). This can lead to confusion — an operator edits a dashboard via UI, the changes look saved, then a container restart wipes them.
**Fix:** For a file-provisioned, version-controlled dashboard setup, set:
```yaml
disableDeletion: true
allowUiUpdates: false
```
This enforces that all dashboard changes go through the JSON files in version control, which is the intended workflow.

---

_Reviewed: 2026-05-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
