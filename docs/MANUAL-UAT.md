# Manual UAT Instructions — Phase 08, Phase 09 & Phase 10

This file contains the step-by-step manual tests that cannot be automated: they require
a running backend, a live browser session, or a real cloud deployment.

Complete **Phase 08** tests first, then **Phase 09** (local stack), then **Phase 10** (Oracle Cloud).

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

## Phase 08 — Next.js Dashboard: Alerts & Charts

**Goal:** Alert rule CRUD, notification history log, and volume trend charts all work end-to-end against live API data.

### Prerequisites

```bash
docker compose up -d              # postgres, redis, crawler, api
pnpm --filter dashboard dev       # Next.js on http://localhost:3000
curl http://localhost:5000/health  # {"status":"Healthy"}
```

---

### Test 08-SC1: Alert Rule CRUD

**What to test:** Create, edit, and delete an alert rule; verify form pre-population on edit.

**Steps:**

1. Navigate to `http://localhost:3000/alerts`
2. Click **Add Rule** — the modal opens
3. Select a source from the Source dropdown
4. Set **Condition type** to `New item` — confirm no extra fields appear
5. Enter a name and submit → the new rule appears in the list
6. Click the **edit** icon on the rule:
   - Confirm the form pre-populates with the saved values
   - Confirm the **Source** dropdown is **disabled** (greyed out)
7. Change the condition type to `Field changed` → confirm a **Field path** input appears
8. Change to `Threshold` → confirm both **Field path** and **Threshold value** inputs appear
9. Change back to `New item` → confirm extra inputs disappear
10. Save the edit → list reflects the update
11. Click the **delete** icon → confirmation dialog appears → confirm delete → rule removed from list

**Expected result:**

- All three condition types show/hide fields correctly
- Edit modal pre-populates all fields (including condition sub-fields for `field_changed` / `threshold` rules)
- Source selector is disabled in edit mode
- Optimistic delete: row disappears immediately; if API fails, it reappears

**Pass / Fail:** \***\*\_\_\_\*\***

---

### Test 08-SC2: Notification History

**What to test:** The notifications page shows delivery logs and the source filter works.

**Steps:**

1. Navigate to `http://localhost:3000/notifications`
2. Confirm the table shows columns: **Source**, **Channel**, **Status**, **Message** (truncated), **Sent at**
3. If the table is empty, trigger a crawl that matches an alert rule:
   ```bash
   # Find a failed job ID for your target source, then retry it:
   curl -s "http://localhost:5000/api/jobs?status=failed" | jq '.[0].id'
   # Copy the ID, then:
   curl -X POST http://localhost:5000/api/jobs/<JOB_ID>/retry
   ```
   If no failed jobs exist, wait for the next scheduled crawl (sources run on their configured interval).
   Wait ~10 seconds after the crawl completes, then refresh.
4. Select a source from the **Source** filter dropdown → confirm the table filters to that source only
5. Select **All sources** → confirm all rows return
6. Confirm each row shows one of: `sent` or `failed` in the Status column

**Expected result:**

- At least one notification log row visible after a crawl
- Source filter updates URL params and filters rows without full page reload
- Status badge correctly coloured (green for `sent`, red for `failed`)

**Pass / Fail:** \***\*\_\_PASSED\_\*\***

---

### Test 08-SC3: Volume Charts

**What to test:** The charts page renders entry counts per source over time, with the date range selector working.

**Steps:**

1. Navigate to `http://localhost:3000/charts`
2. Confirm the page loads without error (no red error boundary)
3. Confirm a **line chart** is visible with at least one labelled series (source name in the legend)
4. Confirm a **stacked bar chart** is visible below the line chart
5. Click **30d** in the date range selector → page refetches and charts update
6. Click **90d** → charts update again
7. Click **7d** → returns to default view
8. Hover over a data point → confirm a tooltip appears showing source name, date, and count

**Expected result:**

- Both charts render with real data (not empty) if entries exist in the last 7 days
- Date range selector changes reflect in chart data
- Tooltip shows on hover
- No console errors (check DevTools)

**Pass / Fail:** \_**\_PASSED**\_\*\*\*\*

---

### Test 08-SC4: Chart Data API

**What to test:** The `/api/stats/volume` endpoint returns correctly structured data.

**Steps:**

```bash
# Default 7d range
curl -s "http://localhost:5000/api/stats/volume?groupBy=day&range=7d" | jq '.[0]'

# Expected shape:
# {
#   "sourceId": "...",
#   "sourceName": "...",
#   "date": "2026-05-14",
#   "count": 3
# }

# Test other ranges
curl -s "http://localhost:5000/api/stats/volume?groupBy=day&range=30d" | jq 'length'
curl -s "http://localhost:5000/api/stats/volume?groupBy=day&range=90d" | jq 'length'
```

**Expected result:**

- Response is a JSON array (may be empty `[]` if no entries in range)
- Each element has `sourceId`, `sourceName`, `date` (format `YYYY-MM-DD`), `count`
- HTTP 200 (not 500)

**Pass / Fail:** \***\*\_\_PASSED\_\*\***

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
   # Find a failed job and retry it:
   curl -s "http://localhost:5000/api/jobs?status=failed" | jq '.[0].id'
   # Copy the job ID, then:
   curl -X POST http://localhost:5000/api/jobs/<JOB_ID>/retry
   ```
   Alternatively, wait for the next scheduled crawl (EPL standings every 30 min)
4. Watch the Entries table for ~10 seconds

**Expected result:**

- A new row appears at the **top** of the table within 3 seconds
- The page was **not** refreshed (browser tab title doesn't flash, scroll position unchanged)
- The row contains real data from the crawl

**Pass / Fail:** **\_**PASSED**\_\_**

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

**Pass / Fail:** \***\*\_\_\_\*\***

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

**Pass / Fail:** \***\*\_\_\_\*\***

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

**Pass / Fail:** \***\*\_\_\_\*\***

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

**Pass / Fail:** \***\*\_\_\_\*\***

---

## Sign-Off Checklist

| Phase | Test                                  | Result | Date |
| ----- | ------------------------------------- | ------ | ---- |
| 08    | SC-1: Alert rule CRUD                 |        |      |
| 08    | SC-2: Notification history            |        |      |
| 08    | SC-3: Volume charts                   |        |      |
| 08    | SC-4: Chart data API                  |        |      |
| 09    | SC-1: Live entry push                 |        |      |
| 09    | SC-2: Reconnect and gap recovery      |        |      |
| 09    | SC-3: Connection indicator visual     |        |      |
| 10    | SC-DEPLOY: Full end-to-end smoke test |        |      |
| 10    | WSS: SignalR WebSocket upgrade        |        |      |

Once all rows show **PASS**, phases 08, 09 and 10 are fully signed off.

---

_Generated: 2026-05-14_
_Phase 09 automated score: 9/12 truths verified_
_Phase 10 automated score: 5/5 must-haves verified_
