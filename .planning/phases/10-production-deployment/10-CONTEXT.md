# Phase 10: Production Deployment - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy the full system to Oracle Cloud ARM (Ampere A1) behind HTTPS, with the
Next.js dashboard on Vercel free tier, and Redis/Bloom Filter state persisting
across service restarts.

Covers: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-05, INFRA-02.

Not in scope: new application features, dashboard pages, or crawling logic changes.

</domain>

<decisions>
## Implementation Decisions

### Reverse Proxy
- **D-01:** Nginx (not Caddy) as the reverse proxy. Nginx runs as a service inside
  `docker-compose.prod.yml` — not installed on the host directly. All services
  (API, SignalR WebSocket path `/hubs/`) are proxied through Nginx.
- **D-02:** TLS via Let's Encrypt with Certbot. A free DuckDNS subdomain
  (e.g., `mycrawler.duckdns.org`) is used since no custom domain exists. Certbot
  runs as a one-shot container to issue/renew certs; Nginx loads certs from a
  shared volume. This satisfies ROADMAP SC-2 (valid cert, no browser warnings).

### Image Build Strategy
- **D-03:** Images are built directly on the Oracle ARM server — no CI pipeline or
  container registry. Deployment workflow: SSH in → `git pull` → `docker compose -f
  docker-compose.prod.yml build` → `docker compose -f docker-compose.prod.yml up -d`.
  The ARM server builds natively (fast, no cross-compilation needed).

### Dashboard Deployment
- **D-04:** Dashboard runs on Vercel free tier only. It is removed from
  `docker-compose.prod.yml` — Oracle server runs only: postgres, redis, crawler,
  api, nginx.
- **D-05:** `NEXT_PUBLIC_API_URL` in Vercel is set to `https://<duckdns-domain>`.
  SignalR connects via WSS (required because Vercel dashboard is HTTPS — mixed-content
  rules block WS from an HTTPS page).
- **D-06:** CORS allowed origins set via `CORS_ALLOWED_ORIGINS` environment variable
  in `docker-compose.prod.yml` (not hardcoded). Value will be the Vercel deployment
  URL once known. This keeps the config flexible and avoids re-building the image
  when the Vercel URL changes.

### Redis Persistence
- **D-07:** Redis in production uses `appendonly yes` + `appendfsync everysec` (AOF).
  The Redis command in `docker-compose.prod.yml` overrides the dev compose:
  `redis-server --maxmemory-policy noeviction --appendonly yes --appendfsync everysec`.
  BullMQ job state and Bloom Filter key both survive a Redis restart via AOF.

### Production Compose Overrides
- **D-08:** `docker-compose.prod.yml` adds:
  - `restart: always` on all services (not `on-failure`)
  - Resource limits appropriate for the Ampere A1 (4 vCPU, 24GB RAM)
  - No bind-mount source volumes (dev-only)
  - ARM64-explicit image tags where needed
  - Postgres data volume retained (persistent storage)
  - No dashboard service (Vercel handles it)

### Claude's Discretion
- Exact Nginx config structure (number of server blocks, proxy_pass details)
- Certbot renewal cron vs Docker-based renewal timer
- Specific resource limits (CPU/memory) per service in prod compose
- Oracle Cloud VCN + iptables firewall rule documentation format

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — DEPLOY-01 through DEPLOY-05, INFRA-02 (the requirements this phase closes)
- `.planning/ROADMAP.md` — Phase 10 success criteria (SC-1: health checks pass; SC-2: HTTPS with valid cert; SC-3: Vercel dashboard + SignalR WSS; SC-4: Bloom Filter survives Redis restart; SC-5: BullMQ jobs survive crawler restart), Plans 10-01 through 10-05 descriptions

### Existing Infrastructure
- `docker-compose.yml` — Current dev compose (the base to override in prod; note Redis uses `noeviction` only — AOF not yet enabled)
- `apps/api/Dockerfile` — Uses `mcr.microsoft.com/dotnet/aspnet:8.0` (multi-arch, ARM64 compatible)
- `apps/crawler/Dockerfile` — Uses `mcr.microsoft.com/playwright:v1.50.1-noble` (multi-arch manifest confirmed)
- `apps/dashboard/Dockerfile` — Uses `node:20-alpine` (ARM64 compatible via Docker manifest)

### Phase 6 SignalR CORS Decision (critical for D-06)
- `.planning/phases/06-signalr-real-time-layer/06-CONTEXT.md` — D-07: CORS requires `AllowCredentials()` with explicit origins (not wildcard). The `CORS_ALLOWED_ORIGINS` env var must supply the Vercel URL.

### Phase 9 SignalR Client (WSS requirement context)
- `.planning/phases/09-real-time-dashboard-integration/09-CONTEXT.md` — D-01/D-02: SignalRProvider and LiveEntriesWrapper; reconnect gap recovery via `GET /api/entries?since=`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docker-compose.yml`: Complete working dev stack — prod compose extends/overrides this
- `apps/api/Dockerfile`, `apps/crawler/Dockerfile`, `apps/dashboard/Dockerfile`: All already ARM64-compatible; no Dockerfile changes needed for prod

### Established Patterns
- Redis `noeviction` policy (required for BullMQ): must be preserved alongside new AOF flags in prod Redis command
- `env_file` pattern: all services use `.env` files — prod compose needs equivalent env config (or inline environment vars for secrets)

### Integration Points
- Nginx `/hubs/` path must be configured for WebSocket upgrade (`proxy_http_version 1.1`, `Upgrade` + `Connection` headers)
- API listens on port 5000 (internal); Nginx exposes 80/443 externally
- Dashboard removed from prod compose — Vercel connects directly to the Oracle API via HTTPS

</code_context>

<specifics>
## Specific Ideas

- DuckDNS for the free subdomain — `duckdns.org` (free, Let's Encrypt-compatible, 2-minute setup)
- Certbot + Nginx Docker pattern: `certbot/certbot` image for cert issuance; Nginx reloads after cert renewal
- Build workflow: `ssh oracle-server`, `git pull`, `docker compose -f docker-compose.prod.yml build`, `up -d`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-production-deployment*
*Context gathered: 2026-05-13*
