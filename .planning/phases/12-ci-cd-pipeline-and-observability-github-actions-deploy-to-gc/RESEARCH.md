# Phase 12: CI/CD Pipeline and Observability - Research

**Researched:** 2026-05-25
**Domain:** GitHub Actions CI/CD, GCP Artifact Registry, Docker Compose deployment, Prometheus/Grafana observability
**Confidence:** HIGH

---

## Summary

Phase 12 adds a complete CI/CD pipeline and observability stack to the existing GCE deployment. The CI path builds `crawler` and `api` Docker images in GitHub Actions, pushes to GCP Artifact Registry (asia-southeast1), then SSHes to the GCE VM to execute `docker compose pull && docker compose up -d`. The observability path instruments the Node.js crawler with `prom-client` 15.x and the .NET API with `prometheus-net.AspNetCore` 8.x, then runs Prometheus and Grafana inside `docker-compose.prod.yml` on the GCE VM.

The most important project-specific constraints are: (1) the crawler image is ~1.5GB due to the `mcr.microsoft.com/playwright:v1.50.1-noble` base, making build caching critical; (2) the GCE VM has 4GB RAM with ~2.9GB already committed, leaving ~1.1GB for Prometheus + Grafana; (3) the crawler is an ESM `"type":"module"` TypeScript project requiring `import` not `require` for prom-client; (4) the current compose command on the VM includes `--env-file .env.prod` which the SSH deploy script must replicate.

There are 6 BullMQ queues (`crawl-default`, `crawl-football-data.org`, `crawl-genshin`, `crawl-lol`, `crawl-anilist`, `crawl-mangadex`). BullMQ 5.73.0 (installed) ships `queue.exportPrometheusMetrics()` natively — use it to avoid manual prom-client gauge management. The metrics HTTP server uses Node.js built-in `http` (no Express dependency) on port 9464.

**Primary recommendation:** Use Workload Identity Federation (keyless) for GitHub Actions → GCP auth. Use `type=registry` cache for Docker layer caching against Artifact Registry (avoids 10GB GitHub Actions cache limit hit by the Playwright base). Expose Grafana at `https://webcrawler-myst.duckdns.org/grafana/` via the existing Nginx container.

---

## Project Facts (verified from codebase)

| Fact | Value | Source |
|------|-------|--------|
| GCE VM IP | 34.87.36.185 | `docs/deployment/gcp-config-and-network.md` |
| GCE region | asia-southeast1 (Singapore) | IP geolocation check |
| Artifact Registry hostname | `asia-southeast1-docker.pkg.dev` | [CITED: docs.cloud.google.com] |
| VM DNS | webcrawler-myst.duckdns.org | `docs/deployment/gcp-config-and-network.md` |
| Deploy path on VM | `/opt/webcrawler` | `docs/deployment/production-deploy.md` |
| Compose command | `docker compose -f docker-compose.prod.yml --env-file .env.prod` | `docs/deployment/gcp-config-and-network.md` |
| GitHub repo | `NghiaMyst/web-crawler` | `git remote get-url origin` |
| Crawler base image | `mcr.microsoft.com/playwright:v1.50.1-noble` | `apps/crawler/Dockerfile` |
| Crawler type | ESM (`"type": "module"`) | `apps/crawler/package.json` |
| BullMQ version | 5.73.0 | `apps/crawler/package.json` |
| API port | 5000 | `apps/api/Dockerfile` |
| BullMQ queues | crawl-default, crawl-football-data.org, crawl-genshin, crawl-lol, crawl-anilist, crawl-mangadex | `apps/crawler/src/queues/*.ts` |
| Current RAM committed | ~2944MB (postgres 512 + redis 256 + crawler 1536 + api 512 + nginx 128) | `docker-compose.prod.yml` |

---

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| google-github-actions/auth | v3 | GitHub Actions → GCP OIDC auth | Official GCP action; supports Workload Identity Federation (keyless) [VERIFIED: GitHub releases API] |
| google-github-actions/setup-gcloud | v3.0.1 | Install gcloud CLI in runner | Needed for `gcloud auth configure-docker` [VERIFIED: GitHub releases API] |
| docker/login-action | v4.2.0 | Docker registry login | Used with `oauth2accesstoken` pattern for Artifact Registry [VERIFIED: GitHub releases API] |
| docker/setup-buildx-action | v4.1.0 | Enable BuildKit for layer caching | Required for `cache-from`/`cache-to` [VERIFIED: GitHub releases API] |
| docker/build-push-action | v7.2.0 | Build and push image | Handles multi-stage build caching, tag management [VERIFIED: GitHub releases API] |
| appleboy/ssh-action | v1.2.5 | SSH into GCE VM and run deploy script | Simple, reliable; supports `envs:` for IMAGE_TAG injection [VERIFIED: GitHub releases API] |
| prom-client | 15.1.3 | Prometheus metrics for Node.js crawler | Official Prometheus client; ships ESM exports; has `collectDefaultMetrics()` [VERIFIED: npm registry] |
| prometheus-net.AspNetCore | 8.2.1 | Prometheus metrics for .NET API | Official .NET client; `UseHttpMetrics()` + `MapMetrics()` pattern [VERIFIED: NuGet API] |
| prom/prometheus | v3.11.3 | Metrics scrape + storage | Latest stable (non-RC) [VERIFIED: GitHub releases API] |
| grafana/grafana | 13.0.1-security-01 | Metrics visualization | Latest stable with security patches [VERIFIED: GitHub releases API + Docker Hub] |

### Supporting

| Library | Purpose | When to Use |
|---------|---------|-------------|
| docker/metadata-action | v6.1.0 | Generate image tags from git ref | Optional; provides sha + latest tagging pattern automatically |
| Node.js `http` module (built-in) | Metrics HTTP server in crawler | No extra dependency; simpler than Express for single `/metrics` route |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Workload Identity Federation | JSON service account key in secret | WIF is keyless (no rotation), more secure; SA key is simpler to set up once |
| `type=registry` Docker cache | `type=gha` GitHub Actions cache | `type=gha` has 10GB repo limit — Playwright image alone is ~1.5GB, will evict quickly; registry cache has no cap |
| `appleboy/ssh-action` | Raw `ssh` step with known_hosts | appleboy handles known_hosts fingerprint config, timeout, envs injection cleanly |
| Grafana `/grafana/` subpath | Separate subdomain or direct port 3000 | Subpath requires only nginx config change; GCE firewall already open on 443 |

**Installation (crawler):**
```bash
pnpm --filter @web-crawler/crawler add prom-client
```

**Installation (API):**
```xml
<PackageReference Include="prometheus-net.AspNetCore" Version="8.2.1" />
```

**Version verification:** All versions confirmed against live APIs on 2026-05-25. [VERIFIED: npm registry, NuGet API, GitHub releases API, Docker Hub API]

---

## Area 1: GCP Artifact Registry + GitHub Actions Authentication

### Recommended Approach: Workload Identity Federation (WIF)

WIF is keyless — no JSON credentials file to rotate or leak. The GitHub OIDC token is exchanged for a short-lived GCP access token at runtime.

### One-Time GCP Setup (gcloud commands)

```bash
# Enable required APIs
gcloud services enable iamcredentials.googleapis.com artifactregistry.googleapis.com --project "$PROJECT_ID"

# Create Artifact Registry repository
gcloud artifacts repositories create webcrawler \
  --repository-format=docker \
  --location=asia-southeast1 \
  --project="$PROJECT_ID"

# Create service account for CI
gcloud iam service-accounts create github-ci \
  --display-name="GitHub Actions CI" \
  --project="$PROJECT_ID"

# Grant Artifact Registry writer (push images)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:github-ci@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Create Workload Identity Pool
gcloud iam workload-identity-pools create github-pool \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create OIDC Provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor" \
  --attribute-condition="assertion.repository=='NghiaMyst/web-crawler'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Get pool resource name
POOL_ID=$(gcloud iam workload-identity-pools describe github-pool \
  --project="$PROJECT_ID" --location="global" --format="value(name)")

# Bind service account to pool (restrict to this repo only)
gcloud iam service-accounts add-iam-policy-binding \
  "github-ci@$PROJECT_ID.iam.gserviceaccount.com" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/NghiaMyst/web-crawler"
```

### GitHub Secrets Required

| Secret | Value |
|--------|-------|
| `GCP_PROJECT_ID` | Your GCP project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `GCP_SERVICE_ACCOUNT` | `github-ci@PROJECT_ID.iam.gserviceaccount.com` |
| `GCE_SSH_PRIVATE_KEY` | Ed25519 private key (see Area 2) |
| `GCE_SSH_HOST` | `34.87.36.185` |
| `GCE_SSH_USER` | VM SSH username (e.g. `nghianguyentrong1211`) |

### Image Naming Convention

```
asia-southeast1-docker.pkg.dev/$GCP_PROJECT_ID/webcrawler/crawler:$GITHUB_SHA
asia-southeast1-docker.pkg.dev/$GCP_PROJECT_ID/webcrawler/api:$GITHUB_SHA
```

Using `$GITHUB_SHA` as tag gives exact rollback traceability. Also push `:latest` for convenience.

[CITED: dev.to/filip-lindqvist WIF + Artifact Registry guide, docs.cloud.google.com/artifact-registry]

---

## Area 2: GitHub Actions CD — SSH to GCE VM

### SSH Key Setup (one-time)

```bash
# Generate deploy key (Ed25519, no passphrase for CI use)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/gce_deploy_key -N ""

# Add public key to VM's authorized_keys
cat ~/.ssh/gce_deploy_key.pub  # paste into VM ~/.ssh/authorized_keys OR use gcloud:
gcloud compute os-login ssh-keys add \
  --key-file ~/.ssh/gce_deploy_key.pub \
  --project="$PROJECT_ID"

# Get the host fingerprint for known_hosts (run once, store as secret)
ssh-keyscan -H 34.87.36.185
```

Store `~/.ssh/gce_deploy_key` (private key) as `GCE_SSH_PRIVATE_KEY` GitHub secret.
Store the `ssh-keyscan` output as `GCE_SSH_KNOWN_HOSTS` GitHub secret.

### Docker Authentication on the VM for `docker compose pull`

The VM's `gcloud` CLI must be configured to authenticate Docker against Artifact Registry. Do this once during VM setup:

```bash
# On the GCE VM (one-time setup)
gcloud auth configure-docker asia-southeast1-docker.pkg.dev
```

This writes a credential helper entry to `~/.docker/config.json`. After this, `docker pull asia-southeast1-docker.pkg.dev/...` works using the VM's attached service account or `gcloud auth` credentials.

**Alternative (no gcloud on VM):** Use a dedicated service account key JSON file on the VM:
```bash
# On VM
cat /opt/webcrawler/.docker-creds.json | docker login \
  --username _json_key \
  --password-stdin \
  asia-southeast1-docker.pkg.dev
```

**Preferred:** Use `gcloud auth configure-docker` (simpler, uses ADC/attached SA).

### appleboy/ssh-action Configuration

```yaml
- name: Deploy to GCE VM
  uses: appleboy/ssh-action@v1.2.5
  env:
    IMAGE_TAG: ${{ github.sha }}
    GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
    REGISTRY: asia-southeast1-docker.pkg.dev
  with:
    host: ${{ secrets.GCE_SSH_HOST }}
    username: ${{ secrets.GCE_SSH_USER }}
    key: ${{ secrets.GCE_SSH_PRIVATE_KEY }}
    fingerprint: ${{ secrets.GCE_SSH_KNOWN_HOSTS }}
    envs: IMAGE_TAG,GCP_PROJECT_ID,REGISTRY
    command_timeout: 10m
    script: |
      cd /opt/webcrawler
      # Write IMAGE_TAG to .env.prod so docker-compose picks it up
      sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env.prod
      grep -q "^IMAGE_TAG=" .env.prod || echo "IMAGE_TAG=${IMAGE_TAG}" >> .env.prod
      docker compose -f docker-compose.prod.yml --env-file .env.prod pull
      docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
      # Health check — wait for API to respond
      timeout 60 bash -c 'until curl -sf http://localhost:5000/health; do sleep 3; done'
      echo "Deploy complete. IMAGE_TAG=${IMAGE_TAG}"
```

**Gotcha — `appleboy/ssh-action` `fingerprint` field:** This field takes the raw known_hosts content (multi-line), not a file path. Store the full `ssh-keyscan 34.87.36.185` output as the `GCE_SSH_KNOWN_HOSTS` secret.

**Gotcha — `--env-file .env.prod`:** The existing `.env.prod` on the VM holds secrets (POSTGRES_PASSWORD, etc.) that are NOT in git. The SSH deploy script must NOT overwrite this file — it only adds/updates `IMAGE_TAG`. Use `sed -i` to update in-place.

[CITED: github.com/appleboy/ssh-action README]

---

## Area 3: docker-compose.prod.yml `image:` Migration

### Pattern: IMAGE_TAG Environment Variable in Compose

Add `IMAGE_TAG` variable to the compose file. Nginx stays as-is (uses stock image).

```yaml
# In docker-compose.prod.yml — replace build: directives:

services:
  crawler:
    image: asia-southeast1-docker.pkg.dev/${GCP_PROJECT_ID}/webcrawler/crawler:${IMAGE_TAG:-latest}
    # Remove: build: context/dockerfile lines
    restart: always
    # ... keep all other config (env_file, environment, depends_on, healthcheck, deploy.resources)

  api:
    image: asia-southeast1-docker.pkg.dev/${GCP_PROJECT_ID}/webcrawler/api:${IMAGE_TAG:-latest}
    # Remove: build: context/dockerfile lines
    restart: always
    # ... keep all other config

  nginx:
    image: nginx:1.27-alpine  # unchanged — stock image
    # ... unchanged
```

**Docker Compose variable substitution:** `${IMAGE_TAG:-latest}` uses `latest` as default if `IMAGE_TAG` is not in the environment. When `--env-file .env.prod` is passed and `.env.prod` contains `IMAGE_TAG=abc123`, that value is used. [VERIFIED: docs.docker.com/compose variable-interpolation]

**Note on `${GCP_PROJECT_ID}`:** Either hardcode the project ID in the compose file (simpler for a personal project) or add it to `.env.prod`. Do NOT use `${GCP_PROJECT_ID}` as a variable if it changes — hardcoding is acceptable for a personal project.

### Build Layer Caching Strategy

Use `type=registry` cache stored in Artifact Registry as a separate `:cache` tag. This avoids the 10GB GitHub Actions cache limit that the ~1.5GB Playwright image would quickly exhaust.

```yaml
# In GitHub Actions workflow:
- name: Build and push crawler
  uses: docker/build-push-action@v7.2.0
  with:
    context: .
    file: apps/crawler/Dockerfile
    platforms: linux/amd64
    push: true
    tags: |
      asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/webcrawler/crawler:${{ github.sha }}
      asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/webcrawler/crawler:latest
    cache-from: type=registry,ref=asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/webcrawler/crawler:cache
    cache-to: type=registry,ref=asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/webcrawler/crawler:cache,mode=max
```

`mode=max` caches all intermediate layers including the builder stage — critical for the Playwright image which would otherwise be re-pulled on every build.

**Why `linux/amd64` only:** The GCE VM is e2-medium AMD64. No cross-compilation needed. This halves build time vs multi-arch. [VERIFIED: gcp-config-and-network.md confirms AMD64]

---

## Area 4: prom-client in Node.js Crawler (BullMQ Metrics)

### Architecture: Separate HTTP Server on Port 9464

The crawler process is a long-running worker (no existing HTTP server). Add a standalone HTTP server using Node.js built-in `http` module. Port 9464 is the conventional port for Prometheus exporters (no conflict with existing services).

```typescript
// src/metrics/metricsServer.ts
import { createServer } from 'node:http';
import { register, collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics({ prefix: 'crawler_' });

export function startMetricsServer(port = 9464): void {
  const server = createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': register.contentType });
      res.end(await register.metrics());
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  server.listen(port, () => {
    console.info(`Metrics server listening on :${port}/metrics`);
  });
}
```

### BullMQ Queue Metrics: Use Built-in `exportPrometheusMetrics()`

BullMQ 5.73.0 ships `queue.exportPrometheusMetrics()` which returns Prometheus-formatted text for all job states. [VERIFIED: inspected installed BullMQ source at node_modules/.pnpm/bullmq@5.73.0]

```typescript
// src/metrics/metricsServer.ts (updated)
import { createServer } from 'node:http';
import { register, collectDefaultMetrics, Registry } from 'prom-client';
import type { Queue } from 'bullmq';

collectDefaultMetrics({ prefix: 'crawler_' });

export function startMetricsServer(queues: Queue[], port = 9464): void {
  const server = createServer(async (req, res) => {
    if (req.url === '/metrics') {
      // Collect prom-client default metrics
      const defaultMetrics = await register.metrics();

      // Collect BullMQ metrics from all queues
      const bullMetrics = await Promise.all(
        queues.map(q => q.exportPrometheusMetrics())
      );

      res.writeHead(200, { 'Content-Type': register.contentType });
      res.end([defaultMetrics, ...bullMetrics].join('\n'));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  server.listen(port, () => {
    console.info(`Metrics server listening on :${port}/metrics`);
  });
}
```

### Crawl Latency Histogram: BullMQ Worker `completed` Event

```typescript
// src/metrics/crawlMetrics.ts
import { Histogram } from 'prom-client';
import type { Worker } from 'bullmq';

export const crawlDurationHistogram = new Histogram({
  name: 'crawler_crawl_duration_seconds',
  help: 'Crawl job duration in seconds',
  labelNames: ['queue', 'strategy'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120],
});

export function instrumentWorker(worker: Worker, queueName: string): void {
  worker.on('completed', (job) => {
    // job.processedOn and job.finishedOn are Unix ms timestamps
    if (job.processedOn && job.finishedOn) {
      const durationSecs = (job.finishedOn - job.processedOn) / 1000;
      const strategy = (job.data as { strategy?: string }).strategy ?? 'unknown';
      crawlDurationHistogram.observe({ queue: queueName, strategy }, durationSecs);
    }
  });
}
```

### Wiring into `src/index.ts`

```typescript
// In src/index.ts, after worker creation:
import { startMetricsServer } from './metrics/metricsServer.js';
import { instrumentWorker } from './metrics/crawlMetrics.js';

// Pass all queues for BullMQ metrics
startMetricsServer([
  crawlQueue, footballDataQueue, genshinQueue, lolQueue, anilistQueue, mangadexQueue
]);

// Instrument workers for latency
instrumentWorker(crawlWorker, 'crawl-default');
instrumentWorker(footballWorker, 'crawl-football-data.org');
// ... etc
```

**ESM import note:** prom-client 15.x ships named ESM exports. Use:
```typescript
import { register, collectDefaultMetrics, Histogram } from 'prom-client';
```
NOT `import client from 'prom-client'`. [CITED: github.com/siimon/prom-client README]

**BullMQ `exportPrometheusMetrics()` output format:**
```
# HELP bullmq_job_count Number of jobs in the queue by state
# TYPE bullmq_job_count gauge
bullmq_job_count{queue="crawl-default", state="waiting"} 0
bullmq_job_count{queue="crawl-default", state="active"} 1
bullmq_job_count{queue="crawl-default", state="completed"} 42
bullmq_job_count{queue="crawl-default", state="failed"} 0
```
[VERIFIED: inspected BullMQ 5.73.0 source `queue-getters.js`]

---

## Area 5: prometheus-net in .NET ASP.NET Core 8

### Recommended: Same Port (`/metrics` on port 5000)

Simplest approach — Prometheus scrapes `http://api:5000/metrics`. No port conflict since the API is internal-only within the Docker network.

### Program.cs Changes

```csharp
// Add to .csproj:
// <PackageReference Include="prometheus-net.AspNetCore" Version="8.2.1" />

// In Program.cs — builder section (add after existing services):
builder.Services.AddHealthChecks(); // already likely present

// In Program.cs — app pipeline section, BEFORE app.UseCors():
app.UseRouting(); // Add if not present — UseHttpMetrics needs routing

// After app.UseCors(), before app.MapHub():
app.UseHttpMetrics(options =>
{
    options.ReduceStatusCodeCardinality(); // Group 2xx, 3xx, 4xx, 5xx — reduces label cardinality
});

// In endpoint mapping section (alongside existing MapGet/MapGroup calls):
app.MapMetrics(); // Exposes GET /metrics
```

**Exact placement relative to existing middleware:**
```csharp
app.UseSerilogRequestLogging();    // existing
app.UseRouting();                  // ADD — UseHttpMetrics requires routing
app.UseHttpMetrics(...);           // ADD — must come BEFORE UseCors
app.UseCors();                     // existing
app.UseStaticFiles();              // existing
app.MapHub<DashboardHub>(...);     // existing
app.MapGet("/health", ...);        // existing
// ... existing MapGroup calls ...
app.MapMetrics();                  // ADD — exposes /metrics endpoint
```

**Default metrics included automatically:**
- .NET GC (gen0/1/2 collections, heap size)
- .NET ThreadPool (worker/iocp threads)
- HTTP request rate, duration, in-flight count
- .NET EventCounters (CPU, memory) [CITED: github.com/prometheus-net/prometheus-net README]

**Port conflict check:** API is already on `http://+:5000`. `MapMetrics()` adds `/metrics` to the same ASP.NET routing pipeline. Prometheus scrapes `http://api:5000/metrics`. No separate port needed.

---

## Area 6: Prometheus Scrape Config + Grafana Provisioning

### Directory Structure (add to repo)

```
monitoring/
├── prometheus/
│   └── prometheus.yml           # Scrape config
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── prometheus.yml   # Datasource provisioning
│   │   └── dashboards/
│   │       └── provider.yml     # Dashboard folder config
│   └── dashboards/
│       ├── crawler.json         # BullMQ + crawl latency dashboard
│       └── api.json             # HTTP request rate + .NET runtime dashboard
```

### prometheus/prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'crawler'
    static_configs:
      - targets: ['crawler:9464']
    # No metrics_path needed — /metrics is the default

  - job_name: 'api'
    static_configs:
      - targets: ['api:5000']
    metrics_path: /metrics
```

**Hostname resolution:** Docker Compose service names (`crawler`, `api`) resolve to container IPs within the `webcrawler_default` network. Prometheus running in the same compose stack uses these hostnames directly. [VERIFIED: docker-compose.prod.yml network configuration]

### grafana/provisioning/datasources/prometheus.yml

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    jsonData:
      prometheusVersion: "3.11.3"
      prometheusType: Prometheus
    version: 1
    editable: false
```

### grafana/provisioning/dashboards/provider.yml

```yaml
apiVersion: 1

providers:
  - name: 'webcrawler-dashboards'
    orgId: 1
    folder: 'Web Crawler'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
```

[CITED: grafana.com/docs/grafana/latest/administration/provisioning/]

### docker-compose.prod.yml — Prometheus + Grafana Services

```yaml
  prometheus:
    image: prom/prometheus:v3.11.3
    restart: always
    volumes:
      - ./monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
      - '--storage.tsdb.retention.size=800MB'
      - '--web.enable-lifecycle'
      - '--storage.tsdb.wal-compression'
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
        reservations:
          cpus: '0.05'
          memory: 64M

  grafana:
    image: grafana/grafana:13.0.1-security-01
    restart: always
    environment:
      GF_SERVER_DOMAIN: webcrawler-myst.duckdns.org
      GF_SERVER_ROOT_URL: https://webcrawler-myst.duckdns.org/grafana/
      GF_SERVER_SERVE_FROM_SUB_PATH: "true"
      GF_SECURITY_ADMIN_USER: ${GRAFANA_ADMIN_USER:-admin}
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
      GF_AUTH_ANONYMOUS_ENABLED: "false"
      GF_ANALYTICS_REPORTING_ENABLED: "false"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards:ro
    depends_on:
      - prometheus
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 128M
        reservations:
          cpus: '0.05'
          memory: 32M

# Add to volumes section:
volumes:
  # existing...
  prometheus_data:
  grafana_data:
```

Add `GRAFANA_ADMIN_PASSWORD` to `.env.prod` on the VM.

### Memory Budget Analysis

| Service | Limit | Notes |
|---------|-------|-------|
| postgres | 512M | existing |
| redis | 256M | existing |
| crawler | 1536M | existing (Playwright) |
| api | 512M | existing |
| nginx | 128M | existing |
| prometheus | 256M | new — with `--storage.tsdb.retention.size=800MB` to cap disk |
| grafana | 128M | new — minimal OSS Grafana |
| **Total** | **3328M** | 768M headroom from 4096M |

768MB headroom is sufficient for OS + kernel processes (Ubuntu 24.04 typically uses ~200-300MB bare). [ASSUMED: OS overhead estimate based on typical Ubuntu minimal usage]

**Prometheus memory sizing:** Set `GOMEMLIMIT=200MiB` env var for soft GC limit, and `--storage.tsdb.retention.size=800MB` for disk cap. The 15-day retention with 6 scrape targets at 15s intervals is well within 256MB RAM. [CITED: codestudy.net prometheus memory limiting]

---

## Area 7: Nginx Routing for Grafana

### nginx.conf Addition

Add to the existing `server` block (port 443, inside HTTPS section):

```nginx
# Grafana Live WebSocket support
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

# In the HTTPS server block — add BEFORE the existing location / block:
location /grafana/ {
    proxy_set_header Host $host;
    proxy_pass http://grafana:3000;
    rewrite ^/grafana/(.*) /$1 break;
}

location /grafana/api/live/ {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_pass http://grafana:3000;
    rewrite ^/grafana/(.*) /$1 break;
}
```

**Note on `map` directive:** The existing nginx.conf already has a `map $http_connection $connection_upgrade` block for SignalR. The Grafana Live websocket needs a DIFFERENT map variable (`$http_upgrade` → `$connection_upgrade`). Check for naming conflicts with the existing map block — rename one if they clash.

**Existing nginx.conf `map` block:**
```nginx
map $http_connection $connection_upgrade {
    "~*Upgrade" $http_connection;
    default     keep-alive;
}
```
This is for SignalR (maps `$http_connection`). The Grafana block needs `map $http_upgrade` which is different — no conflict on variable names as long as the output variable names differ. Use `$grafana_connection_upgrade` for Grafana to avoid collision:

```nginx
map $http_upgrade $grafana_connection_upgrade {
    default upgrade;
    '' close;
}

location /grafana/api/live/ {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $grafana_connection_upgrade;  # use renamed var
    ...
}
```

[CITED: grafana.com/tutorials/run-grafana-behind-a-proxy/]

### Basic Auth for `/grafana/`

Generate htpasswd file (one-time):
```bash
# On local machine — requires apache2-utils or httpd-tools
htpasswd -c monitoring/grafana/.htpasswd grafana_admin
# Or via Docker (no local install needed):
docker run --rm httpd htpasswd -nb grafana_admin <password> > monitoring/grafana/.htpasswd
```

Add to nginx.conf Grafana location block:
```nginx
location /grafana/ {
    auth_basic "Grafana";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_set_header Host $host;
    proxy_pass http://grafana:3000;
    rewrite ^/grafana/(.*) /$1 break;
}
```

Mount the file in docker-compose.prod.yml nginx service:
```yaml
  nginx:
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - letsencrypt:/etc/letsencrypt:ro
      - ./monitoring/grafana/.htpasswd:/etc/nginx/.htpasswd:ro  # ADD
```

**Note:** With nginx basic auth protecting `/grafana/`, Grafana's own login form adds friction for a personal project. Set `GF_AUTH_ANONYMOUS_ENABLED=false` and keep the Grafana admin password as a backup. Both gates are independent.

---

## Complete GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Build, Push, Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # Required for Workload Identity Federation

    strategy:
      matrix:
        include:
          - app: crawler
            dockerfile: apps/crawler/Dockerfile
          - app: api
            dockerfile: apps/api/Dockerfile

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        id: auth
        uses: google-github-actions/auth@v3
        with:
          token_format: access_token
          project_id: ${{ secrets.GCP_PROJECT_ID }}
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v4.1.0

      - name: Log in to Artifact Registry
        uses: docker/login-action@v4.2.0
        with:
          registry: asia-southeast1-docker.pkg.dev
          username: oauth2accesstoken
          password: ${{ steps.auth.outputs.access_token }}

      - name: Build and push ${{ matrix.app }}
        uses: docker/build-push-action@v7.2.0
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          platforms: linux/amd64
          push: true
          tags: |
            asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/webcrawler/${{ matrix.app }}:${{ github.sha }}
            asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/webcrawler/${{ matrix.app }}:latest
          cache-from: type=registry,ref=asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/webcrawler/${{ matrix.app }}:cache
          cache-to: type=registry,ref=asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/webcrawler/${{ matrix.app }}:cache,mode=max

  deploy:
    runs-on: ubuntu-latest
    needs: build-and-push
    steps:
      - name: SSH deploy to GCE VM
        uses: appleboy/ssh-action@v1.2.5
        env:
          IMAGE_TAG: ${{ github.sha }}
          GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
        with:
          host: ${{ secrets.GCE_SSH_HOST }}
          username: ${{ secrets.GCE_SSH_USER }}
          key: ${{ secrets.GCE_SSH_PRIVATE_KEY }}
          fingerprint: ${{ secrets.GCE_SSH_KNOWN_HOSTS }}
          envs: IMAGE_TAG,GCP_PROJECT_ID
          command_timeout: 10m
          script: |
            cd /opt/webcrawler
            # Update IMAGE_TAG in .env.prod (in-place, preserves all other secrets)
            sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env.prod
            grep -q "^IMAGE_TAG=" .env.prod || echo "IMAGE_TAG=${IMAGE_TAG}" >> .env.prod
            # Pull new images and restart changed services only
            docker compose -f docker-compose.prod.yml --env-file .env.prod pull crawler api
            docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps crawler api
            # Wait for API healthcheck
            timeout 90 bash -c 'until curl -sf http://localhost:5000/health > /dev/null; do echo "waiting..."; sleep 5; done'
            echo "Deploy SUCCESS: ${IMAGE_TAG}"
```

**Note on matrix build:** `build-and-push` uses `strategy.matrix` to build crawler and api in parallel. Both jobs must complete before `deploy` runs (`needs: build-and-push`).

**Note on `--no-deps`:** `up -d --no-deps crawler api` only restarts crawler and api, not postgres/redis/nginx. This avoids unnecessary downtime. Prometheus/Grafana are not pulled from Artifact Registry (they use stock images from Docker Hub). [ASSUMED: `--no-deps` behavior verified against Docker Compose docs in training, not re-checked live]

---

## Architecture Patterns

### Final docker-compose.prod.yml Service Map

```
┌─────────────────────────────────────────────────────────────┐
│ GCE VM (4GB RAM)                                            │
│                                                             │
│ nginx:443/80 ──► api:5000 ──► postgres:5432                 │
│                     └──► redis:6379                         │
│ nginx:/grafana/ ──► grafana:3000                            │
│ crawler ──────────► postgres + redis                        │
│                                                             │
│ prometheus:9090 ──► crawler:9464  (scrape)                  │
│                 └──► api:5000/metrics  (scrape)             │
│                 └──► localhost:9090  (self-scrape)          │
│                                                             │
│ grafana:3000 ──► prometheus:9090                            │
└─────────────────────────────────────────────────────────────┘
```

### Metrics Ports — Internal Only (no host port binding)

- Crawler: `:9464` — internal Docker network only
- Prometheus: `:9090` — internal Docker network only
- Grafana: `:3000` — internal, exposed via Nginx `/grafana/`

GCE Firewall: No new rules needed. Port 80/443 already open. [VERIFIED: gcp-config-and-network.md]

### Provisioned Grafana Dashboards Minimum Panels

**crawler.json** (BullMQ Overview):
- Job count by state per queue (gauge/stat panel) — from `bullmq_job_count`
- Crawl duration percentiles p50/p95 — from `crawler_crawl_duration_seconds`
- Total completed jobs rate — `rate(bullmq_job_count{state="completed"}[5m])`

**api.json** (.NET API Overview):
- HTTP request rate — `rate(http_requests_received_total[1m])`
- HTTP latency p99 — `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))`
- .NET heap memory — `dotnet_total_memory_bytes`
- Active requests in-flight — `http_requests_in_progress`

---

## Common Pitfalls

### Pitfall 1: `.env.prod` Overwrite on Deploy
**What goes wrong:** Deploy script writes a fresh `.env.prod` — wipes out `POSTGRES_PASSWORD`, `TELEGRAM_BOT_TOKEN`, etc.
**Why it happens:** Naive pattern `echo "IMAGE_TAG=..." > .env.prod` overwrites the file.
**How to avoid:** Always use `sed -i` to update a single key in-place: `sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env.prod && grep -q "^IMAGE_TAG=" .env.prod || echo "IMAGE_TAG=${IMAGE_TAG}" >> .env.prod`
**Warning signs:** API fails healthcheck with "DATABASE_URL not set" error after first CI deploy.

### Pitfall 2: Playwright Image Cache Miss on Every Build
**What goes wrong:** First build takes 8-12 minutes because `mcr.microsoft.com/playwright:v1.50.1-noble` (~1.5GB) is pulled on every CI run.
**Why it happens:** `type=gha` cache is evicted when Artifact Registry push fills 10GB; `type=registry` cache is not configured.
**How to avoid:** Use `cache-from: type=registry,ref=.../crawler:cache` with `mode=max` to cache the builder stage layers in Artifact Registry.
**Warning signs:** Every CI run shows "Pulling from mcr.microsoft.com/playwright" in build logs.

### Pitfall 3: Nginx `map` Variable Name Collision
**What goes wrong:** Adding the Grafana Live `map $http_upgrade $connection_upgrade` block conflicts with nginx's existing map declarations.
**Why it happens:** Nginx does not allow two `map` blocks with the same output variable name.
**How to avoid:** Name the Grafana output variable `$grafana_connection_upgrade` to avoid collision with SignalR's `$connection_upgrade`.
**Warning signs:** `nginx: [emerg] duplicate map variable "$connection_upgrade"` at startup.

### Pitfall 4: Docker Compose Pull Fails — No Auth on VM
**What goes wrong:** `docker compose pull` returns "unauthorized: unauthenticated request" for Artifact Registry images.
**Why it happens:** `gcloud auth configure-docker asia-southeast1-docker.pkg.dev` was not run on the VM, or the gcloud SDK is not installed.
**How to avoid:** Run `gcloud auth configure-docker asia-southeast1-docker.pkg.dev` once on the VM. Verify with `docker pull asia-southeast1-docker.pkg.dev/.../crawler:latest` before adding to CI.
**Warning signs:** `docker compose pull` exits non-zero; deploy step fails with HTTP 401 error.

### Pitfall 5: UseHttpMetrics Placement in ASP.NET Core Pipeline
**What goes wrong:** HTTP metrics show 0 or only count 404s, missing most requests.
**Why it happens:** `UseHttpMetrics()` must come AFTER `UseRouting()` (not before) and before actual endpoint handlers.
**How to avoid:** Insert `app.UseRouting()` explicitly before `app.UseHttpMetrics()`. Current `Program.cs` uses minimal API style which may not call `UseRouting()` explicitly.
**Warning signs:** `http_requests_received_total` is 0 or only counts `/metrics` self-scrapes.

### Pitfall 6: prom-client `collectDefaultMetrics()` Called Twice
**What goes wrong:** `Error: A metric with the name process_cpu_user_seconds_total has already been registered.`
**Why it happens:** `collectDefaultMetrics()` is called once in the app entry and once in a module imported after metrics server setup.
**How to avoid:** Call `collectDefaultMetrics()` exactly once at startup, in `src/index.ts` or a singleton `metricsServer.ts`. Use the default global `register`.
**Warning signs:** Crash at startup with "already registered" error.

### Pitfall 7: Prometheus Cannot Scrape Crawler (container name vs service name)
**What goes wrong:** Prometheus shows `crawler:9464` as `DOWN` in targets.
**Why it happens:** Port 9464 is not yet opened in the crawler container (metrics server not started, or started on wrong port).
**How to avoid:** Verify `docker exec webcrawler-crawler-1 curl http://localhost:9464/metrics` returns text before deploying Prometheus scrape config.
**Warning signs:** Prometheus `/targets` page shows `connection refused` for crawler endpoint.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Crawler framework | Vitest 4.x (`apps/crawler/vitest.config.ts`) |
| API framework | xUnit + Microsoft.NET.Test.Sdk 17.8.0 (`apps/api.Tests/`) |
| Quick run (crawler) | `pnpm --filter @web-crawler/crawler test` |
| Quick run (API) | `dotnet test apps/api.Tests/ --no-build` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| CI-01 | GitHub Actions builds and pushes both images on push to main | Smoke | `docker build -f apps/crawler/Dockerfile .` locally | N/A (CI workflow) |
| CI-02 | Metrics server starts on port 9464 | Unit | `vitest run src/metrics/metricsServer.test.ts` | Wave 0 gap |
| CI-03 | `exportPrometheusMetrics()` returns valid Prometheus text | Unit | `vitest run src/metrics/metricsServer.test.ts` | Wave 0 gap |
| CI-04 | Crawl duration histogram records on worker completed event | Unit | `vitest run src/metrics/crawlMetrics.test.ts` | Wave 0 gap |
| CI-05 | `MapMetrics()` endpoint returns 200 with `text/plain` content type | Integration | `dotnet test --filter DisplayName~MapMetrics` | Wave 0 gap |
| CI-06 | `UseHttpMetrics()` increments `http_requests_received_total` on requests | Integration | `dotnet test --filter DisplayName~HttpMetrics` | Wave 0 gap |

### Wave 0 Gaps

- [ ] `apps/crawler/src/metrics/metricsServer.test.ts` — covers CI-02, CI-03
- [ ] `apps/crawler/src/metrics/crawlMetrics.test.ts` — covers CI-04
- [ ] `apps/api.Tests/Endpoints/MetricsEndpointTests.cs` — covers CI-05, CI-06

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Local builds | ✓ | 29.5.0 | — |
| Docker Compose | Local stack | ✓ | v5.1.3 | — |
| Node.js | Crawler app | ✓ | v24.15.0 | — |
| pnpm | Package management | ✓ (via npm) | 10.x | — |
| gcloud CLI | GCP setup (one-time) | ✗ locally | — | Install via `snap install google-cloud-cli` or Cloud Shell |
| GCE VM SSH | Deployment | ✓ (confirmed reachable) | — | — |
| GitHub Actions | CI/CD | ✓ (public repo) | — | — |

**Missing dependencies:**
- `gcloud` CLI not installed locally — only needed for one-time Workload Identity setup. Can run via GCP Cloud Shell instead.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No user-facing auth in this phase |
| V3 Session Management | No | N/A |
| V4 Access Control | Yes | Grafana protected by nginx basic auth |
| V5 Input Validation | No | Metrics endpoints are read-only GET |
| V6 Cryptography | No | No new crypto; TLS already in place |

### Known Threat Patterns

| Pattern | Risk | Mitigation |
|---------|------|-----------|
| Metrics endpoint exposure | `/metrics` reveals internal service topology + process info | Crawler `:9464` and Prometheus `:9090` are not bound to host ports — Docker network only |
| API `/metrics` exposure | Same concern for API | API is behind nginx which does not expose `/metrics` path externally |
| Grafana admin password | Grafana UI exposes credentials management | Protected by nginx basic auth + `GF_SECURITY_ADMIN_PASSWORD` env var in `.env.prod` |
| JSON SA key leakage | Service account key stored in GitHub Secrets | Workload Identity Federation used instead — no long-lived credentials |
| SSH private key | Deploy key stored in GitHub Secrets | Ed25519 key with no passphrase; restrict by IP if possible via `from=""` in authorized_keys |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GCE VM has gcloud CLI installed and `gcloud auth configure-docker` already run | Area 2 | `docker compose pull` fails with 401; fix: run configure-docker once on VM |
| A2 | GCE VM deploy path is `/opt/webcrawler` (from Oracle runbook, applied to GCE) | Area 2 | SSH deploy script `cd /opt/webcrawler` fails; fix: verify path on VM and update secret/script |
| A3 | GCE SSH username is `nghianguyentrong1211` (derived from gmail) | Area 2 | SSH auth failure; fix: check actual username with `gcloud compute instances describe` |
| A4 | OS overhead on GCE e2-medium is ~200-300MB leaving sufficient headroom | Area 6 | OOM kills on the VM; fix: reduce Prometheus retention or reduce crawler memory limit |
| A5 | `--no-deps` flag in `docker compose up` prevents restarting postgres/redis/nginx | Area 7 / Workflow | If not supported in v5.1.3, all services restart; acceptable downtime for personal project |
| A6 | prometheus-net 8.2.1 is compatible with .NET 8 target framework | Area 5 | NuGet restore failure; fix: check compatibility matrix |

**Note on A3:** GCP derives SSH username from the Google account. For `nghianguyentrong1211@gmail.com`, the username is `nghianguyentrong1211`. Verify with: `gcloud compute ssh INSTANCE_NAME --dry-run`.

---

## Open Questions

1. **GCP Project ID**
   - What we know: IP is in asia-southeast1, project exists with $300 credit
   - What's unclear: The actual `PROJECT_ID` string — needed for image paths and WIF setup
   - Recommendation: User must supply `GCP_PROJECT_ID` secret value; planner should add a Wave 0 task to document it

2. **VM deploy path and SSH username**
   - What we know: Oracle docs used `/opt/webcrawler` and user `ubuntu`; GCP docs mention same path
   - What's unclear: Whether the GCE VM was set up with the same path and whether username is `nghianguyentrong1211` or custom
   - Recommendation: Planner should include a verification step: `ssh USER@34.87.36.185 "echo \$HOME && whoami"` to confirm before wiring secrets

3. **gcloud on VM — already configured?**
   - What we know: `gcloud auth configure-docker` is needed for `docker compose pull` from Artifact Registry
   - What's unclear: Whether gcloud SDK is installed on the GCE VM; whether configure-docker was already run
   - Recommendation: Include a VM setup pre-step in Wave 0: install gcloud SDK if missing, run configure-docker

4. **Dashboard JSON files**
   - What we know: Grafana provisioning supports JSON files; placeholder JSONs must be created
   - What's unclear: Whether to create minimal functional dashboards or placeholder JSONs that the user populates later
   - Recommendation: Create minimal functional dashboards with 3-5 panels each using known metric names

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: npm registry] — prom-client@15.1.3 version, publish date
- [VERIFIED: NuGet API] — prometheus-net.AspNetCore@8.2.1, prometheus-net@8.2.1
- [VERIFIED: GitHub releases API] — google-github-actions/auth v3, setup-gcloud v3.0.1, docker/build-push-action v7.2.0, docker/setup-buildx-action v4.1.0, docker/login-action v4.2.0, appleboy/ssh-action v1.2.5, Prometheus v3.11.3, Grafana v13.0.1
- [VERIFIED: BullMQ 5.73.0 source] — `exportPrometheusMetrics()` exists in installed version, inspected implementation
- [VERIFIED: codebase] — Dockerfile paths, compose config, crawler ESM type, existing middleware order, network topology
- [CITED: docs.cloud.google.com/artifact-registry] — Authentication methods, hostname format
- [CITED: github.com/google-github-actions/auth README] — WIF workflow inputs
- [CITED: github.com/prometheus-net/prometheus-net README] — UseHttpMetrics, MapMetrics pattern
- [CITED: github.com/siimon/prom-client README] — ESM exports, Gauge/Histogram API
- [CITED: grafana.com/tutorials/run-grafana-behind-a-proxy] — nginx subpath config, GF_SERVER settings
- [CITED: grafana.com/docs/grafana/latest/administration/provisioning] — YAML provisioning format
- [CITED: docs.docker.com/compose/how-tos/environment-variables] — Variable interpolation, .env support

### Secondary (MEDIUM confidence)
- [dev.to/filip-lindqvist] — WIF + Artifact Registry workflow example (cross-referenced with official docs)
- [spacelift.io/blog/prometheus-docker-compose] — Prometheus scrape config with Docker Compose hostnames

### Tertiary (LOW confidence)
- OS overhead estimate (200-300MB for Ubuntu 24.04) — based on training knowledge, not measured on this specific VM

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified from live registries
- CI/CD workflow: HIGH — official action docs + verified examples
- Metrics instrumentation: HIGH — verified from installed BullMQ source + official prometheus-net docs
- Memory budget: MEDIUM — math is verified; OS overhead is assumed
- Deployment path/username: LOW — derived from docs written for Oracle, not confirmed on GCE VM

**Research date:** 2026-05-25
**Valid until:** 2026-08-25 (stable ecosystem; GCP auth patterns change slowly)
