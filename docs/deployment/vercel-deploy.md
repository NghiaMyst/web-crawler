# Vercel Deployment Runbook — Dashboard (Hobby Tier)

The Next.js dashboard runs on Vercel free Hobby tier (D-04). It is NOT in
`docker-compose.prod.yml`. Vercel builds the dashboard from this monorepo and serves
it at `https://<project>.vercel.app`. The dashboard calls the Oracle API over HTTPS
and connects to SignalR via WSS (D-05).

## Prerequisites

- Plan 10-02 cert bootstrap completed; `https://<DUCKDNS_DOMAIN>/health` returns 200
  from an external machine (so the browser can reach the API once CORS is set)
- DuckDNS domain known (e.g., `mycrawler.duckdns.org`)
- GitHub repo for this project pushed and accessible
- Vercel account (sign up free at https://vercel.com — Hobby tier permits personal/
  non-commercial projects per Vercel ToS)

## Step 1 — Connect Repo to Vercel

1. Sign in to https://vercel.com/new
2. Click **Import Git Repository** → select this repo
3. On the project configuration page:
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `apps/dashboard` (CRITICAL — without this, build fails because Vercel runs commands from monorepo root, which has no Next.js project)
   - **Build & Output Settings:** leave defaults (the in-repo `apps/dashboard/vercel.json` overrides them)
   - **Install Command, Build Command, Output Directory:** leave at "Override: off" — `vercel.json` provides them

## Step 2 — Set Environment Variables (Production scope)

Before clicking **Deploy**, set these in **Project Settings → Environment Variables**
(scope: Production):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://<DUCKDNS_DOMAIN>` (e.g., `https://mycrawler.duckdns.org`) |
| `API_URL`             | `https://<DUCKDNS_DOMAIN>` (same value) |

**CRITICAL:** `NEXT_PUBLIC_API_URL` is baked into the JS bundle at build time. If you
set it wrong and deploy, the only fix is to update it here and trigger a **new**
deployment. Runtime env var changes do not affect already-built bundles for
`NEXT_PUBLIC_*` variables.

## Step 3 — Deploy

Click **Deploy**. The first build takes ~2-3 minutes (pnpm install + shared-types
build + Next.js build).

On success, note the **Production URL**:
- Default: `https://<your-project-name>.vercel.app` (stable)
- Also: a unique deploy URL per commit (`https://<project>-<hash>.vercel.app`) — these
  are useful for previews but not the URL the operator pins to CORS

**Record this URL** — it is the input to Plan 10-05 (CORS_ALLOWED_ORIGINS).

## Step 4 — Pre-CORS Smoke Test (expect failure)

Open `https://<your-project-name>.vercel.app` in a browser. Open DevTools → Network
tab. You should see:
- Dashboard HTML loads (Vercel serves it; no API calls yet)
- First API call (e.g., `/api/entries`) → **fails with CORS error** in console:
  `Access to fetch at 'https://<DUCKDNS_DOMAIN>/api/entries' from origin 'https://<your-project-name>.vercel.app' has been blocked by CORS policy`

This failure is **expected** — Plan 10-05 fixes it. Do not skip Step 5.

## Step 5 — CORS Handoff to Oracle (Plan 10-05 executes this)

Plan 10-05's runbook tells the operator to:
1. SSH to the Oracle server
2. Edit `/opt/webcrawler/.env.prod` and set:
   ```
   CORS_ALLOWED_ORIGINS=https://<your-project-name>.vercel.app
   ```
   (Use the stable production URL from Step 3 — NOT a preview deploy URL.)
3. Restart only the API container:
   ```
   docker compose -f docker-compose.prod.yml up -d --force-recreate api
   ```

The api container reads the new env var and updates its CORS policy (Program.cs reads
`CORS_ALLOWED_ORIGINS` per Plan 10-01).

## Step 6 — Post-CORS Validation

Reload `https://<your-project-name>.vercel.app`. Verify:

1. **API fetch works** — Network tab shows `200 OK` on `https://<DUCKDNS_DOMAIN>/api/entries`
   with response body containing entries
2. **SignalR WSS handshake** — Network tab → filter `WS` → look for a request to
   `https://<DUCKDNS_DOMAIN>/hubs/dashboard/negotiate` (returns 200) followed by a
   `wss://<DUCKDNS_DOMAIN>/hubs/dashboard?id=...` connection that shows
   `101 Switching Protocols`
3. **No mixed-content warnings** — Console tab shows no errors about insecure WS or
   mixed content
4. **Connection indicator shows "Connected"** in the nav bar (per Phase 9 D-03)

If SignalR falls back to Long Polling (repeated POST to `/hubs/dashboard/...` every
few seconds instead of a single persistent WebSocket connection), the issue is
server-side: re-check the nginx.conf `/hubs/` location for `proxy_http_version 1.1`,
`Upgrade`, and `Connection` headers (Plan 10-02 Pitfall 4).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Build fails with "Cannot find module @web-crawler/shared-types" | Root Directory not set to apps/dashboard, OR vercel.json buildCommand missing shared-types build step | Verify Step 1 Root Directory; confirm vercel.json buildCommand from Plan 10-03 Task 1 |
| Build succeeds but pages 404 | Output Directory misconfigured | Leave Output Directory in Vercel UI as default; vercel.json sets `.next` |
| CORS errors persist after Plan 10-05 | Vercel URL in CORS_ALLOWED_ORIGINS has trailing slash, OR API container not restarted, OR wrong URL recorded | Re-check Step 5 exact URL; `docker compose -f docker-compose.prod.yml restart api` |
| SignalR shows "Disconnected" / Long Polling | nginx.conf missing upgrade headers OR cert handshake failed | Verify `curl -sv https://<DUCKDNS_DOMAIN>/health` returns 200; re-check Plan 10-02 nginx.conf |
| NEXT_PUBLIC_API_URL change ignored | Already-built bundle still has old value | Trigger redeploy: Vercel Dashboard → Deployments → "Redeploy" on latest |

## Limits to Watch (Hobby Tier)

| Limit | Value | Notes |
|-------|-------|-------|
| Bandwidth | 100 GB / month | Dashboard is small (< 1MB per pageview); ample headroom |
| Build executions | Unlimited | Free deploys |
| Serverless function execution | 100 GB-hours / month | This app uses minimal server functions; mostly static + client fetch |
| Concurrent builds | 1 | Only one deploy at a time — second push queues |

See https://vercel.com/docs/plans/hobby for current limits.
