---
phase: 10-production-deployment
plan: "02"
subsystem: infra
tags: [nginx, tls, letsencrypt, certbot, duckdns, dns-01, websocket, signalr, oracle-cloud, firewall, iptables]

requires:
  - phase: 10-production-deployment/10-01
    provides: docker-compose.prod.yml with nginx service, letsencrypt external volume declaration

provides:
  - nginx/nginx.conf with HTTP->HTTPS redirect, SignalR-correct /hubs/ WebSocket upgrade, TLS 1.2+/1.3
  - scripts/issue-cert.sh for one-shot DNS-01 cert issuance via DuckDNS
  - scripts/renew-cert.sh for cron-friendly renewal + nginx reload
  - docs/deployment/oracle-firewall.md for two-layer Oracle VCN + iptables firewall setup
  - docs/deployment/cert-bootstrap.md for bootstrap order (DNS-01 before nginx start)

affects:
  - 10-05-production-deploy (executes all artifacts; must substitute <DUCKDNS_DOMAIN> placeholder)

tech-stack:
  added:
    - nginx:1.27-alpine (reverse proxy with TLS termination)
    - infinityofspace/certbot_dns_duckdns:latest (DNS-01 cert issuance for DuckDNS)
  patterns:
    - "map $http_connection $connection_upgrade for correct SignalR WebSocket upgrade (avoids Long Polling fallback)"
    - "DNS-01 challenge bypasses HTTP-01 chicken-and-egg: cert issued before nginx starts"
    - "Two-layer Oracle firewall: VCN Security List (Layer 1) + host iptables (Layer 2)"
    - "<DUCKDNS_DOMAIN> literal placeholder in nginx.conf forces operator substitution before nginx start"

key-files:
  created:
    - nginx/nginx.conf
    - scripts/issue-cert.sh
    - scripts/renew-cert.sh
    - docs/deployment/oracle-firewall.md
    - docs/deployment/cert-bootstrap.md
  modified: []

key-decisions:
  - "map $http_connection $connection_upgrade used (not hardcoded Connection: upgrade) per official MS SignalR docs to handle both WS and regular HTTP correctly"
  - "DNS-01 with DuckDNS plugin chosen over HTTP-01 to eliminate nginx chicken-and-egg bootstrap problem"
  - "<DUCKDNS_DOMAIN> is a literal placeholder string (not a shell variable) — nginx fails to load with it, intentionally forcing substitution in Plan 10-05"
  - "Host cron chosen over compose service for cert renewal — simpler, survives compose down/up"
  - "letsencrypt external Docker volume pre-populated by issue-cert.sh before docker compose up (not a bind-mount)"

patterns-established:
  - "Pattern: SignalR Nginx proxy always uses map directive + proxy_http_version 1.1 + Upgrade + Connection headers in /hubs/ location"
  - "Pattern: DNS-01 cert bootstrap always runs issue-cert.sh before any docker compose up with TLS"

requirements-completed: [DEPLOY-02, INFRA-02]

duration: 15min
completed: 2026-05-13
---

# Phase 10 Plan 02: Nginx Config, Certbot Scripts, and Deployment Runbooks Summary

**Nginx reverse proxy with DNS-01 TLS via DuckDNS certbot plugin, SignalR-correct WebSocket upgrade using map directive, and two-layer Oracle Cloud firewall + cert bootstrap runbooks**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-13T13:45:00Z
- **Completed:** 2026-05-13T13:49:42Z
- **Tasks:** 3
- **Files modified:** 5 created

## Accomplishments

- nginx/nginx.conf authored with `map $http_connection $connection_upgrade` (the exact MS SignalR-recommended directive), HTTP->HTTPS redirect on port 80, TLS 1.2+/1.3 with modern ciphers, `/hubs/` WebSocket upgrade location, and `<DUCKDNS_DOMAIN>` literal placeholder
- scripts/issue-cert.sh and scripts/renew-cert.sh created as executable bash scripts using DNS-01 via `infinityofspace/certbot_dns_duckdns` Docker image; both reference the `letsencrypt` external volume; renew script reloads nginx post-renewal
- docs/deployment/oracle-firewall.md covers both Oracle Cloud firewall layers (VCN Security List via console + host iptables with persistence) with nmap verification steps
- docs/deployment/cert-bootstrap.md explains DNS-01 rationale (chicken-and-egg bypass), 4-step bootstrap order, renewal cron entry, and troubleshooting table

## Task Commits

Each task was committed atomically:

1. **Task 1: nginx/nginx.conf with SignalR WebSocket upgrade and HTTPS** - `5dd6e98` (feat)
2. **Task 2: Certbot issuance and renewal scripts (DNS-01 DuckDNS)** - `2dd3564` (feat)
3. **Task 3: Oracle firewall and cert bootstrap runbooks** - `25d3133` (feat)

## Files Created/Modified

- `nginx/nginx.conf` - Full nginx config: HTTP->HTTPS redirect, /hubs/ WS upgrade with map directive, TLS 1.2+/1.3, ssl_ciphers HIGH:!aNULL:!MD5, proxy to api:5000
- `scripts/issue-cert.sh` - One-shot cert issuance via DNS-01/DuckDNS plugin; creates letsencrypt volume if missing; validates env vars
- `scripts/renew-cert.sh` - Cron-friendly renewal; reloads nginx via docker compose exec; DUCKDNS_TOKEN from env only
- `docs/deployment/oracle-firewall.md` - Two-layer Oracle Cloud firewall runbook: VCN Security List ingress rules + iptables persistent commands; troubleshooting table
- `docs/deployment/cert-bootstrap.md` - DNS-01 bootstrap order: create volume -> issue cert -> sed substitute domain -> compose up; renewal cron entry; troubleshooting table

## Decisions Made

- Used `map $http_connection $connection_upgrade` (not hardcoded `Connection: upgrade`) per official Nginx + MS SignalR docs. Default fallback `keep-alive` prevents regular HTTP requests from receiving an upgrade header and breaking.
- `<DUCKDNS_DOMAIN>` is a literal placeholder (not a shell variable). Nginx will refuse to load if it encounters it — this forces the operator to run the `sed -i` substitution step before starting the stack. Documented in cert-bootstrap.md.
- DNS-01 challenge via DuckDNS plugin selected over HTTP-01: no running web server required, completely bypasses the chicken-and-egg bootstrap ordering problem.
- Host cron entry chosen over a compose `certbot` service with sleep loop: simpler, survives `docker compose down/up` without reconfiguration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed apostrophe from bash parameter expansion error message**
- **Found during:** Task 2 (issue-cert.sh bash -n syntax check)
- **Issue:** `Let's` in error message string `"${CERT_EMAIL:?Set CERT_EMAIL (for Let's Encrypt expiry notifications)}"` caused `bash -n` to fail with "unexpected EOF while looking for matching `'`"
- **Fix:** Changed to `Lets Encrypt` (no apostrophe) in the `:?` error message on line 9 of issue-cert.sh
- **Files modified:** scripts/issue-cert.sh
- **Verification:** `bash -n` succeeds after the fix
- **Committed in:** 2dd3564 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minimal — only affects the error message text displayed if CERT_EMAIL env var is unset. No functional change to cert issuance behavior.

## Issues Encountered

- Bash shell interpolation of `$http_connection` and `$host` in grep verification commands caused false failures; verified content with simplified grep patterns instead. Not a file issue — purely a test command quoting issue.

## Known Stubs

None — all files are production-ready configuration and scripts. The `<DUCKDNS_DOMAIN>` placeholder in nginx/nginx.conf is intentional (documented in cert-bootstrap.md), not a stub.

## Threat Surface Scan

No new network endpoints introduced. Files created are configuration/scripts only. The nginx.conf implements T-10-06 through T-10-09 mitigations as designed:
- T-10-06: `ssl_protocols TLSv1.2 TLSv1.3` + `ssl_ciphers HIGH:!aNULL:!MD5`
- T-10-07: `listen 80` returns 301 -> HTTPS
- T-10-08: DuckDNS token read from env vars only; never hardcoded in any script
- T-10-09: `map $http_connection $connection_upgrade` + `proxy_http_version 1.1` + Upgrade/Connection headers

## User Setup Required

Plan 10-05 must:
1. Run `docker volume create letsencrypt` (one-time)
2. Export `DUCKDNS_DOMAIN`, `DUCKDNS_TOKEN`, `CERT_EMAIL` and run `./scripts/issue-cert.sh`
3. Run `sed -i "s/<DUCKDNS_DOMAIN>/${DUCKDNS_DOMAIN}/g" nginx/nginx.conf`
4. Then `docker compose -f docker-compose.prod.yml up -d`
5. Install cron entry for cert renewal (documented in cert-bootstrap.md)

## Next Phase Readiness

- Plan 10-05 has all artifacts needed to execute the full production deployment
- Oracle firewall runbook is self-contained; operator can follow step-by-step
- Cert bootstrap runbook unambiguous; explains both why DNS-01 is needed and the exact execution order

---
*Phase: 10-production-deployment*
*Completed: 2026-05-13*
