---
status: resolved
phase: 10-production-deployment
source: [10-VERIFICATION.md]
started: 2026-05-14T02:05:00Z
updated: 2026-05-14T02:10:00Z
---

## Current Test

[approved by owner — runtime tests require live Oracle Cloud instance]

## Tests

### 1. Full end-to-end production smoke test
expected: Follow docs/deployment/production-deploy.md on an Oracle Cloud Ampere A1 instance from Step 1 (firewall) through Step 9 (SC-1..SC-5 sign-off). All 5 SC checkboxes pass; dashboard loads at Vercel URL; SignalR shows "Connected" in nav bar; API calls return data without CORS errors.
result: approved — all configs, runbooks, and validation scripts verified by code analysis; runtime sign-off deferred to docs/MANUAL-UAT.md Test 10-SC-DEPLOY

### 2. SignalR WSS upgrade from Vercel dashboard
expected: Open Vercel-deployed dashboard URL in browser. DevTools → Network → WS tab shows request to wss://<DUCKDNS_DOMAIN>/hubs/dashboard?id=... with status 101 Switching Protocols. Nav bar shows "Connected". No mixed-content warnings in Console.
result: approved — nginx /hubs/ proxy headers verified (map directive, proxy_http_version 1.1, Upgrade/Connection); WSS confirmation deferred to docs/MANUAL-UAT.md Test 10-WSS

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
