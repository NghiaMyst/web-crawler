---
status: testing
phase: 10-production-deployment
source: [10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md, 10-04-SUMMARY.md, 10-05-SUMMARY.md, 10-06-SUMMARY.md]
started: 2026-05-21T10:00:00Z
updated: 2026-05-21T10:00:00Z
---

## Current Test

number: 1
name: Cold Start — all services healthy
expected: |
  All 5 services (postgres, redis, crawler, api, nginx) show Status=running and Health=healthy in `docker compose ps`. No service has restarted since startup.
awaiting: user response

## Tests

### 1. Cold Start — all services healthy
expected: All 5 services (postgres, redis, crawler, api, nginx) show Status=running and Health=healthy in `docker compose ps`. No service has restarted since startup.
result: [pending]

### 2. HTTPS health endpoint
expected: |
  Running `curl -s https://webcrawler-myst.duckdns.org/health` from local machine returns a 200 response with JSON body (e.g. `{"status":"ok"}` or similar). No TLS errors.
result: [pending]

### 3. HTTP → HTTPS redirect
expected: |
  Running `curl -sI http://webcrawler-myst.duckdns.org/health` returns `301 Moved Permanently` with a `Location: https://...` header. Plain HTTP is never served.
result: [pending]

### 4. Let's Encrypt cert valid in browser
expected: |
  Opening https://webcrawler-myst.duckdns.org/health in a browser shows the padlock icon (no security warnings). Clicking the padlock shows issuer "Let's Encrypt".
result: [pending]

### 5. Vercel dashboard loads
expected: |
  Opening https://web-crawler-dashboard.vercel.app loads the dashboard UI without a blank screen or JS error. The sources/entries pages are reachable (may show empty data if no crawl has run yet).
result: [pending]

### 6. SignalR shows Connected
expected: |
  On the Vercel dashboard, the nav bar shows "Connected" status indicator. In browser DevTools → Network → WS tab, there is a request to `wss://webcrawler-myst.duckdns.org/hubs/dashboard?id=...` with status `101 Switching Protocols`.
result: [pending]

### 7. No CORS errors
expected: |
  With the Vercel dashboard open, browser DevTools → Console tab shows no CORS errors or mixed-content warnings. API calls to `webcrawler-myst.duckdns.org` succeed (not blocked).
result: [pending]

### 8. SC-4 — Bloom filter survives Redis restart
expected: |
  Running `docker compose restart redis` on the VM, then `bash scripts/verify-bloom-persistence.sh` completes with a PASS result. The bloom filter key is re-loaded from Redis AOF after restart.
result: [pending]

### 9. SC-5 — BullMQ job survival across crawler restart
expected: |
  Running `bash scripts/verify-bullmq-survival.sh` on the VM returns PASS. Jobs in the queue are not lost or duplicated when the crawler container restarts.
result: [pending]

### 10. Cert renewal dry-run
expected: |
  Running the certbot renew dry-run command passes: `docker run --rm -v letsencrypt:/etc/letsencrypt -e DUCKDNS_TOKEN=$DUCKDNS_TOKEN infinityofspace/certbot_dns_duckdns:latest renew --dry-run` outputs "Congratulations, all simulated renewals succeeded".
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps

[none yet]
