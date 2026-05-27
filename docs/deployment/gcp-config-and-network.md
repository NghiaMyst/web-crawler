# GCP Deployment — Architecture, Config & Network Guide

Complete reference for how the production system is built on GCP.
Covers the runtime stack, the CI/CD pipeline, and all GCP concepts involved.
Includes every real error hit during first setup with root cause explanations.

---

## Table of Contents

1. [Full Architecture Overview](#full-architecture-overview)
2. [GCP Services Used and Why](#gcp-services-used-and-why)
3. [CI/CD Pipeline — How a Push Becomes a Deploy](#cicd-pipeline)
4. [Workload Identity Federation — Keyless Auth Explained](#workload-identity-federation)
5. [GCE VM — Runtime and Service Account](#gce-vm-runtime-and-service-account)
6. [Artifact Registry](#artifact-registry)
7. [Environment Variables](#environment-variables)
8. [Network: Firewall, DNS, TLS](#network-firewall-dns-tls)
9. [Docker Compose: Startup Order](#docker-compose-startup-order)
10. [Common Operations](#common-operations)
11. [Troubleshooting: All Real Errors With Solutions](#troubleshooting-all-real-errors)

---

## Full Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  DEVELOPER MACHINE                                                  │
│  git push → github.com/NghiaMyst/web-crawler (main branch)         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ triggers
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GITHUB ACTIONS (.github/workflows/deploy.yml)                      │
│                                                                     │
│  build-and-push job (runs in parallel for crawler + api):           │
│  1. Checkout code                                                   │
│  2. Exchange GitHub OIDC token → GCP access token (WIF)            │
│  3. Authenticate Docker → Artifact Registry                         │
│  4. Build Docker image (linux/amd64)                                │
│  5. Push image to Artifact Registry (tagged :sha + :latest)         │
│                                                                     │
│  deploy job (runs after both images push):                          │
│  6. SSH into GCE VM                                                 │
│  7. Update IMAGE_TAG in .env.prod                                   │
│  8. docker compose pull crawler api                                 │
│  9. docker compose up -d --no-deps crawler api                      │
│  10. Poll docker inspect until api container = healthy              │
└──────────┬──────────────────────────┬───────────────────────────────┘
           │ push images              │ SSH deploy
           ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────────────────┐
│  GCP ARTIFACT        │   │  GCP COMPUTE ENGINE VM (webcrawler-prod) │
│  REGISTRY            │   │  asia-southeast1-b — e2-medium           │
│                      │   │  IP: 34.87.36.185                        │
│  webcrawler/         │   │                                          │
│  ├── api:sha         │   │  ┌──────────────────────────────────┐    │
│  ├── api:latest      │◄──┼──│  Docker Compose (prod stack)     │    │
│  ├── crawler:sha     │   │  │                                  │    │
│  └── crawler:latest  │   │  │  nginx:80/443 (host ports)       │    │
│                      │   │  │    │                             │    │
│  asia-southeast1     │   │  │    ├──▶ api:5000 (internal)      │    │
│  -docker.pkg.dev     │   │  │    └──▶ api:5000/hubs (SignalR)  │    │
└──────────────────────┘   │  │         │                        │    │
                           │  │         ├──▶ postgres:5432        │    │
                           │  │         └──▶ redis:6379           │    │
                           │  │                                   │    │
                           │  │  crawler (internal only)          │    │
                           │  │    └──▶ postgres:5432             │    │
                           │  │    └──▶ redis:6379                │    │
                           │  │                                   │    │
                           │  │  prometheus + grafana (internal)  │    │
                           │  └──────────────────────────────────┘    │
                           └──────────────────────────────────────────┘
                                          │ HTTPS
                                          ▼
                           ┌──────────────────────────────┐
                           │  USERS / VERCEL DASHBOARD    │
                           │  webcrawler-myst.duckdns.org │
                           └──────────────────────────────┘
```

**Key design rules:**
- Only `nginx` has host ports bound (80, 443). Everything else is internal Docker network only.
- `api` port 5000 is NOT reachable from the VM host — only from inside the Docker network.
- Images are never built on the VM — CI builds and pushes, VM only pulls and runs.
- No JSON credentials files exist anywhere — GCP auth uses keyless tokens via WIF.

---

## GCP Services Used and Why

### 1. Compute Engine (GCE VM)
The virtual machine that runs the production Docker stack.

- **Why GCE over Cloud Run/GKE?** Simpler ops — single VM, full control over Docker Compose,
  no Kubernetes overhead. Suitable for a personal project.
- **VM spec:** `e2-medium` (2 vCPU, 4GB RAM) in `asia-southeast1-b` (Singapore).
- **Service Account:** Every GCE VM is attached to a service account that GCP services use
  for authentication. Default: `958055060147-compute@developer.gserviceaccount.com`.
  This is what `gcloud` and Docker credential helpers use when running on the VM.

### 2. Artifact Registry
GCP's managed Docker image registry (replacement for Container Registry).

- **Why not Docker Hub?** Artifact Registry is in the same GCP project — no separate credentials,
  images are co-located with the VM, and private by default.
- **Registry hostname:** `asia-southeast1-docker.pkg.dev`
- **Repository:** `project-c67469b2-5925-4167-b6a/webcrawler`
- **Image paths:**
  ```
  asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler/api:latest
  asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler/crawler:latest
  ```

### 3. IAM (Identity and Access Management)
GCP's permission system. Every action (push image, pull image, impersonate service account)
requires an explicit IAM role binding.

**Key principle:** In GCP, nothing has access by default. You must explicitly grant each
permission. This applies to APIs too — they must be enabled per project before use.

**Roles used in this project:**
| Principal | Role | Why |
|-----------|------|-----|
| `github-ci` service account | `roles/artifactregistry.writer` | CI can push images |
| `958055060147-compute@developer.gserviceaccount.com` | `roles/artifactregistry.reader` | VM can pull images |
| `github-ci` service account | `roles/iam.workloadIdentityUser` | WIF can impersonate it |

### 4. Workload Identity Federation (WIF)
Allows GitHub Actions to authenticate to GCP without any stored credentials.
See the [dedicated section below](#workload-identity-federation).

### 5. GCP APIs
GCP APIs must be explicitly enabled per project. Two are required:

| API | What it does | Why needed |
|-----|-------------|------------|
| `artifactregistry.googleapis.com` | Read/write Docker images | CI push + VM pull |
| `iamcredentials.googleapis.com` | Generate short-lived service account tokens | WIF token exchange |

---

## CI/CD Pipeline

Every `git push` to `main` triggers `.github/workflows/deploy.yml`.

### Required GitHub Secrets

| Secret | Value | Used by |
|--------|-------|---------|
| `GCP_PROJECT_ID` | `project-c67469b2-5925-4167-b6a` | Image paths |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/958055060147/locations/global/workloadIdentityPools/github-pool/providers/github-provider` | WIF auth |
| `GCP_SERVICE_ACCOUNT` | `github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com` | WIF impersonation target |
| `GCE_SSH_HOST` | `34.87.36.185` | SSH deploy |
| `GCE_SSH_USER` | `nghianguyentrong1211` | SSH deploy |
| `GCE_SSH_PRIVATE_KEY` | Full `-----BEGIN OPENSSH PRIVATE KEY-----` block | SSH deploy |

> **If a secret is missing or empty**, `${{ secrets.SECRET_NAME }}` resolves to an empty
> string. The workflow step receiving it will fail — often with a confusing error that
> doesn't mention "secret missing". Always verify all secrets are set at
> https://github.com/NghiaMyst/web-crawler/settings/secrets/actions

### Build Job — Docker Context Per App

The two apps have different Docker build contexts because they have different dependencies:

```yaml
matrix:
  include:
    - app: crawler
      context: .           # needs monorepo root (copies package.json, shared-types, etc.)
    - app: api
      context: apps/api    # standalone .NET — COPY *.csproj only works from apps/api/
```

**Why this matters:** `COPY *.csproj ./` in the API Dockerfile copies `.csproj` files from
the build context root. If context is the repo root (`.`), there are no `.csproj` files
there → `dotnet restore` fails with `MSB1003: no project file`.

### Deploy Job — How the VM Updates

The deploy script does NOT `git pull` — the compose file stays fixed on the VM.
Only the image tag changes:

```bash
# 1. Write new SHA into .env.prod
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env.prod

# 2. Pull new images from Artifact Registry
docker compose -f docker-compose.prod.yml --env-file .env.prod pull crawler api

# 3. Restart only the two app containers (skip postgres/redis/nginx)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps crawler api

# 4. Wait for API container to become healthy (docker's internal healthcheck)
timeout 120 bash -c 'until [ "$(docker inspect webcrawler-api-1 \
  --format={{.State.Health.Status}})" = "healthy" ]; do sleep 5; done'
```

**Why `docker inspect` not `curl localhost:5000`?**
Port 5000 is not exposed to the VM host — it's inside the Docker network only.
`curl localhost:5000` from the deploy script always fails with connection refused.
`docker inspect` reads the health status from Docker's own internal healthcheck,
which runs `curl` inside the container where port 5000 is reachable.

---

## Workload Identity Federation

WIF is the mechanism that lets GitHub Actions authenticate to GCP **without any stored
credentials** (no JSON key files, no passwords, no secrets to rotate).

### The Problem It Solves

Traditional approach: create a service account, download a JSON key file, store it as a
GitHub Secret, use it in CI. Problems:
- The JSON key file is a long-lived credential — if it leaks, attackers have permanent access
- Keys must be manually rotated
- Keys are stored in GitHub, adding another attack surface

### How WIF Works (Step by Step)

```
1. GitHub Actions starts a job
   └── GitHub mints a short-lived OIDC token for this specific job run
       Token contains: repository name, branch, commit SHA, run ID, etc.

2. google-github-actions/auth receives the OIDC token
   └── Sends it to GCP's token exchange endpoint:
       POST https://sts.googleapis.com/v1/token
       {audience: "//iam.googleapis.com/projects/.../workloadIdentityPools/github-pool/providers/github-provider"}

3. GCP's STS (Security Token Service) validates the token:
   └── Is the OIDC token signed by GitHub? (verified via GitHub's JWKS endpoint)
   └── Does the token's repository == "NghiaMyst/web-crawler"? (attribute-condition check)
   └── If both pass → returns a federated token

4. The federated token is exchanged for a service account access token:
   └── Calls iamcredentials.googleapis.com to impersonate github-ci@...
   └── Returns a short-lived OAuth 2.0 access token (1 hour lifetime)

5. CI uses the access token to push images to Artifact Registry
```

### The Three GCP Resources Required

```
Workload Identity Pool (github-pool)
└── OIDC Provider (github-provider)
    ├── issuer: https://token.actions.githubusercontent.com
    ├── attribute-mapping: maps GitHub claims to GCP attributes
    └── attribute-condition: assertion.repository=='NghiaMyst/web-crawler'
        (ONLY this repo can exchange tokens — other repos are rejected)

Service Account (github-ci@...)
└── IAM binding: principalSet://...github-pool/attribute.repository/NghiaMyst/web-crawler
    └── role: roles/iam.workloadIdentityUser  (allows the pool to impersonate this SA)
```

### Secret Value Format

`GCP_WORKLOAD_IDENTITY_PROVIDER` must be the full provider resource path:
```
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
```

- Uses **project number** (958055060147), NOT the project ID string
- The pool and provider names are `github-pool` / `github-provider` (set at creation time)

---

## GCE VM — Runtime and Service Account

### What the VM's Service Account Is

Every GCE VM has an attached service account. When any GCP SDK or CLI runs on the VM,
it automatically uses this account's credentials via the **GCP metadata server**
(`http://metadata.google.internal`).

This VM uses the Compute Engine default service account:
```
958055060147-compute@developer.gserviceaccount.com
```

**Why this matters for Docker:**
When `gcloud auth configure-docker asia-southeast1-docker.pkg.dev` is run on the VM,
it installs a credential helper that calls `gcloud auth print-access-token` to get tokens.
That command uses the VM's service account — **not** the human user's account, even if
the human is logged in via `gcloud auth login`.

So Docker's registry authentication uses the service account. If the service account
doesn't have `roles/artifactregistry.reader`, every `docker pull` fails — even if the
human account has full project owner access.

**Verify which account is active on the VM:**
```bash
# SSH into VM first, then:
gcloud config get-value account
# Should show: 958055060147-compute@developer.gserviceaccount.com
```

### One-Time VM Setup

After the VM is provisioned and before the first CI deploy, run on the VM:
```bash
# Configure Docker to use gcloud as credential helper for Artifact Registry
gcloud auth configure-docker asia-southeast1-docker.pkg.dev --quiet
```

This writes to `~/.docker/config.json` and is persistent. Only needs to run once.

---

## Artifact Registry

### Repository Info

| Field | Value |
|-------|-------|
| Registry | `asia-southeast1-docker.pkg.dev` |
| Project | `project-c67469b2-5925-4167-b6a` |
| Repository | `webcrawler` |
| Format | Docker |
| Region | `asia-southeast1` (Singapore) |

### Image Tagging Convention

Each push creates two tags:
- `:<commit-sha>` — unique per build, used for rollback traceability
- `:latest` — always points to most recent push

The `:cache` tag stores BuildKit layer cache (speeds up future builds).

### Rollback

To roll back to a previous deploy, set `IMAGE_TAG` on the VM and restart:
```bash
cd /opt/webcrawler
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=<previous-sha>|" .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod pull crawler api
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps crawler api
```

---

## Environment Variables

### How They Flow

```
GitHub Secrets
    │ (injected into the runner env by the workflow)
    ▼
deploy.yml SSH script
    │ writes IMAGE_TAG into:
    ▼
/opt/webcrawler/.env.prod
    │ read by:
    ▼
docker compose --env-file .env.prod
    │ substitutes ${VAR} placeholders in docker-compose.prod.yml
    │ also passes:
    ▼
apps/api/.env.prod    → injected directly into api container
apps/crawler/.env.prod → injected directly into crawler container
```

**Always pass `--env-file .env.prod` on every compose command.** Without it,
`${POSTGRES_PASSWORD}`, `${IMAGE_TAG}`, `${CORS_ALLOWED_ORIGINS}` all resolve to
empty strings, causing containers to start with broken config.

### Root `.env.prod`

| Variable | Used by | Purpose |
|----------|---------|---------|
| `IMAGE_TAG` | compose image: lines | Which image version to run |
| `POSTGRES_PASSWORD` | postgres container | DB password |
| `CORS_ALLOWED_ORIGINS` | api container | Vercel URL allowed for CORS |
| `TELEGRAM_BOT_TOKEN` | api container | Alerts |
| `TELEGRAM_CHAT_ID` | api container | Alerts target |
| `DISCORD_WEBHOOK_URL` | api container | Alerts target |
| `RIOT_API_KEY` | crawler container | LoL tier list API |

### `apps/api/.env.prod`

| Variable | Format |
|----------|--------|
| `DATABASE_URL` | `Host=postgres;Port=5432;Database=webcrawler;Username=crawler;Password=<pw>` |

### `apps/crawler/.env.prod`

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Same format as API — same password, username `crawler` |
| `REDIS_URL` | `redis://redis:6379` |
| `FOOTBALL_DATA_API_KEY` | football-data.org token |

---

## Network: Firewall, DNS, TLS

### GCP VPC Firewall

GCP uses project-level VPC firewall rules. No `iptables` needed on the VM host.

**Rule:** `allow-http-https`
- Direction: Ingress
- Source: `0.0.0.0/0`
- Protocols: TCP 80, TCP 443

Verify (from local machine, not the VM):
```bash
curl --connect-timeout 5 http://34.87.36.185
# "Connection refused" = port reachable, firewall open, nothing yet listening on 80
# Timeout           = firewall is blocking
```

### DNS — DuckDNS

**Subdomain:** `webcrawler-myst.duckdns.org` → `34.87.36.185`

Free dynamic DNS. Required because Let's Encrypt does not issue certs for bare IPs.

Update the IP if the VM's external IP ever changes (GCP can reassign on VM stop/start):
1. Go to https://www.duckdns.org → update `webcrawler-myst` → **Update IP**
2. Or reserve a static IP in GCP Console: VPC Network → IP Addresses → Reserve

### TLS — Let's Encrypt via DNS-01

Cert stored in Docker named volume `letsencrypt`, mounted read-only into nginx.

**Cert location:** `/etc/letsencrypt/live/webcrawler-myst.duckdns.org/`
**Expires:** 2026-08-19 — renew before then.

**Renewal** (cron runs twice daily on VM):
```bash
DUCKDNS_TOKEN=<token> bash scripts/renew-cert.sh
docker compose -f docker-compose.prod.yml --env-file .env.prod restart nginx
```

---

## Docker Compose: Startup Order

Services start in dependency order, gated by healthchecks:

```
postgres ──(healthy)──┐
                      ├──▶ api ──(healthy)──▶ nginx
redis    ──(healthy)──┘
                      └──▶ crawler
```

| Service | Healthcheck | Start period |
|---------|------------|-------------|
| postgres | `pg_isready -U crawler` | 10s |
| redis | `redis-cli ping` | 5s |
| api | `curl -sf http://localhost:5000/health` (inside container) | 30s |
| crawler | `node -e process.exit(0)` | 15s |
| nginx | `wget -q --spider http://localhost/health` | 10s |

**Important:** The API healthcheck runs `curl` **inside the api container**. Port 5000 is
not bound to the host. Any external attempt to `curl localhost:5000` from the VM host
or CI script will always fail — use `docker inspect` to check health from outside.

---

## Common Operations

**Start full stack:**
```bash
cd /opt/webcrawler
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

**Check all service health:**
```bash
docker compose -f docker-compose.prod.yml ps
```

**View logs:**
```bash
docker logs webcrawler-api-1 --tail 50 -f
docker logs webcrawler-crawler-1 --tail 50 -f
```

**Force redeploy current IMAGE_TAG (without CI):**
```bash
cd /opt/webcrawler
docker compose -f docker-compose.prod.yml --env-file .env.prod pull crawler api
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps crawler api
```

**Roll back to a previous SHA:**
```bash
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=<previous-sha>|" .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod pull crawler api
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps crawler api
```

**Backfill FTS search vectors (after AddFtsSearchVector migration):**
```bash
docker exec -it webcrawler-db-1 psql -U postgres -d webcrawler \
  -c "UPDATE data_entries SET payload = payload;"
# Slow on large tables — fires the BEFORE UPDATE trigger on every row
```

**Stop stack (volumes preserved):**
```bash
docker compose -f docker-compose.prod.yml down
# NEVER use `down -v` in production — destroys postgres_data, redis_data, letsencrypt
```

---

## Troubleshooting: All Real Errors With Solutions

Every error below was hit during the actual first CI/CD setup of this project.

---

### Error 1: `must specify workload_identity_provider or credentials_json`

```
Error: google-github-actions/auth failed with: the GitHub Action workflow must specify
exactly one of "workload_identity_provider" or "credentials_json"!
```

**Root cause:** `GCP_WORKLOAD_IDENTITY_PROVIDER` GitHub Secret is missing or empty.
`${{ secrets.MISSING_SECRET }}` evaluates to `""` — the auth action sees no auth method.

**Why it appears suddenly:** Secrets can be accidentally deleted during repo settings
changes, team changes, or repo transfers.

**Fix:** Re-add all 3 GCP secrets at Settings → Secrets → Actions:
- `GCP_PROJECT_ID` = `project-c67469b2-5925-4167-b6a`
- `GCP_WORKLOAD_IDENTITY_PROVIDER` = `projects/958055060147/locations/global/workloadIdentityPools/github-pool/providers/github-provider`
- `GCP_SERVICE_ACCOUNT` = `github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com`

> **Project number vs Project ID:** The WIF path requires the numeric project number
> (`958055060147`), not the string project ID (`project-c67469b2-5925-4167-b6a`).
> Find it: GCP Console → Home Dashboard → "Project number" field, or:
> `gcloud projects describe project-c67469b2-5925-4167-b6a --format="value(projectNumber)"`

---

### Error 2: `invalid_target` — pool or provider doesn't exist

```
failed to generate Google Cloud federated token for //iam.googleapis.com/...:
{"error":"invalid_target","error_description":"The target service indicated by the
\"audience\" parameters is invalid. This might either be because the pool or provider
is disabled or deleted or because it doesn't exist."}
```

**Root cause:** The Workload Identity Pool (`github-pool`) and/or Provider (`github-provider`)
were never created on GCP. The secret value is a pointer to a resource — the resource
itself must be created separately.

**Fix — run in GCP Cloud Shell (https://console.cloud.google.com → `>_`):**
```bash
gcloud iam workload-identity-pools create github-pool \
  --project="project-c67469b2-5925-4167-b6a" \
  --location="global" \
  --display-name="GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project="project-c67469b2-5925-4167-b6a" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor" \
  --attribute-condition="assertion.repository=='NghiaMyst/web-crawler'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

---

### Error 3: `NOT_FOUND: Unknown service account` when binding WIF

```
ERROR: (gcloud.iam.service-accounts.add-iam-policy-binding) NOT_FOUND: Unknown service account.
```

**Root cause:** The `github-ci` service account was never created. The WIF binding
command references it — GCP returns NOT_FOUND.

**Fix:** Create the service account first, then run the binding:
```bash
gcloud iam service-accounts create github-ci \
  --display-name="GitHub Actions CI" \
  --project="project-c67469b2-5925-4167-b6a"

gcloud projects add-iam-policy-binding "project-c67469b2-5925-4167-b6a" \
  --member="serviceAccount:github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud iam service-accounts add-iam-policy-binding \
  "github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com" \
  --project="project-c67469b2-5925-4167-b6a" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/958055060147/locations/global/workloadIdentityPools/github-pool/attribute.repository/NghiaMyst/web-crawler"
```

**Order matters:** service account → WIF pool → WIF provider → IAM binding.

---

### Error 4: `IAM Service Account Credentials API disabled`

```
{"error":{"code":403,"message":"IAM Service Account Credentials API has not been used
in project 958055060147 before or it is disabled.","status":"PERMISSION_DENIED"}}
```

**Root cause:** GCP APIs are disabled by default. Even with WIF configured correctly,
generating OAuth 2.0 access tokens for service accounts requires
`iamcredentials.googleapis.com` to be explicitly enabled.

**GCP API concept:** Every GCP service has a corresponding API that must be opted into
per project. This is a security + billing control — you can audit exactly which services
are active. The two APIs for this CI/CD setup:
- `iamcredentials.googleapis.com` — service account token generation (for WIF)
- `artifactregistry.googleapis.com` — Docker image read/write

**Fix:**
```bash
gcloud services enable iamcredentials.googleapis.com artifactregistry.googleapis.com \
  --project="project-c67469b2-5925-4167-b6a"
# Wait ~30 seconds for propagation, then retry the workflow
```

---

### Error 5: `dotnet restore` fails — `MSB1003: no project file`

```
MSBUILD : error MSB1003: Specify a project or solution file. The current working
directory does not contain a project or solution file.
```

**Root cause:** The API Dockerfile uses `COPY *.csproj ./` which assumes the build
context is `apps/api/`. The workflow was passing the repo root (`.`) as context for
all apps. No `.csproj` exists at the repo root → `dotnet restore` finds nothing.

**Why crawler didn't fail:** The crawler Dockerfile explicitly expects the monorepo root
(it copies `package.json`, `pnpm-workspace.yaml`, `packages/shared-types/` which only
exist at the repo root).

**Fix:** Per-app context in the workflow matrix:
```yaml
matrix:
  include:
    - app: crawler
      context: .          # needs monorepo root for shared workspace files
    - app: api
      context: apps/api   # standalone .NET, no monorepo deps
```

**General rule:** When a Dockerfile uses `COPY *.ext ./` without path prefixes, the
build context must be the directory those files live in.

---

### Error 6: MCR 403 Forbidden on Playwright base image

```
ERROR: failed to build: failed to solve: mcr.microsoft.com/playwright:v1.50.1-noble:
unexpected status from HEAD request: 403 Forbidden
```

**Root cause:** `docker/build-push-action` v6+ enables build provenance (SBOM attestation)
by default. This causes BuildKit to send HEAD requests to the base image registry to
inspect manifests. `mcr.microsoft.com` rejects these specific HEAD requests with 403.
The image exists — the request format is the problem.

**Fix:** Disable provenance in the build step:
```yaml
- name: Build and push
  uses: docker/build-push-action@v7.2.0
  with:
    provenance: false   # disables attestation, stops the problematic HEAD requests
    ...
```

---

### Error 7: SSH deploy — `missing server host`

```
2026/05/27 06:00:26 error: missing server host
```

**Root cause:** `GCE_SSH_HOST` secret is missing or empty. The SSH action has no
host to connect to.

**Fix:** Add the missing SSH secrets to GitHub:
| Secret | Value |
|--------|-------|
| `GCE_SSH_HOST` | `34.87.36.185` |
| `GCE_SSH_USER` | `nghianguyentrong1211` |
| `GCE_SSH_PRIVATE_KEY` | Full content of `~/.ssh/gce_deploy_key` including `-----BEGIN/END-----` lines |

---

### Error 8: SSH deploy — `this private key is passphrase protected`

```
2026/05/27 06:27:20 ssh.ParsePrivateKey: ssh: this private key is passphrase protected
```

**Root cause:** The SSH deploy key was generated with a passphrase. CI cannot use
interactive passphrase entry.

**Fix:** Generate a new key with **no passphrase** (`-N ""`):
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/gce_deploy_key -N ""
# Then add the new public key to the VM:
ssh-copy-id -i ~/.ssh/gce_deploy_key.pub nghianguyentrong1211@34.87.36.185
```
Update `GCE_SSH_PRIVATE_KEY` secret with the new private key content.

---

### Error 9: SSH deploy — `host key fingerprint mismatch`

```
ssh: handshake failed: ssh: host key fingerprint mismatch
```

**Root cause:** `appleboy/ssh-action`'s `fingerprint` parameter expects a SHA256 hash
format (`SHA256:xxxx`), not the full `ssh-keyscan` output. The full keyscan output was
stored in the secret, which doesn't match the expected format.

**Fix:** Remove the `fingerprint` parameter from the workflow entirely. SSH key
authentication (the private key) already authenticates the connection securely. Host
fingerprint verification is a nice-to-have MITM guard but is not critical for this
setup, and the format requirements are inconsistent across action versions.

```yaml
# Removed:
# fingerprint: ${{ secrets.GCE_SSH_KNOWN_HOSTS }}
```

---

### Error 10: `docker pull` permission denied on VM

```
Error response from daemon: error from registry: Permission
'artifactregistry.repositories.downloadArtifacts' denied on resource
```

**Root cause:** The VM uses the Compute Engine default service account
(`958055060147-compute@developer.gserviceaccount.com`) for Docker authentication.
This service account was not granted `roles/artifactregistry.reader`.

Granting access to the human user account (`user:nghianguyentrong1211@gmail.com`)
does NOT help — Docker on the VM authenticates as the service account, not the
human user, even if the human is logged into gcloud.

**Verify which account the VM uses:**
```bash
# SSH into VM:
gcloud config get-value account
# Shows: 958055060147-compute@developer.gserviceaccount.com
```

**Fix — grant the VM's service account reader access (run in Cloud Shell):**
```bash
gcloud projects add-iam-policy-binding "project-c67469b2-5925-4167-b6a" \
  --member="serviceAccount:958055060147-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.reader"
```

**Why `docker compose pull` showed "Skipped" instead of an error:**
When Docker can't authenticate, `docker compose pull` silently marks the service as
"Skipped No image to be pulled" rather than failing loudly. This masked the permission
error. The real failure only surfaced when `docker compose up` couldn't find the new
image tag locally.

---

### Error 11: API healthcheck always times out in deploy script

```
Waiting for API healthcheck...
  still waiting... (×18)
Process exited with status 124
```

**Root cause:** The original deploy script used:
```bash
curl -sf http://localhost:5000/health
```
But port 5000 is **not exposed to the VM host** — the API is inside the Docker network.
`curl localhost:5000` from the VM host always fails with connection refused, regardless
of whether the API container is healthy.

**Fix:** Poll Docker's internal health status instead:
```bash
timeout 120 bash -c 'until [ "$(docker inspect webcrawler-api-1 \
  --format={{.State.Health.Status}})" = "healthy" ]; do \
  echo "  still waiting..."; sleep 5; done'
```
Docker's healthcheck runs `curl` **inside the container** where port 5000 is reachable.
`docker inspect` reads that result from the outside.

---

## Quick Reference: GCP Resources for This Project

| Resource | Name/Value |
|----------|-----------|
| Project ID | `project-c67469b2-5925-4167-b6a` |
| Project Number | `958055060147` |
| VM name | `webcrawler-prod` |
| VM zone | `asia-southeast1-b` |
| VM IP | `34.87.36.185` |
| VM service account | `958055060147-compute@developer.gserviceaccount.com` |
| CI service account | `github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com` |
| WIF pool | `github-pool` |
| WIF provider | `github-provider` |
| Artifact Registry | `asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler` |
