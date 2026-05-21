# GCP Deployment — Config & Network Guide

Explains how configuration and networking are wired together in the production stack.
Use this as a reference when something breaks or when setting up from scratch.

---

## Architecture Overview

```
Browser / Vercel dashboard
        │ HTTPS (443)
        ▼
   GCP VPC Firewall  ← allows TCP 80 + 443 from 0.0.0.0/0
        │
        ▼
   nginx:1.27-alpine  (container, ports 80+443 on host)
        │ HTTP proxy_pass
        ├──▶ api:5000        (.NET API)
        └──▶ api:5000/hubs   (SignalR WebSocket upgrade)
             │
             ├──▶ postgres:5432
             └──▶ redis:6379

crawler (Node.js)
   └──▶ postgres:5432
   └──▶ redis:6379
```

All services run in a single Docker Compose network (`webcrawler_default`).
Inter-container traffic uses service names as hostnames (e.g. `postgres`, `redis`, `api`).
Only nginx has host ports bound — everything else is internal only.

---

## Environment Variables

### How they flow

Docker Compose reads two sources and merges them (compose `environment:` wins over `env_file:`):

```
--env-file .env.prod          → substitutes ${VAR} placeholders in docker-compose.prod.yml
env_file: apps/api/.env.prod  → injects vars directly into the api container
env_file: apps/crawler/.env.prod → injects vars directly into the crawler container
```

**Always pass `--env-file .env.prod` on every compose command:**
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Without it, `${POSTGRES_PASSWORD}`, `${CORS_ALLOWED_ORIGINS}`, etc. resolve to empty strings.

### Root `.env.prod` — variables and where they go

| Variable | Used by | Purpose |
|----------|---------|---------|
| `POSTGRES_PASSWORD` | postgres container, injected via compose | DB superuser password |
| `CORS_ALLOWED_ORIGINS` | api container `environment:` | Vercel URL allowed for CORS |
| `TELEGRAM_BOT_TOKEN` | api container `environment:` | Notification alerts |
| `TELEGRAM_CHAT_ID` | api container `environment:` | Notification target |
| `DISCORD_WEBHOOK_URL` | api container `environment:` | Notification target |
| `RIOT_API_KEY` | crawler container `environment:` | LoL tier list API |

### `apps/api/.env.prod` — API-specific

| Variable | Value format | Notes |
|----------|-------------|-------|
| `DATABASE_URL` | `Host=postgres;Port=5432;Database=webcrawler;Username=crawler;Password=<pw>` | Username must be `crawler` (matches `POSTGRES_USER` in compose) |

### `apps/crawler/.env.prod` — Crawler-specific

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Same format as API — same password, username `crawler` |
| `REDIS_URL` | `redis://redis:6379` — uses container hostname |
| `FOOTBALL_DATA_API_KEY` | football-data.org token |

---

## Network: GCP Firewall

GCP uses VPC-level firewall rules (no iptables needed on the host).

**Rule created:** `allow-http-https`
- Direction: Ingress
- Source: `0.0.0.0/0`
- Protocols: TCP 80, 443

**Verify the rule is active** (from local machine — not the VM):
```bash
curl --connect-timeout 5 http://34.87.36.185
# "Connection refused" = port is reachable, firewall open, nothing listening
# Timeout = firewall blocking
```

---

## Network: DNS — DuckDNS

**Subdomain:** `webcrawler-myst.duckdns.org` → `34.87.36.185`

DuckDNS provides a free dynamic DNS subdomain. Required because Let's Encrypt
needs a real domain name (IP-only TLS is not supported).

Update the IP if the VM's external IP ever changes:
1. Go to https://www.duckdns.org
2. Update the IP for `webcrawler-myst` → **Update IP**

---

## Network: TLS — Let's Encrypt via DNS-01

Cert is stored in a Docker named volume (`letsencrypt`) and mounted into nginx read-only.

**Issue cert** (one-time, already done):
```bash
docker volume create letsencrypt
export DUCKDNS_DOMAIN=webcrawler-myst.duckdns.org
export DUCKDNS_TOKEN=<32-char-token>
export CERT_EMAIL=nghianguyentrong1211@gmail.com
bash scripts/issue-cert.sh
sed -i "s|<DUCKDNS_DOMAIN>|${DUCKDNS_DOMAIN}|g" nginx/nginx.conf
```

**Cert location inside volume:** `/etc/letsencrypt/live/webcrawler-myst.duckdns.org/`
**Expires:** 2026-08-19 — must renew before then.

**Renew cert** (set up as cron — see below):
```bash
DUCKDNS_TOKEN=<token> bash scripts/renew-cert.sh
docker compose -f docker-compose.prod.yml --env-file .env.prod restart nginx
```

**Renewal cron** (runs twice daily):
```
0 3,15 * * * DUCKDNS_TOKEN=<token> /opt/webcrawler/scripts/renew-cert.sh >> /var/log/cert-renew.log 2>&1
```

---

## nginx Configuration

`nginx/nginx.conf` handles:
- HTTP → HTTPS redirect (port 80 → 301)
- TLS termination (port 443, certs from letsencrypt volume)
- Reverse proxy to API (`proxy_pass http://api:5000`)
- SignalR WebSocket upgrade (`/hubs/` location with `Upgrade` + `Connection` headers)

The `<DUCKDNS_DOMAIN>` placeholder is replaced at deploy time via `sed`.

---

## Docker Compose: Startup Order

Services start in dependency order enforced by healthchecks:

```
postgres ──(healthy)──▶ api
redis    ──(healthy)──▶ api
redis    ──(healthy)──▶ crawler
postgres ──(healthy)──▶ crawler
api      ──(healthy)──▶ nginx
```

nginx only starts after the API is healthy — if the API crashes, nginx won't start.

**Healthchecks:**
| Service | Check |
|---------|-------|
| postgres | `pg_isready -U crawler` |
| redis | `redis-cli ping` |
| crawler | `node -e process.exit(0)` |
| api | `curl -sf http://localhost:5000/health` |
| nginx | `wget -q --spider http://localhost/health` |

Note: `curl` must be installed in the API runtime image (added to Dockerfile).

---

## Common Operations

**Start stack:**
```bash
cd /opt/webcrawler
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

**Rebuild and restart a single service:**
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build api
```

**View logs:**
```bash
docker logs webcrawler-api-1 --tail 50 -f
docker logs webcrawler-crawler-1 --tail 50 -f
```

**Check service health:**
```bash
docker compose -f docker-compose.prod.yml ps
```

**Stop stack (preserves volumes):**
```bash
docker compose -f docker-compose.prod.yml down
```

**Pull latest code and redeploy:**
```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Compose vars blank (empty password) | Missing `--env-file .env.prod` | Add the flag |
| API DB auth failed | `Username=postgres` in `apps/api/.env.prod` | Change to `Username=crawler` |
| API healthcheck failing | `wget`/`curl` not in image | Ensure Dockerfile installs `curl` |
| nginx won't start | API not healthy yet | Fix API first, then `up -d nginx` |
| `git pull` fails: "dubious ownership" | Repo cloned by different user | `git config --global --add safe.directory /opt/webcrawler` |
| External curl times out | GCP firewall rule missing | Add TCP 80+443 ingress rule in VPC Console |
| CORS errors in browser | `CORS_ALLOWED_ORIGINS` not set or wrong | Update root `.env.prod`, force-recreate api |
| SignalR shows Disconnected | nginx missing WebSocket upgrade headers | Check `/hubs/` location block in nginx.conf |
