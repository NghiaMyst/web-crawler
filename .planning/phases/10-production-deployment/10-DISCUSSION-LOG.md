# Phase 10: Production Deployment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 10-production-deployment
**Areas discussed:** Reverse proxy, Image build strategy, Domain & HTTPS setup, Vercel dashboard wiring

---

## Reverse Proxy

| Option | Description | Selected |
|--------|-------------|----------|
| Caddy | Automatic Let's Encrypt, zero cert renewal config, single Caddyfile | |
| Nginx + Certbot | Manual cert renewal via cron/container, more config, well-documented | ✓ |
| Nginx Proxy Manager | GUI-based, auto-renew, adds another service to maintain | |

**User's choice:** Nginx + Certbot, running inside Docker Compose (not on host directly)

---

## Image Build Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Build on Oracle server directly | SSH + git pull + docker compose build; native ARM build; no registry | ✓ |
| GitHub Actions → Docker Hub/GHCR | CI builds multi-arch images, server does docker pull; more overhead | |

**User's choice:** Build on Oracle server directly

---

## Domain & HTTPS Setup

| Option | Description | Selected |
|--------|-------------|----------|
| Custom domain | Let's Encrypt with owned domain | |
| IP only | No TLS; doesn't satisfy ROADMAP SC-2 | |
| Free DuckDNS subdomain | Free forever, Let's Encrypt-compatible, satisfies SC-2 | ✓ |

**User's choice:** DuckDNS free subdomain (user has no custom domain yet)
**Notes:** Let's Encrypt requires a real domain — IP-only would fail SC-2. DuckDNS is the recommended free option.

---

## Vercel Dashboard Wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel only, remove from prod Compose | Clean separation: dashboard on Vercel, infra on Oracle | ✓ |
| Keep in Compose as fallback | Extra complexity, no benefit for personal project | |

**User's choice:** Vercel only — dashboard service removed from docker-compose.prod.yml

**API URL / WSS:**
- `NEXT_PUBLIC_API_URL` = `https://<duckdns-domain>`
- SignalR connects via WSS (required: Vercel is HTTPS, mixed-content rules block WS)

**CORS config:**
- CORS allowed origins set via `CORS_ALLOWED_ORIGINS` environment variable (not hardcoded)
- Value will be the Vercel deployment URL once known

---

## Claude's Discretion

- Exact Nginx config structure (server blocks, proxy_pass details)
- Certbot renewal approach (cron vs Docker timer)
- Resource limits per service in prod compose
- Oracle Cloud VCN + iptables firewall documentation format

## Deferred Ideas

None.
