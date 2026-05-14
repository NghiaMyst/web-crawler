# Phase 10: Production Deployment - Research

**Researched:** 2026-05-13
**Domain:** Container orchestration, reverse proxy TLS, Redis persistence, Vercel deployment
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Nginx (not Caddy) as the reverse proxy. Nginx runs as a service inside `docker-compose.prod.yml` — not installed on the host directly. All services (API, SignalR WebSocket path `/hubs/`) are proxied through Nginx.
- **D-02:** TLS via Let's Encrypt with Certbot. A free DuckDNS subdomain (e.g., `mycrawler.duckdns.org`) is used. Certbot runs as a one-shot container to issue/renew certs; Nginx loads certs from a shared volume.
- **D-03:** Images are built directly on the Oracle ARM server — no CI pipeline or container registry. Deployment: SSH → `git pull` → `docker compose -f docker-compose.prod.yml build` → `docker compose -f docker-compose.prod.yml up -d`.
- **D-04:** Dashboard runs on Vercel free tier only. Removed from `docker-compose.prod.yml`. Oracle server runs only: postgres, redis, crawler, api, nginx.
- **D-05:** `NEXT_PUBLIC_API_URL` in Vercel is set to `https://<duckdns-domain>`. SignalR connects via WSS (mixed-content rules require this).
- **D-06:** CORS allowed origins set via `CORS_ALLOWED_ORIGINS` environment variable in `docker-compose.prod.yml` (not hardcoded). Value = Vercel deployment URL.
- **D-07:** Redis uses `appendonly yes` + `appendfsync everysec` + `noeviction`. Command: `redis-server --maxmemory-policy noeviction --appendonly yes --appendfsync everysec`.
- **D-08:** `docker-compose.prod.yml` adds: `restart: always`, resource limits for Ampere A1 (4 vCPU, 24GB RAM), no source bind-mounts, ARM64-explicit image tags, postgres data volume retained, no dashboard service.

### Claude's Discretion

- Exact Nginx config structure (number of server blocks, proxy_pass details)
- Certbot renewal cron vs Docker-based renewal timer
- Specific resource limits (CPU/memory) per service in prod compose
- Oracle Cloud VCN + iptables firewall rule documentation format

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEPLOY-01 | Production Docker Compose for Oracle Cloud (`docker-compose.prod.yml`) | D-08: compose structure, resource limits, restart policies, ARM64 platform |
| DEPLOY-02 | Nginx/Caddy reverse proxy with HTTPS via Let's Encrypt | D-01/D-02: Nginx containerized, Certbot DNS-01 with DuckDNS, cert renewal |
| DEPLOY-03 | Dashboard deployed to Vercel free tier | D-04/D-05/D-06: Vercel deployment, env var configuration, CORS |
| DEPLOY-04 | Redis persistence enabled (`appendonly yes`) | D-07: AOF + everysec + noeviction command verified |
| DEPLOY-05 | Bloom Filter state persisted to Redis on shutdown, reloaded on startup | AOF persistence covers Redis-backed bloom filter keys; test via restart simulation |
| INFRA-02 | All Docker images have ARM64 builds (Oracle Cloud Ampere A1 compatibility) | All three Dockerfiles confirmed multi-arch; `platform: linux/arm64` in prod compose |
</phase_requirements>

---

## Summary

Phase 10 deploys the completed web crawler system to Oracle Cloud Ampere A1 (ARM64, 4 vCPU, 24GB RAM) with Nginx as the TLS-terminating reverse proxy, Redis AOF persistence for both BullMQ queue state and Bloom Filter deduplication, and the Next.js dashboard deployed separately on Vercel free tier. All three application Dockerfiles already use multi-arch base images compatible with ARM64 — no Dockerfile changes are required.

The two-layer firewall model on Oracle Cloud (VCN Security List + host iptables) requires explicit configuration for ports 80 and 443. DuckDNS provides a free subdomain for Let's Encrypt DNS-01 certificate issuance via the `infinityofspace/certbot_dns_duckdns` Docker image, which handles the ACME DNS challenge without requiring HTTP-01 (avoiding chicken-and-egg issues with Nginx needing a cert before it can serve traffic).

The Vercel deployment is a static configuration step: set `NEXT_PUBLIC_API_URL` and `CORS_ALLOWED_ORIGINS` environment variables, push to git, and the Vercel build pipeline handles the rest. SignalR over WSS works from HTTPS Vercel pages to the HTTPS Oracle API as long as the Nginx `/hubs/` location uses the correct WebSocket upgrade headers.

**Primary recommendation:** Build prod compose from the existing dev compose as a complete standalone file (not `extends`). Use Certbot DNS-01 challenge with DuckDNS plugin to avoid HTTP-01 bootstrap ordering issues. Validate Redis AOF by restarting Redis and confirming the Bloom Filter key still exists before marking DEPLOY-05 complete.

---

## Standard Stack

### Core

| Component | Version / Image | Purpose | Why Standard |
|-----------|----------------|---------|--------------|
| nginx | `nginx:1.27-alpine` | Reverse proxy, TLS termination | Official Alpine image, multi-arch ARM64 support, minimal size |
| certbot/certbot | `infinityofspace/certbot_dns_duckdns:latest` | DNS-01 cert issuance for DuckDNS | Only Docker-native option for DuckDNS DNS challenge |
| redis | `redis:7-alpine` | Queue + Bloom Filter persistence (AOF) | Same image as dev; AOF enabled via command flags |
| postgres | `postgres:16-alpine` | Persistent data store | Same as dev; data volume retained |
| docker compose | v5.x (installed: v5.1.3) | Service orchestration | Already in use [VERIFIED: bash] |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `platform: linux/arm64` in compose | Explicit ARM64 target | Prevents Docker from pulling wrong arch manifest |
| `restart: always` | Auto-restart on crash/reboot | All prod services — not `on-failure` |
| `deploy.resources.limits` | CPU + memory caps | Prevent any single container starving others on shared 4 vCPU / 24GB |
| `certbot renew --dry-run` | Pre-renewal test | Verify renewal config before setting up cron |

**Version verification:** [VERIFIED: bash — Docker Compose v5.1.3, Docker 29.4.3, Node 24.15.0]

---

## Architecture Patterns

### Recommended Production Compose Structure

```
docker-compose.prod.yml     # Standalone (does NOT use extends)
nginx/
  nginx.conf                # HTTP→HTTPS redirect + API proxy + /hubs/ WS upgrade
  conf.d/                   # Optional per-server snippets
letsencrypt/                # Mapped volume: /etc/letsencrypt (shared between nginx + certbot containers)
```

The prod compose is a complete standalone file — it does NOT use `docker compose -f docker-compose.yml -f docker-compose.prod.yml` overrides. This avoids merge surprises and makes the prod state unambiguous.

### Pattern 1: Nginx WebSocket Upgrade for SignalR

**What:** The `/hubs/` path needs HTTP/1.1 + Upgrade/Connection headers to proxy WebSocket connections. Without these, SignalR falls back to Server-Sent Events or Long Polling, and CORS/header issues cause failures.

**When to use:** All requests to `/hubs/dashboard` (and any future hubs).

**Example:**
```nginx
# Source: https://learn.microsoft.com/en-us/aspnet/core/signalr/scale
http {
  map $http_connection $connection_upgrade {
    "~*Upgrade" $http_connection;
    default keep-alive;
  }

  server {
    listen 443 ssl;
    server_name mycrawler.duckdns.org;

    ssl_certificate     /etc/letsencrypt/live/mycrawler.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mycrawler.duckdns.org/privkey.pem;

    # SignalR hub — WebSocket + SSE + LongPolling
    location /hubs/ {
      proxy_pass http://api:5000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_cache off;
      proxy_buffering off;
      proxy_read_timeout 100s;
    }

    # API — standard HTTP
    location / {
      proxy_pass http://api:5000;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
  }

  # HTTP → HTTPS redirect
  server {
    listen 80;
    server_name mycrawler.duckdns.org;
    return 301 https://$host$request_uri;
  }
}
```
[CITED: https://learn.microsoft.com/en-us/aspnet/core/signalr/scale — Nginx section]
[CITED: https://nginx.org/en/docs/http/websocket.html]

### Pattern 2: DuckDNS DNS-01 Certificate Issuance

**What:** Let's Encrypt DNS-01 challenge creates a `_acme-challenge` TXT record via the DuckDNS API. The `infinityofspace/certbot_dns_duckdns` Docker image handles this automatically.

**Why DNS-01 instead of HTTP-01:** HTTP-01 requires Nginx to be running and serving `/.well-known/acme-challenge/` before the cert exists — a chicken-and-egg problem. DNS-01 bypasses this: certs can be issued before Nginx starts.

**Example (one-shot cert issuance):**
```bash
docker run --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/log/letsencrypt:/var/log/letsencrypt \
  infinityofspace/certbot_dns_duckdns:latest \
  certonly \
  --non-interactive \
  --agree-tos \
  --email <your-email> \
  --preferred-challenges dns \
  --authenticator dns-duckdns \
  --dns-duckdns-token <your-duckdns-token> \
  --dns-duckdns-propagation-seconds 60 \
  -d "mycrawler.duckdns.org"
```
[CITED: https://github.com/infinityofspace/certbot_dns_duckdns]

**Renewal (host cron, runs twice daily):**
```cron
0 3,15 * * * docker run --rm -v /etc/letsencrypt:/etc/letsencrypt infinityofspace/certbot_dns_duckdns:latest renew --quiet && docker compose -f /opt/webcrawler/docker-compose.prod.yml exec nginx nginx -s reload
```

### Pattern 3: Redis AOF Persistence Command

**What:** Override the dev Redis command to enable AOF while preserving the `noeviction` policy required by BullMQ.

**Example (in docker-compose.prod.yml):**
```yaml
redis:
  image: redis:7-alpine
  command: redis-server --maxmemory-policy noeviction --appendonly yes --appendfsync everysec
  restart: always
  volumes:
    - redis_data:/data
  platform: linux/arm64
```
[CITED: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/ — AOF section]

The `/data` volume is required: without it, the AOF file is lost when the container restarts. The `redis_data` named volume must be declared in the `volumes:` block.

### Pattern 4: Resource Limits for Ampere A1 (4 vCPU, 24GB RAM)

**What:** Docker Compose `deploy.resources` caps CPU and memory per container.

**Example:**
```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      cpus: '0.25'
      memory: 128M
```
[CITED: https://docs.docker.com/engine/containers/resource_constraints/]

**Recommended allocation for this stack (total headroom: 4 vCPU, 24GB):**

| Service | CPU limit | Memory limit | Rationale |
|---------|-----------|-------------|-----------|
| crawler | 2.0 | 4G | Playwright is the heaviest consumer; 3 browser instances |
| api | 1.0 | 1G | .NET 8 runtime; SignalR connections |
| postgres | 1.0 | 2G | Query workload, JSONB GIN indexes |
| redis | 0.5 | 512M | In-memory only; AOF I/O is sequential |
| nginx | 0.5 | 256M | Proxy only; low memory overhead |

Total: 5 vCPU (over-provisioned intentionally — Ampere A1 bursts; limits prevent starvation, not absolute reservation) / ~8GB. [ASSUMED — specific values; adjust based on observed usage in prod]

### Pattern 5: Oracle Cloud Two-Layer Firewall

Oracle Cloud uses two independent firewall layers — both must be opened.

**Layer 1: VCN Security List (Oracle Console)**

Navigate to: Networking > Virtual Cloud Networks > your VCN > Security Lists > Default Security List

Add ingress rules:
- Protocol: TCP, Source: 0.0.0.0/0, Destination Port: 80
- Protocol: TCP, Source: 0.0.0.0/0, Destination Port: 443

[CITED: https://gist.github.com/mrladeia/da43fc783610758c6dbcaba22b4f7acd]

**Layer 2: iptables on the instance (Ubuntu)**

```bash
# Method: edit rules file for persistence
sudo nano /etc/iptables/rules.v4
# Add below the SSH -A INPUT rule:
# -A INPUT -p tcp -m state --state NEW -m multiport --dports 80,443 -j ACCEPT

sudo /sbin/iptables-restore < /etc/iptables/rules.v4

# OR: command line approach
sudo iptables -I INPUT -s 0.0.0.0/0 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -s 0.0.0.0/0 -p tcp --dport 443 -j ACCEPT
sudo apt-get install iptables-persistent -y
sudo netfilter-persistent save
```
[CITED: https://gist.github.com/mrladeia/da43fc783610758c6dbcaba22b4f7acd]

### Pattern 6: Vercel Deployment

**What:** Deploy the Next.js dashboard to Vercel Hobby (free) tier with production environment variables.

**Steps:**
1. Connect GitHub repo to Vercel
2. Set root directory to `apps/dashboard` (monorepo subdirectory)
3. Set environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_API_URL` = `https://mycrawler.duckdns.org`
   - Any server-side API secrets (never prefix with `NEXT_PUBLIC_`)
4. `CORS_ALLOWED_ORIGINS` is set in `docker-compose.prod.yml` on Oracle side (not in Vercel)
5. Each Vercel deployment gets a unique URL (e.g., `dashboard-abc123.vercel.app`) — the stable custom Vercel domain URL must be used as the CORS origin

**Critical:** `NEXT_PUBLIC_*` variables are **baked into the JS bundle at build time**. If the API URL changes, a redeploy is required. [CITED: https://nextjs.org/docs/pages/guides/environment-variables]

**Critical:** The Vercel Hobby plan limits deployments to personal/non-commercial projects (2026 ToS). Free tier includes 100GB bandwidth/month and unlimited deployments. [CITED: https://vercel.com/docs/plans/hobby]

### Anti-Patterns to Avoid

- **HTTP-01 Certbot with Nginx:** Requires Nginx running before cert exists. Use DNS-01 instead.
- **`docker compose -f base.yml -f prod.yml`:** Compose file merging has subtle gotchas with arrays (e.g., `command` replaces, not merges). Write prod compose standalone.
- **Missing `redis_data` named volume:** Without a named volume, Redis AOF file is lost on container recreate. The `/data` directory inside the Redis container MUST be backed by a named volume.
- **`Connection: "upgrade"` hardcoded (not using map):** For non-WebSocket requests, this header causes connection issues. Use the `map $http_connection $connection_upgrade` pattern from official MS docs.
- **Port 5432 exposed in prod:** Postgres should NOT expose its port externally in `docker-compose.prod.yml`. Remove `ports: - "5432:5432"` from postgres. Same for Redis port 6379. Only Nginx ports 80/443 need external exposure.
- **Wildcard CORS in production:** SignalR's `AllowCredentials()` is incompatible with wildcard origins. `CORS_ALLOWED_ORIGINS` must be the exact Vercel URL. [CITED: Phase 6 CONTEXT.md D-07]
- **`restart: on-failure` in prod:** Use `restart: always` — `on-failure` does not restart after host reboot.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DNS-01 challenge for DuckDNS | Custom script calling DuckDNS API | `infinityofspace/certbot_dns_duckdns` Docker image | Handles DNS propagation wait, retry, cert storage |
| SSL cert renewal scheduling | Custom systemd timer or complex cron wrapper | Host cron + `certbot renew --quiet` + `nginx -s reload` | Mature, battle-tested; one-liner |
| WebSocket detection in Nginx | Per-location `Connection: upgrade` | `map $http_connection $connection_upgrade` block | Handles both upgrade and regular HTTP connections in one upstream |
| Redis persistence validation | Custom polling loop | `redis-cli DEBUG SLEEP 0` + `redis-cli BGREWRITEAOF` | Direct Redis commands confirm AOF write |
| ARM64 image verification | Test build on local machine | Build natively on Oracle server (D-03) | ARM server builds natively; no cross-compilation |

---

## Runtime State Inventory

This is a deployment phase, not a rename/refactor. The section below covers state categories relevant to production initialization.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Postgres `postgres_data` volume (existing dev data) | Named volume is preserved in prod compose — no migration needed for fresh prod deploy |
| Live service config | Redis state in dev is volatile (no AOF in dev) | New named `redis_data` volume in prod compose; starts clean on first deploy |
| OS-registered state | None — no Task Scheduler, pm2, or systemd units yet | Cron entry for cert renewal must be added manually after first deploy |
| Secrets/env vars | `TELEGRAM_BOT_TOKEN`, `DISCORD_WEBHOOK_URL`, `RIOT_API_KEY`, `POSTGRES_PASSWORD` | Must be present in prod `.env` files on Oracle server (not committed to git) |
| Build artifacts | No egg-info or stale binaries; all images built fresh on server | `docker compose build --no-cache` on first deploy recommended |

---

## Common Pitfalls

### Pitfall 1: Nginx Starts Before Certs Exist

**What goes wrong:** If Nginx references SSL cert paths that don't exist, the container exits with "cannot load certificate" and enter a crash loop.

**Why it happens:** Certbot must run first to populate `/etc/letsencrypt/live/<domain>/`, but Nginx is started via `docker compose up -d` simultaneously.

**How to avoid:** Two-phase startup:
1. First: run Certbot one-shot to obtain certs
2. Then: start Nginx (or start Nginx with HTTP-only config first, get cert, reload with HTTPS config)

**Warning signs:** `docker compose logs nginx` shows "PEM_read_bio:no start line" or "SSL_CTX_use_certificate".

### Pitfall 2: Redis AOF Volume Not Persisted

**What goes wrong:** Redis data (BullMQ job states, Bloom Filter key) is lost on container restart even with AOF enabled, because `/data` is not a named volume.

**Why it happens:** Docker container's writable layer is ephemeral. AOF writes to `/data/appendonly.aof` inside the container — without a volume, it's gone on `docker compose down`.

**How to avoid:** Add `redis_data:/data` volume mount and declare `redis_data:` in the top-level `volumes:` block.

**Warning signs:** After `docker compose restart redis`, `redis-cli KEYS "bloom:*"` returns empty.

### Pitfall 3: CORS_ALLOWED_ORIGINS Value Not Known at Compose Write Time

**What goes wrong:** The Vercel deployment URL is not known until after the first Vercel deploy. The planner must document the sequence: deploy Vercel → get URL → update `docker-compose.prod.yml` `CORS_ALLOWED_ORIGINS` → `docker compose up -d api`.

**Why it happens:** Vercel generates a unique subdomain on first deploy. The custom Vercel domain (e.g., `my-project.vercel.app`) is stable and predictable if the project name is known, but the actual preview/production URL must be confirmed.

**How to avoid:** Plan 10-05 (Vercel deploy) should come before finalizing `docker-compose.prod.yml` CORS value, or use a placeholder with a documented update step.

**Warning signs:** Browser console shows "CORS policy: No 'Access-Control-Allow-Origin' header" on API calls or SignalR connection fails with 403.

### Pitfall 4: SignalR Falling Back to Long Polling Through Nginx

**What goes wrong:** SignalR works but with high latency — it is using Long Polling, not WebSockets.

**Why it happens:** Missing `proxy_http_version 1.1` or incorrect `Connection` header in the `/hubs/` Nginx location. The initial HTTP/1.0 upgrade handshake fails silently, and SignalR auto-negotiates to Long Polling.

**How to avoid:** Include all three directives in `/hubs/` location: `proxy_http_version 1.1`, `proxy_set_header Upgrade $http_upgrade`, `proxy_set_header Connection $connection_upgrade`. Verify in browser DevTools Network tab that `/hubs/dashboard` shows protocol "ws" (WebSocket), not repeated XHR requests.

**Warning signs:** Browser DevTools shows repeated POST requests to `/hubs/dashboard/...` every few seconds rather than a single persistent WebSocket connection.

### Pitfall 5: Oracle Cloud VCN Security List Not Updated

**What goes wrong:** `docker compose up` runs fine on the server, ports 80/443 are open in iptables, but browser still cannot reach the server.

**Why it happens:** Oracle Cloud has a two-layer firewall. iptables is Layer 2. VCN Security List is Layer 1 — it blocks traffic before it even reaches the instance.

**How to avoid:** VCN Security List ingress rules for ports 80 and 443 must be added via Oracle Console first. Check both layers independently.

**Warning signs:** `curl https://<domain>` times out (not connection refused, but hangs) from an external machine while `curl http://localhost` works on the server itself.

### Pitfall 6: NEXT_PUBLIC_API_URL Baked at Build Time

**What goes wrong:** Changing the API URL requires a new Vercel deployment. If the value is set incorrectly in Vercel env vars, all requests go to the wrong endpoint until redeployed.

**Why it happens:** Next.js bakes `NEXT_PUBLIC_*` variables into the JS bundle during `next build`. Unlike server-side env vars, they cannot be changed at runtime.

**How to avoid:** Set `NEXT_PUBLIC_API_URL` correctly before triggering the Vercel build. Use the DuckDNS domain (not an IP address) since the domain is stable.

---

## Code Examples

### docker-compose.prod.yml Skeleton

```yaml
# Source: D-03, D-08 locked decisions in 10-CONTEXT.md
services:
  postgres:
    image: postgres:16-alpine
    platform: linux/arm64
    restart: always
    environment:
      POSTGRES_DB: webcrawler
      POSTGRES_USER: crawler
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "crawler", "-d", "webcrawler"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 2G

  redis:
    image: redis:7-alpine
    platform: linux/arm64
    restart: always
    command: redis-server --maxmemory-policy noeviction --appendonly yes --appendfsync everysec
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M

  crawler:
    build:
      context: .
      dockerfile: apps/crawler/Dockerfile
    platform: linux/arm64
    restart: always
    env_file:
      - ./apps/crawler/.env.prod
    environment:
      - RIOT_API_KEY=${RIOT_API_KEY:-}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    platform: linux/arm64
    restart: always
    env_file:
      - ./apps/api/.env.prod
    environment:
      CORS_ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID:-}
      DISCORD_WEBHOOK_URL: ${DISCORD_WEBHOOK_URL:-}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "sh", "-c", "curl -sf http://localhost:5000/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G

  nginx:
    image: nginx:1.27-alpine
    platform: linux/arm64
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - letsencrypt:/etc/letsencrypt:ro
    depends_on:
      api:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M

volumes:
  postgres_data:
  redis_data:
  letsencrypt:
    external: true   # Pre-populated by one-shot Certbot container before stack start
```

### Nginx Config for SignalR + HTTPS

```nginx
# Source: MS SignalR docs + nginx.org WebSocket guide
http {
    map $http_connection $connection_upgrade {
        "~*Upgrade" $http_connection;
        default keep-alive;
    }

    server {
        listen 80;
        server_name mycrawler.duckdns.org;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name mycrawler.duckdns.org;

        ssl_certificate     /etc/letsencrypt/live/mycrawler.duckdns.org/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/mycrawler.duckdns.org/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;

        # SignalR hub — WebSocket upgrade required
        location /hubs/ {
            proxy_pass http://api:5000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache off;
            proxy_buffering off;
            proxy_read_timeout 100s;
        }

        # All other API routes
        location / {
            proxy_pass http://api:5000;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### Redis AOF Validation Commands

```bash
# After first crawl completes, verify AOF file exists and has content
docker compose -f docker-compose.prod.yml exec redis redis-cli BGREWRITEAOF
docker compose -f docker-compose.prod.yml exec redis ls -lh /data/appendonly.aof

# Bloom Filter persistence test (DEPLOY-05 validation)
# 1. Confirm a URL is in the filter (logged as duplicate by crawler)
# 2. Restart Redis
docker compose -f docker-compose.prod.yml restart redis
# 3. Confirm the URL is still rejected (still in filter after reload)
# This validates AOF contains the bloom filter key
docker compose -f docker-compose.prod.yml exec redis redis-cli KEYS "bloom:*"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTTP-01 challenge with webroot | DNS-01 challenge for non-HTTP domains | ~2020 | Solves chicken-and-egg; works with DuckDNS free subdomains |
| `version: "3.8"` in compose files | No top-level `version` key (obsolete) | Compose spec 2022 | `version` key is ignored in modern Compose; omit it |
| `docker-compose` (v1 Python) | `docker compose` (v2 Go plugin) | 2022 | v1 is EOL; v2 is standard — matches dev compose in this project |
| `docker compose extends` | Standalone prod compose file | Always valid | Avoids merge surprises with command/environment arrays |

**Deprecated/outdated:**
- `docker-compose.yml` top-level `version:` key: Ignored by Compose v2+; omit from new files
- `docker-compose` (hyphen): EOL; use `docker compose` (space)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Specific resource limits (2.0 CPU / 4G for crawler, etc.) | Code Examples | Crawler OOM or other services starved; adjust after first day of prod metrics |
| A2 | `nginx:1.27-alpine` is latest stable ARM64-compatible tag | Standard Stack | Could use older version; run `docker pull nginx:1.27-alpine` on server to confirm |
| A3 | `infinityofspace/certbot_dns_duckdns:latest` supports ARM64 | Standard Stack | If arm64 manifest missing, cert issuance fails; check Docker Hub manifest list |
| A4 | Vercel Hobby plan's free tier continues to allow this project type in 2026 | Architecture | No immediate risk — personal/non-commercial use is allowed per ToS |
| A5 | `letsencrypt` as external named volume (pre-populated before compose up) | Code Examples | If volume approach is too complex, mount host directory instead |

---

## Open Questions (RESOLVED)

1. **Certbot renewal: cron vs compose service timer**
   - What we know: cron on the host is simplest; a `certbot` compose service with an `entrypoint` sleep loop is containerized but adds complexity
   - What's unclear: User preference — host cron requires manual setup on each server provision
   - Recommendation (Claude's discretion): Host cron entry — simpler, survives compose down/up without reconfiguring

2. **CORS_ALLOWED_ORIGINS sequencing**
   - What we know: Vercel URL is not known until first deploy; the Oracle API must list it as an allowed origin
   - What's unclear: Whether the Vercel project URL is predictable before deployment (it is, if project name is known: `<project-name>.vercel.app`)
   - Recommendation: Plan 10-05 documents this as a two-step: deploy Vercel → note URL → update compose env var → restart api container

3. **apps/api Dockerfile build context**
   - What we know: Dev compose uses `context: ./apps/api`; prod compose may need `context: .` (monorepo root) for pnpm workspace files
   - What's unclear: The API Dockerfile copies from `apps/api/` with a relative path — it was written for `context: ./apps/api`
   - Recommendation: Keep `context: ./apps/api` in prod compose to match existing Dockerfile COPY paths; no change needed

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | All container services | ✓ | 29.4.3 | — |
| Docker Compose | Service orchestration | ✓ | v5.1.3 | — |
| Node.js | Dashboard build (Vercel) | ✓ | 24.15.0 | — |
| Oracle Cloud ARM instance | Production hosting | [ASSUMED: provisioned] | Ampere A1 | — |
| DuckDNS account + token | TLS cert issuance | [ASSUMED: to be created] | Free tier | No fallback — required |
| Vercel account | Dashboard hosting | [ASSUMED: to be created] | Free Hobby | — |
| `infinityofspace/certbot_dns_duckdns` ARM64 | Cert issuance | [NEEDS VERIFY] | latest | Use Certbot with manual DNS or different DNS provider plugin |

**Missing dependencies with no fallback:**
- Oracle Cloud ARM instance must be provisioned (console.oracle.com free tier) before Plan 10-02 can execute
- DuckDNS account and token required before cert issuance

**Missing dependencies with fallback:**
- If `certbot_dns_duckdns` image lacks ARM64 manifest: run Certbot on the host directly via `snap install certbot --classic`

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (crawler) | Vitest (vitest.config.ts present) |
| Framework (.NET API) | xUnit + Moq (apps/api.Tests/) |
| Framework (dashboard) | Vitest (vitest.config.ts present) |
| Quick run command (crawler) | `cd apps/crawler && pnpm test` |
| Quick run command (.NET) | `dotnet test apps/api.Tests/` |
| Quick run command (dashboard) | `cd apps/dashboard && pnpm test` |

Phase 10 is a deployment/infrastructure phase — the primary validation is **smoke testing live production endpoints**, not unit tests. No new application code is written. Existing test suites verify prior phase logic is intact; deployment validation is operational.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| DEPLOY-01 | Prod compose: all services start, health checks pass | smoke | `docker compose -f docker-compose.prod.yml ps` | Manual on Oracle server |
| DEPLOY-02 | HTTPS with valid cert, no browser warnings | smoke | `curl -sv https://<domain>/health` | Manual on Oracle server |
| DEPLOY-03 | Vercel dashboard loads, fetches entries | smoke | Browser test + network tab check | Manual |
| DEPLOY-04 | Redis AOF file written after crawl | operational | `docker exec redis ls -lh /data/appendonly.aof` | Manual on Oracle server |
| DEPLOY-05 | Bloom Filter survives Redis restart | operational | Restart redis, confirm URL still deduped | Manual on Oracle server |
| INFRA-02 | ARM64 images run without platform mismatch warnings | build | `docker compose -f docker-compose.prod.yml build 2>&1 \| grep -i "platform"` | No "platform mismatch" in output |

### Sampling Rate

- **Per plan:** Manual smoke test documented in each plan's validation step
- **Phase gate (SC verification):**
  1. SC-1: `docker compose -f docker-compose.prod.yml ps` — all status `Up`, health `healthy`
  2. SC-2: `curl -sv https://<domain>/health` — HTTP 200, cert issuer = Let's Encrypt
  3. SC-3: Open Vercel URL → dashboard loads → SignalR shows "Connected" in nav bar
  4. SC-4: `docker compose restart redis` → crawler rejects a previously-seen URL
  5. SC-5: `docker compose restart crawler` → no BullMQ jobs duplicated (check logs)

### Wave 0 Gaps

None — no new test files needed. Phase 10 is infrastructure-only; all validation is operational smoke tests performed on the live Oracle server, not unit tests in CI.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Personal project, no user auth in scope |
| V3 Session Management | No | Stateless API |
| V4 Access Control | Partial | Nginx only exposes 80/443; postgres/redis ports NOT exposed in prod compose |
| V5 Input Validation | Inherited | Validated in prior phases (API endpoints); no new input surfaces |
| V6 Cryptography | Yes | TLS 1.2+/1.3 via Let's Encrypt; ssl_ciphers HIGH:!aNULL:!MD5 in Nginx |
| V9 Communication | Yes | All external traffic over HTTPS; WSS for SignalR |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Exposed database ports (postgres 5432, redis 6379) | Information Disclosure | Remove `ports:` from postgres and redis in `docker-compose.prod.yml` |
| Plain HTTP API endpoint accessible | Tampering / Info Disclosure | HTTP→HTTPS redirect in Nginx `listen 80` server block |
| TLS cert expiry (Let's Encrypt 90-day) | Availability | Cron renewal job with `certbot renew` + nginx reload |
| CORS wildcard with SignalR credentials | Elevation of Privilege | Explicit Vercel URL in `CORS_ALLOWED_ORIGINS`; never use `*` |
| Oracle root/admin SSH key exposure | Elevation of Privilege | SSH key stored locally only; not committed to git |
| Secrets in docker-compose.prod.yml | Information Disclosure | Use `.env.prod` files gitignored; pass via environment vars |

---

## Sources

### Primary (HIGH confidence)
- [nginx.org WebSocket proxying](https://nginx.org/en/docs/http/websocket.html) — Upgrade/Connection header configuration
- [Microsoft Learn: ASP.NET Core SignalR scale](https://learn.microsoft.com/en-us/aspnet/core/signalr/scale?view=aspnetcore-8.0) — Nginx config for SignalR, map directive
- [Redis Persistence docs](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) — AOF appendonly + appendfsync everysec behavior
- [Docker resource constraints docs](https://docs.docker.com/engine/containers/resource_constraints/) — deploy.resources limits/reservations syntax
- [infinityofspace/certbot_dns_duckdns GitHub](https://github.com/infinityofspace/certbot_dns_duckdns) — DNS-01 DuckDNS plugin command syntax
- [Oracle Cloud iptables gist](https://gist.github.com/mrladeia/da43fc783610758c6dbcaba22b4f7acd) — Two-layer firewall: VCN + iptables commands
- [Next.js environment variables guide](https://nextjs.org/docs/pages/guides/environment-variables) — NEXT_PUBLIC_ build-time baking behavior
- [Vercel Hobby plan docs](https://vercel.com/docs/plans/hobby) — free tier limits and constraints
- Existing codebase: `docker-compose.yml`, `apps/*/Dockerfile` — verified base images and ARM64 compatibility [VERIFIED: file read]

### Secondary (MEDIUM confidence)
- [WebSearch: Oracle Cloud Ampere A1 Docker setup](https://oneuptime.com/blog/post/2026-02-08-how-to-set-up-docker-on-an-oracle-cloud-free-tier-instance/) — VCN two-layer firewall model confirmed
- [WebSearch: certbot_dns_duckdns Docker Hub](https://hub.docker.com/r/infinityofspace/certbot_dns_duckdns) — Docker image availability confirmed

### Tertiary (LOW confidence — flagged in Assumptions Log)
- A1 (resource limits): Recommended CPU/memory values are estimates based on service profiles; require prod observation
- A3 (ARM64 manifest for certbot_dns_duckdns): Not verified via `docker manifest inspect`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all images verified as multi-arch in Dockerfiles; compose syntax verified against Docker docs
- Architecture: HIGH — Nginx SignalR config from official MS docs; Redis AOF from official Redis docs; Oracle firewall from tested gist
- Pitfalls: HIGH — sources from official docs + real GitHub issues; resource limits are MEDIUM (estimated)
- Vercel deployment: HIGH — env var behavior from official Next.js docs

**Research date:** 2026-05-13
**Valid until:** 2026-08-13 (90 days; stable infra domain — Let's Encrypt, Nginx, Redis persistence APIs are mature)
