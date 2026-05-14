# Manual UAT Instructions — Phase 09 & Phase 10

This file contains the step-by-step manual tests that cannot be automated: they require
a running backend, a live browser session, or a real cloud deployment.

Complete **Phase 09** tests first (local stack), then **Phase 10** tests (Oracle Cloud).

---

## Prerequisites

### For Phase 09 tests (local)

All services running locally:
```bash
docker compose up -d          # postgres, redis, crawler, api
pnpm --filter dashboard dev   # Next.js dashboard on http://localhost:3000
```

Verify the stack is healthy:
```bash
docker compose ps             # all services "running"
curl http://localhost:5000/health  # {"status":"Healthy"}
```

### For Phase 10 tests (Oracle Cloud)

Complete production deployment first:
- Follow `docs/deployment/production-deploy.md` from Step 0 to Step 9
- Ensure Vercel dashboard is deployed and `CORS_ALLOWED_ORIGINS` is set to the Vercel URL

---

## Phase 09 — Real-Time Dashboard Integration

**Goal:** New data entries appear in the data table in real time without a page refresh.

### Test 09-SC1: Live Entry Push

**What to test:** A new crawl result appears at the top of the Entries table within ~3 seconds, pushed via SignalR WebSocket — no page refresh.

**Steps:**
1. Open the dashboard in a browser: `http://localhost:3000/entries`
2. Confirm the ConnectionDot in the sidebar shows a **green dot** (Connected)
3. Trigger a crawl via the API:
   ```bash
   curl -s http://localhost:5000/api/sources | jq '.[0].id'
   # Copy the source ID, then:
   curl -X POST http://localhost:5000/api/jobs \
     -H 'Content-Type: application/json' \
     -d '{"sourceId": "<PASTE_ID_HERE>"}'
   ```
   Alternatively, wait for the next scheduled crawl (EPL standings every 30 min)
4. Watch the Entries table for ~10 seconds

**Expected result:**
- A new row appears at the **top** of the table within 3 seconds
- The page was **not** refreshed (browser tab title doesn't flash, scroll position unchanged)
- The row contains real data from the crawl

**Pass / Fail:** _____PASSED______

---

### Test 09-SC2: Reconnect and Gap Recovery

**What to test:** SignalR auto-reconnects after a network interruption and recovers missed entries.

**Steps:**
1. Open the dashboard at `http://localhost:3000/entries`
2. Confirm ConnectionDot is **green** (Connected)
3. Trigger a crawl right now so there is a baseline timestamp:
   ```bash
   date -u +"%Y-%m-%dT%H:%M:%SZ"   # note this timestamp
   ```
4. Simulate a network disconnect — choose one method:
   - **WiFi:** disable your WiFi adapter for 15–20 seconds, then re-enable
   - **Docker:** `docker compose stop api` → wait 15 sec → `docker compose start api`
5. Watch the ConnectionDot and toast notifications

**Expected result:**
- ConnectionDot transitions: **green → yellow pulsing** (Reconnecting) **→ green** (Connected)
- A toast appears at the bottom-right:
  - `"Reconnected — loaded N missed entries"` if crawls ran during the gap, OR
  - `"Reconnected — no missed entries"` if nothing was crawled
- Any entries published during the gap appear in the table after reconnect

**Pass / Fail:** ___________

---

### Test 09-SC3: Connection Indicator Visual Rendering

**What to test:** The ConnectionDot renders correctly in both desktop sidebar and mobile header across all three states.

**Steps:**
1. Open the dashboard at `http://localhost:3000`
2. **Desktop (Connected state):**
   - Confirm a small **green dot** is visible immediately to the right of the "Web Crawler" brand text in the left sidebar
   - Open DevTools → Elements → find `<span role="status">` → confirm `aria-label="Connected"`
3. **Mobile view (Connected state):**
   - Toggle DevTools device toolbar (Ctrl+Shift+M / Cmd+Shift+M) to a mobile viewport
   - Confirm the green dot appears in the top navigation bar next to "Web Crawler"
4. **Disconnected state:**
   - Run `docker compose stop api`
   - Wait up to 40 seconds (reconnect policy retries at 0s, 2s, 10s, 30s)
   - Confirm dot turns **red** and `aria-label="Disconnected"` in DevTools
5. **Reconnecting state (brief window):**
   - `docker compose start api` while watching the dot
   - During reconnect attempt, dot should flash **yellow with pulse animation** (`animate-pulse`)
   - `docker compose start api` immediately to confirm it returns green

**Expected result:**
- Connected: green dot (`bg-green-500`), `aria-label="Connected"`
- Reconnecting: yellow pulsing dot (`bg-yellow-400 animate-pulse`), `aria-label="Reconnecting"`
- Disconnected: red dot (`bg-red-500`), `aria-label="Disconnected"`
- Dot visible in both desktop sidebar AND mobile nav header

**Pass / Fail:** ___________

---

## Phase 10 — Production Deployment

**Goal:** Full system runs 24/7 on Oracle Cloud ARM behind HTTPS, dashboard on Vercel, Redis/Bloom Filter state survives restarts.

### Test 10-SC-DEPLOY: Full End-to-End Smoke Test

**What to test:** All five SC checkboxes in `docs/deployment/production-deploy.md` pass on real Oracle Cloud hardware.

**Steps:**
Follow `docs/deployment/production-deploy.md` exactly, from Step 0 (preflight) through Step 9 (sign-off). The key checkpoints:

**Step 0 — Preflight:**
```bash
bash scripts/preflight-prod-compose.sh
# Expected: "All 19 checks passed"
```

**Step 5 — Bring up stack:**
```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
# Expected: all 5 services "running", no restarts
```

**SC-1 — Health check through Nginx:**
```bash
curl -I https://<DUCKDNS_DOMAIN>/health
# Expected: HTTP/2 200, header "X-Powered-By: ASP.NET" absent (proxied), no cert warnings
```

**SC-2 — HTTPS with valid cert:**
- Open `https://<DUCKDNS_DOMAIN>` in browser
- Expected: padlock icon, no "Not Secure" warning, cert issued by Let's Encrypt

**SC-3 — Dashboard loads with real data:**
- Open Vercel URL in browser
- Navigate to `/entries`
- Expected: table populated with entries fetched from `https://<DUCKDNS_DOMAIN>/api/entries`

**SC-4 — Bloom Filter survives Redis restart:**
```bash
# Trigger a crawl first (so bloom filter has state):
curl -X POST https://<DUCKDNS_DOMAIN>/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{"sourceId": "<SOURCE_ID>"}'
sleep 30   # wait for crawl to complete and bloom filter to be populated

# Then run the validation script:
./scripts/verify-bloom-persistence.sh
# Expected: "[verify-bloom] PASS — N bloom keys preserved with identical sizes"
```

**SC-5 — BullMQ jobs survive crawler restart:**
```bash
./scripts/verify-bullmq-survival.sh
# Expected: "[verify-bullmq] PASS — N bull keys present, all :id counters monotonic"
```

**Expected result:** All 5 SC checkboxes ticked in the runbook.

**Pass / Fail:** ___________

---

### Test 10-WSS: SignalR WebSocket Upgrade (Vercel → Oracle)

**What to test:** The Vercel dashboard connects to the Oracle API over WSS (not Long Polling), confirming the Nginx `/hubs/` proxy is correctly configured.

**Steps:**
1. Open the Vercel-deployed dashboard URL in Chrome/Firefox
2. Open DevTools → **Network** tab → filter by **WS** (WebSocket)
3. Refresh the page
4. Look for a WebSocket entry to `wss://<DUCKDNS_DOMAIN>/hubs/dashboard?id=...`

**Expected result:**
- Status: **101 Switching Protocols** (not 200)
- Protocol: **websocket** (not long-polling)
- The ConnectionDot in the nav bar shows **green** within 5 seconds
- No mixed-content warnings in DevTools Console
- No CORS errors in Console

**Pass / Fail:** ___________

---

## Sign-Off Checklist

| Phase | Test | Result | Date |
|-------|------|--------|------|
| 09 | SC-1: Live entry push | | |
| 09 | SC-2: Reconnect and gap recovery | | |
| 09 | SC-3: Connection indicator visual | | |
| 10 | SC-DEPLOY: Full end-to-end smoke test | | |
| 10 | WSS: SignalR WebSocket upgrade | | |

Once all rows show **PASS**, phases 09 and 10 are fully signed off.

---

*Generated: 2026-05-14*
*Phase 09 automated score: 9/12 truths verified*
*Phase 10 automated score: 5/5 must-haves verified*
