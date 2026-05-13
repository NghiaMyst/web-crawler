---
phase: 10
plan: "01"
subsystem: infrastructure
tags:
  - docker
  - compose
  - production
  - arm64
  - cors
  - gitignore
dependency_graph:
  requires: []
  provides:
    - docker-compose.prod.yml (production manifest — all plans in phase 10 run against it)
    - CORS_ALLOWED_ORIGINS env var rename (Plan 10-03 supplies value via Vercel URL)
    - .env.prod.example templates (operator copies to server during Plan 10-02/10-03)
  affects:
    - apps/api/Program.cs (CORS env var name)
    - .gitignore (prod env files blocked)
tech_stack:
  added:
    - docker compose prod manifest (standalone, ARM64)
    - Redis AOF persistence (appendonly + everysec)
  patterns:
    - Standalone prod compose (no extends, no dev bind-mounts)
    - Named volume for Redis AOF (redis_data:/data)
    - External letsencrypt volume (created by Plan 10-02 Certbot before first up)
key_files:
  created:
    - docker-compose.prod.yml
    - apps/api/.env.prod.example
    - apps/crawler/.env.prod.example
    - .env.prod.example
  modified:
    - apps/api/Program.cs (CORS_ORIGINS → CORS_ALLOWED_ORIGINS)
    - .gitignore (added .env.prod patterns)
decisions:
  - "Prod build contexts use monorepo root (.) + dockerfile: apps/<svc>/Dockerfile to match existing COPY paths in both Dockerfiles"
  - "letsencrypt volume declared external:true — Plan 10-02 must create it via Certbot before docker compose up"
  - "No dotnet build --no-restore in verify: local NuGet analyzer DLLs were missing in worktree env; full dotnet build (with restore) succeeds cleanly"
metrics:
  duration_seconds: 90
  completed_date: "2026-05-13"
  tasks_completed: 2
  files_changed: 6
---

# Phase 10 Plan 01: Production Compose + CORS Rename Summary

**One-liner:** Standalone ARM64 docker-compose.prod.yml with Redis AOF, resource limits, no exposed DB ports, and CORS_ALLOWED_ORIGINS env var wired through Program.cs.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Author docker-compose.prod.yml | 01c800e | docker-compose.prod.yml (152 lines) |
| 2 | CORS rename + .env.prod.example templates | 92fb677 | apps/api/Program.cs, 3x .env.prod.example, .gitignore |

## What Was Built

### Task 1: docker-compose.prod.yml

Created a standalone production compose file at repo root (152 lines):

- **5 services:** postgres, redis, crawler, api, nginx (no dashboard — D-04, runs on Vercel)
- **All services:** `platform: linux/arm64`, `restart: always`, `deploy.resources.limits` (Ampere A1 sizing)
- **Redis D-07:** `command: redis-server --maxmemory-policy noeviction --appendonly yes --appendfsync everysec`
- **redis_data named volume** mounted at `/data` on redis service; declared in top-level `volumes:` block
- **No host ports** on postgres (5432) or redis (6379) — only nginx exposes 80/443 (T-10-01 mitigated)
- **letsencrypt external volume** — Plan 10-02 creates this via Certbot before first `docker compose up`
- **Build contexts:** `context: .` + `dockerfile: apps/<svc>/Dockerfile` to match existing Dockerfile COPY paths

Resource limits by service:
| Service | CPU limit | Memory limit |
|---------|-----------|--------------|
| postgres | 1.0 | 2G |
| redis | 0.5 | 512M |
| crawler | 2.0 | 4G |
| api | 1.0 | 1G |
| nginx | 0.5 | 256M |
| **Total** | **5.5 vCPU** | **7.75G / 24G** |

Validation: `docker compose -f docker-compose.prod.yml config --no-interpolate` exits 0.

### Task 2: CORS rename + env templates

**apps/api/Program.cs:** Single line change — `CORS_ORIGINS` renamed to `CORS_ALLOWED_ORIGINS` per D-06. `AllowCredentials()`, `AllowAnyHeader()`, `AllowAnyMethod()`, and `http://localhost:3000` fallback preserved. `dotnet build` confirms 0 errors.

**Three .env.prod.example templates created:**
- `apps/api/.env.prod.example`: `ASPNETCORE_ENVIRONMENT=Production`, prod DB connection string, REDIS_URL
- `apps/crawler/.env.prod.example`: `NODE_ENV=production`, LOG_LEVEL, REDIS_URL, DATABASE_URL, FOOTBALL_DATA_API_KEY
- `.env.prod.example` (root): POSTGRES_PASSWORD, CORS_ALLOWED_ORIGINS, TELEGRAM/DISCORD secrets, RIOT_API_KEY

**.gitignore updated:** Added `.env.prod`, `apps/api/.env.prod`, `apps/crawler/.env.prod`, `apps/dashboard/.env.prod` — prevents secrets from being committed (T-10-02 mitigated).

## Deviations from Plan

None — plan executed exactly as written.

## Open Follow-ups (for downstream plans)

1. **Plan 10-02 must create `letsencrypt` external volume** via Certbot one-shot container before `docker compose up` — if absent, compose will refuse to start with clear error
2. **Plan 10-02 must create `nginx/nginx.conf`** — nginx service mounts it read-only; missing file will prevent nginx container from starting
3. **Plan 10-03 must set `CORS_ALLOWED_ORIGINS`** in root `.env.prod` to the Vercel deployment URL once dashboard is deployed

## Threat Surface Scan

No new network endpoints or auth paths introduced. All T-10-01 through T-10-05 mitigations from the plan's threat model were applied:

| Threat | Status |
|--------|--------|
| T-10-01: postgres/redis ports exposed | Mitigated — no `ports:` on postgres or redis |
| T-10-02: .env.prod committed to git | Mitigated — .gitignore blocks all .env.prod files |
| T-10-03: CORS wildcard with credentials | Mitigated — CORS_ALLOWED_ORIGINS explicit env var in Program.cs |
| T-10-04: Container OOM kills host | Mitigated — deploy.resources.limits on all 5 services |
| T-10-05: Dev source bind-mounts in prod | Mitigated — no volumes: bind-mounts in prod compose |

## Self-Check: PASSED

Files exist:
- docker-compose.prod.yml: FOUND
- apps/api/Program.cs (CORS_ALLOWED_ORIGINS): FOUND
- apps/api/.env.prod.example: FOUND
- apps/crawler/.env.prod.example: FOUND
- .env.prod.example: FOUND
- .gitignore (.env.prod patterns): FOUND

Commits exist:
- 01c800e (Task 1 — docker-compose.prod.yml): FOUND
- 92fb677 (Task 2 — CORS rename + templates): FOUND
