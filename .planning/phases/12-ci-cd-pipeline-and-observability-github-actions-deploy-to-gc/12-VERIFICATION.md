---
phase: 12-ci-cd-pipeline-and-observability-github-actions-deploy-to-gc
verified: 2026-05-26T09:42:00Z
status: human_needed
score: 14/14 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Trigger a push to main branch and confirm GitHub Actions workflow runs both build-and-push matrix jobs (crawler + api) and the deploy job in sequence"
    expected: "Workflow succeeds: both Docker images pushed to asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler/{crawler,api}:{sha} and GCE VM restarts crawler+api with new IMAGE_TAG"
    why_human: "Cannot verify GitHub Actions execution, WIF token exchange, Artifact Registry push, or SSH VM connectivity from a static codebase scan"
  - test: "Visit https://webcrawler-myst.duckdns.org/grafana/ after starting the monitoring stack on the GCE VM"
    expected: "nginx prompts for basic auth (.htpasswd), then Grafana login appears; 'Crawler Overview' and 'API Overview' dashboards are visible under Dashboards -> Web Crawler folder with panels loading data from Prometheus"
    why_human: "Grafana UI behavior, nginx basic auth gate, and Prometheus scrape connectivity require the live GCE VM deployment"
  - test: "On the GCE VM, check docker exec webcrawler-prometheus-1 wget -qO- http://localhost:9090/api/v1/targets | python3 -m json.tool | grep state"
    expected: "All 3 targets (prometheus, crawler, api) show state: up — confirming Prometheus is actively scraping /metrics from each service"
    why_human: "Prometheus scrape target health requires live containers with running metrics endpoints; cannot confirm scrape connectivity from code alone"
---

# Phase 12: CI/CD Pipeline and Observability — Verification Report

**Phase Goal:** Automated CI/CD pipeline (GitHub Actions -> GCP Artifact Registry -> GCE VM) with observability stack (Prometheus + Grafana dashboards).
**Verified:** 2026-05-26T09:42:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

All static code artifacts are fully implemented and wired. The phase goal is blocked only by human verification of the live execution path (GitHub Actions run, Prometheus scrape connectivity, and Grafana UI).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GCP setup documentation exists with all gcloud commands for project-c67469b2-5925-4167-b6a | VERIFIED | `docs/deployment/artifact-registry-setup.md` — 27 occurrences of project ID; 8 steps from API enable through smoke test |
| 2 | `.github/secrets.md` documents all 7 required GitHub Secrets | VERIFIED | File lists GCP_PROJECT_ID, GCP_WORKLOAD_IDENTITY_PROVIDER, GCP_SERVICE_ACCOUNT, GCE_SSH_PRIVATE_KEY, GCE_SSH_HOST, GCE_SSH_USER, GCE_SSH_KNOWN_HOSTS with descriptions; gitignored via `/.github/secrets.md` |
| 3 | `.github/workflows/deploy.yml` has build-and-push job with matrix strategy for crawler and api | VERIFIED | YAML validates; `jobs: ['build-and-push', 'deploy']`; matrix has 2 entries; triggers on push+workflow_dispatch |
| 4 | WIF auth uses google-github-actions/auth@v3 with id-token: write permission | VERIFIED | `id-token: write` in job permissions; `uses: google-github-actions/auth@v3` with `token_format: access_token` |
| 5 | Images tagged with github.sha and latest; registry cache with mode=max | VERIFIED | Tags contain `${{ github.sha }}` and `latest`; `cache-to: type=registry,...,mode=max` |
| 6 | docker-compose.prod.yml crawler and api use image: not build: | VERIFIED | `grep -c "build:" docker-compose.prod.yml` returns 0; both services use `asia-southeast1-docker.pkg.dev/.../${IMAGE_TAG:-latest}` |
| 7 | deploy job SSHes to GCE and runs sed + docker compose pull + up --no-deps | VERIFIED | `appleboy/ssh-action@v1.2.5`; `sed -i "s\|^IMAGE_TAG=.*\|IMAGE_TAG=${IMAGE_TAG}\|"`; `pull crawler api`; `up -d --no-deps crawler api` |
| 8 | Crawler exposes /metrics on port 9464 serving Prometheus format | VERIFIED | `apps/crawler/src/metrics/metricsServer.ts` — `http.createServer` on port 9464; returns `register.contentType`; aggregates prom-client default metrics + BullMQ queue metrics |
| 9 | crawl_duration_seconds histogram + all 6 workers instrumented | VERIFIED | `crawlMetrics.ts` exports `crawlDurationHistogram` (8 buckets); `index.ts` calls `instrumentWorker(worker, name)` 6 times (lines 47-52) + `startMetricsServer([6 queues])` |
| 10 | .NET API exposes GET /metrics with UseHttpMetrics + MapMetrics | VERIFIED | `Program.cs` has `using Prometheus;`, `app.UseRouting()`, `app.UseHttpMetrics(ReduceStatusCodeCardinality)`, `app.MapMetrics()`; `WebCrawlerApi.csproj` has `prometheus-net.AspNetCore Version="8.2.1"` |
| 11 | Tests exist: 6 Vitest (metricsServer+crawlMetrics) and 3 xUnit (MetricsEndpointTests) | VERIFIED | All 4 test files exist with substantive describe/it/[Fact] blocks; MetricsEndpointTests.cs has 3 [Fact] tests |
| 12 | monitoring/ directory with prometheus.yml (crawler:9464, api:5000/metrics) and Grafana provisioning | VERIFIED | `prometheus.yml` — 3 scrape targets (prometheus, crawler:9464, api:5000); datasource points to `http://prometheus:9090 isDefault: true`; dashboards provider points to `/var/lib/grafana/dashboards` |
| 13 | Grafana dashboard JSONs with 3+ panels each containing bullmq_job_count and http_requests_received_total | VERIFIED | `crawler.json` — 3 panels, includes `bullmq_job_count` target; `api.json` — 3 panels, includes `http_requests_received_total` target |
| 14 | nginx.conf has /grafana/ and /grafana/api/live/ location blocks using $grafana_connection_upgrade; SignalR map unchanged | VERIFIED | Lines 63-85: both location blocks present with `proxy_pass http://grafana:3000`; map block at line 36 uses `$grafana_connection_upgrade`; original `map $http_connection $connection_upgrade` at line 29 is intact |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docs/deployment/artifact-registry-setup.md` | gcloud runbook with all 8 steps | VERIFIED | 27 occurrences of project ID; SSH key generation included |
| `.github/secrets.md` | 7 GitHub Secrets listed | VERIFIED | All 7 secrets with descriptions; gitignored |
| `.github/workflows/deploy.yml` | CI/CD workflow with both jobs | VERIFIED | Valid YAML; build-and-push + deploy; matrix strategy; WIF auth |
| `docker-compose.prod.yml` | image: refs for crawler+api; prometheus+grafana services | VERIFIED | No build: directives; both use Artifact Registry image paths; prometheus (256M) and grafana (128M) services added |
| `apps/crawler/src/metrics/metricsServer.ts` | HTTP server on port 9464 | VERIFIED | Exports `startMetricsServer`; aggregates prom-client + BullMQ metrics |
| `apps/crawler/src/metrics/crawlMetrics.ts` | Histogram + instrumentWorker | VERIFIED | Exports `crawlDurationHistogram` and `instrumentWorker` |
| `apps/crawler/src/metrics/metricsServer.test.ts` | Vitest tests | VERIFIED | 3 it() blocks testing status 200, Content-Type, and Prometheus format |
| `apps/crawler/src/metrics/crawlMetrics.test.ts` | Vitest tests | VERIFIED | 3 it() blocks testing histogram existence, listener registration, observe call |
| `apps/api.Tests/Endpoints/MetricsEndpointTests.cs` | xUnit integration tests | VERIFIED | 3 [Fact] tests for 200, text/plain, and http_requests_received_total |
| `monitoring/prometheus/prometheus.yml` | Scrape config (15s, 3 targets) | VERIFIED | crawler:9464, api:5000/metrics, localhost:9090 |
| `monitoring/grafana/provisioning/datasources/prometheus.yml` | Grafana datasource | VERIFIED | Points to http://prometheus:9090; isDefault: true |
| `monitoring/grafana/provisioning/dashboards/provider.yml` | Dashboard file provider | VERIFIED | Path /var/lib/grafana/dashboards |
| `monitoring/grafana/dashboards/crawler.json` | BullMQ + crawl latency dashboard | VERIFIED | 3 panels; bullmq_job_count + crawl duration histogram queries |
| `monitoring/grafana/dashboards/api.json` | .NET API HTTP metrics dashboard | VERIFIED | 3 panels; http_requests_received_total + http_request_duration + dotnet_total_memory_bytes |
| `nginx/nginx.conf` | Grafana location blocks + new map | VERIFIED | /grafana/ and /grafana/api/live/ blocks; $grafana_connection_upgrade variable |
| `docs/deployment/grafana-setup.md` | Operational runbook | VERIFIED | Documents .htpasswd creation, GRAFANA_ADMIN_PASSWORD, access URL, Prometheus target check |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `docs/deployment/artifact-registry-setup.md` | `.github/secrets.md` | WIF pool output feeds GCP_WORKLOAD_IDENTITY_PROVIDER | WIRED | Setup guide documents exact format `projects/NUMBER/.../workloadIdentityPools/github-pool/providers/github-provider`; secrets.md references Step 6 output |
| `.github/workflows/deploy.yml` | Artifact Registry | `docker/build-push-action` tags field | WIRED | Tags contain `asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/webcrawler/...` |
| `.github/workflows/deploy.yml deploy job` | `docker-compose.prod.yml IMAGE_TAG` | `sed -i` updates IMAGE_TAG in .env.prod | WIRED | `sed -i "s\|^IMAGE_TAG=.*\|IMAGE_TAG=${IMAGE_TAG}\|" .env.prod` present |
| `apps/crawler/src/index.ts` | `metricsServer.ts` | `startMetricsServer(queues)` at startup | WIRED | Lines 12,42-45: import + call with all 6 queues |
| `apps/crawler/src/index.ts` | `crawlMetrics.ts` | `instrumentWorker(worker, name)` for each worker | WIRED | Lines 13,47-52: import + 6 calls (one per worker) |
| `apps/api/Program.cs` | `prometheus-net.AspNetCore` | `app.UseHttpMetrics() + app.MapMetrics()` | WIRED | Line 104-133: UseRouting, UseHttpMetrics, MapMetrics all present in correct order |
| `monitoring/prometheus/prometheus.yml` | `docker-compose.prod.yml prometheus service` | Volume mount `./monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro` | WIRED | Volume mount confirmed in docker-compose.prod.yml line 116 |
| `monitoring/grafana/provisioning` | `docker-compose.prod.yml grafana service` | Volume mount `./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro` | WIRED | Volume mount confirmed in docker-compose.prod.yml line 149 |
| `nginx/nginx.conf /grafana/` | grafana service | `proxy_pass http://grafana:3000` | WIRED | 2 proxy_pass directives to grafana:3000 in location blocks |

### Data-Flow Trace (Level 4)

This phase produces no components rendering dynamic data to users — it is infrastructure configuration (YAML, docs, CI workflow, metrics instrumentation). Data-flow tracing for UI components is not applicable. The metrics data-flow was verified structurally: prom-client collects from BullMQ queues and Node.js process; prometheus-net collects from ASP.NET Core middleware; Prometheus scrapes both; Grafana reads from Prometheus. Live scrape connectivity is in the human verification section.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| deploy.yml YAML valid | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"` | Valid (no error) | PASS |
| deploy.yml has 2 jobs | `python3 -c "... list(d['jobs'].keys())"` | `['build-and-push', 'deploy']` | PASS |
| deploy.yml triggers | push + workflow_dispatch parsed | `['push', 'workflow_dispatch']` | PASS |
| docker-compose validates | `IMAGE_TAG=test GRAFANA_ADMIN_PASSWORD=test docker compose -f docker-compose.prod.yml config --quiet` | 0 errors | PASS |
| crawler metrics exports | Node.js readFile check on metricsServer.ts + crawlMetrics.ts | All 3 exports present | PASS |
| prometheus.yml valid YAML | `python3 -c "import yaml; yaml.safe_load(...)"` | Valid | PASS |
| Grafana JSONs valid | `python3 -c "import json; json.load(...)"` for both dashboards | Valid; 3 panels each | PASS |
| GitHub Actions live run | Cannot test without triggering push | N/A | SKIP (human) |
| Prometheus scraping targets | Requires live GCE VM | N/A | SKIP (human) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CICD-01 | 12-01 | GCP Artifact Registry + WIF setup documentation | SATISFIED | `docs/deployment/artifact-registry-setup.md` + `.github/secrets.md` both exist with all required content |
| CICD-02 | 12-02 | GitHub Actions build-and-push workflow | SATISFIED | `.github/workflows/deploy.yml` build-and-push job with matrix, WIF auth, registry cache |
| CICD-03 | 12-03 | Deploy job + docker-compose image: migration | SATISFIED | deploy job with appleboy/ssh-action; docker-compose.prod.yml uses image: for crawler+api |
| OBS-01 | 12-04 | Prometheus metrics endpoints in crawler and API | SATISFIED | `metricsServer.ts` on port 9464; `Program.cs` MapMetrics; both wired and tested |
| OBS-02 | 12-05 | Prometheus + Grafana observability stack | SATISFIED | monitoring/ directory, docker-compose services, nginx /grafana/ proxy, .htpasswd gitignored |

**Note on Requirements Coverage in REQUIREMENTS.md:** CICD-01 through OBS-02 are not defined in `.planning/REQUIREMENTS.md` — they appear only in `ROADMAP.md` Phase 12 requirements field and in individual plan frontmatter. The REQUIREMENTS.md v1/v2 list pre-dates Phase 12 and was not updated to include CI/CD and observability IDs. This is an administrative gap in the requirements document — not a code gap. All 5 requirement IDs are fully accounted for by the plans and verified in the codebase.

### Anti-Patterns Found

No anti-patterns found in the key phase files. Scanned: `metricsServer.ts`, `crawlMetrics.ts`, `Program.cs`, `deploy.yml`, `docker-compose.prod.yml`. No TODO/FIXME/placeholder comments, no empty implementations, no return null/return {} patterns in production paths.

### Human Verification Required

#### 1. GitHub Actions End-to-End Run

**Test:** Push a commit to the `main` branch (or trigger workflow_dispatch from the Actions tab)
**Expected:** The "Build, Push, Deploy" workflow starts; build-and-push matrix runs crawler and api jobs in parallel; both Docker images are pushed to `asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler/{crawler,api}:{sha}`; the deploy job then SSHes to the GCE VM, updates IMAGE_TAG in `.env.prod`, pulls new images, restarts crawler and api, and the API healthcheck at `http://localhost:5000/health` returns 200 within 90 seconds
**Why human:** GitHub Actions execution, WIF OIDC token exchange with GCP, Artifact Registry push, and SSH connectivity to the GCE VM cannot be verified from static code analysis. The GitHub Secrets must also be configured in the repository settings before the first run.

#### 2. Grafana Dashboard Access

**Test:** After starting `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d prometheus grafana` on the GCE VM (with `.htpasswd` and `GRAFANA_ADMIN_PASSWORD` in place per `docs/deployment/grafana-setup.md`), visit `https://webcrawler-myst.duckdns.org/grafana/`
**Expected:** nginx prompts for HTTP basic auth; after entering `.htpasswd` credentials, the Grafana login page appears; after logging in, navigate to Dashboards -> Web Crawler folder; both "Crawler Overview" and "API Overview" dashboards load with panels rendering data (or "No data" if services are not actively crawling — but the panel structure and Prometheus datasource connection should work)
**Why human:** Grafana UI rendering, nginx basic auth behavior, and subpath routing (`GF_SERVER_SERVE_FROM_SUB_PATH: "true"`) require the live deployed environment

#### 3. Prometheus Scrape Target Health

**Test:** On the GCE VM: `docker exec webcrawler-prometheus-1 wget -qO- http://localhost:9090/api/v1/targets | python3 -m json.tool | grep state`
**Expected:** All 3 scrape targets show `"state": "up"` — confirming Prometheus can reach crawler:9464, api:5000/metrics, and itself at localhost:9090
**Why human:** Prometheus scrape connectivity depends on all services running in the same Docker network on the GCE VM; cannot simulate Docker inter-service DNS resolution or verify that metrics endpoints are reachable from the Prometheus container

### Gaps Summary

No gaps. All 14 must-have truths are satisfied by the codebase. The `human_needed` status reflects that 3 items require live execution verification that cannot be performed through static code analysis — not that anything is missing or broken in the implementation.

---

_Verified: 2026-05-26T09:42:00Z_
_Verifier: Claude (gsd-verifier)_
