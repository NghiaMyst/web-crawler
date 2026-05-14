# Production Deployment Runbook — Phase 10

Master runbook for first-time deployment of the Web Crawler system to Oracle Cloud
Ampere A1 (ARM64) with the dashboard on Vercel free tier. Follow steps top-to-bottom.
Each step references a supporting document with detailed substeps.

**Deploy root convention:** This runbook assumes the project is checked out at
`/opt/webcrawler` on the Oracle server. Substitute your actual path where shown.

## Pre-Deploy Checklist

Before SSH-ing to the Oracle server, complete these from your laptop / dev machine:

- [ ] Oracle Cloud Ampere A1 instance provisioned (4 vCPU, 24GB RAM, Ubuntu 22.04+)
- [ ] SSH access to the instance verified
- [ ] DuckDNS subdomain registered and pointing to the Oracle public IP
      (https://www.duckdns.org → record the 32-character token)
- [ ] Vercel account created (https://vercel.com — Hobby free tier)
- [ ] GitHub repo for this project accessible to Vercel
- [ ] On your laptop: run `bash scripts/preflight-prod-compose.sh` — must PASS

## Step 0 — Preflight (laptop)

From the repo root on your laptop:
```bash
bash scripts/preflight-prod-compose.sh
```
Expected: `[preflight] PASS — docker-compose.prod.yml + Program.cs satisfy Phase 10 invariants`.
If FAIL, fix the regressions before committing/pushing.

## Step 1 — Oracle Firewall (Oracle Console + SSH)

See: `docs/deployment/oracle-firewall.md`

Summary:
1. **VCN Security List** (Oracle Console): Add ingress rules for TCP 80 and TCP 443
   from 0.0.0.0/0.
2. **Host iptables** (SSH): `sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT` and
   `--dport 443`; install `iptables-persistent`; `sudo netfilter-persistent save`.

Verify (from your laptop, NOT the Oracle server):
```bash
nmap -p 80,443 <oracle-public-ip>
# Expected: 80/tcp closed and 443/tcp closed (NOT filtered — proves VCN allows SYN).
```

## Step 2 — Clone Repo on Oracle Server

SSH to the Oracle server:
```bash
ssh ubuntu@<oracle-public-ip>
sudo mkdir -p /opt/webcrawler && sudo chown ubuntu:ubuntu /opt/webcrawler
cd /opt/webcrawler
git clone <repo-url> .
git checkout <branch-with-phase-10>
```

Run preflight on the server too:
```bash
bash scripts/preflight-prod-compose.sh
```

## Step 3 — Populate .env.prod Files

Copy each example template and fill in real values. **NEVER** commit the `.env.prod`
files (already in .gitignore from Plan 10-01).

```bash
cp .env.prod.example .env.prod
cp apps/api/.env.prod.example apps/api/.env.prod
cp apps/crawler/.env.prod.example apps/crawler/.env.prod
```

Edit `/opt/webcrawler/.env.prod`:
- `POSTGRES_PASSWORD`: strong unique password
- `CORS_ALLOWED_ORIGINS`: leave as placeholder `https://CHANGE_ME.vercel.app` for now — Step 6 updates it
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`: from Phase 4 secrets
- `RIOT_API_KEY`: optional, from Riot dev portal

Edit `apps/api/.env.prod`:
- `ConnectionStrings__DefaultConnection`: replace `CHANGE_ME_STRONG_PASSWORD` with the same value used in root `.env.prod`

Edit `apps/crawler/.env.prod`:
- `DATABASE_URL`: replace `CHANGE_ME_STRONG_PASSWORD` with the same Postgres password
- `FOOTBALL_DATA_API_KEY`: your football-data.org token

Verify nothing leaks:
```bash
git status
# Expected: no .env.prod files listed (only .env.prod.example, which is committed)
```

## Step 4 — Issue Let's Encrypt Cert (DNS-01 via DuckDNS)

See: `docs/deployment/cert-bootstrap.md`

Summary:
```bash
docker volume create letsencrypt

export DUCKDNS_DOMAIN=mycrawler.duckdns.org
export DUCKDNS_TOKEN=<your-32-char-token>
export CERT_EMAIL=you@example.com
./scripts/issue-cert.sh

# Substitute the placeholder in nginx.conf with the real domain.
sed -i "s|<DUCKDNS_DOMAIN>|${DUCKDNS_DOMAIN}|g" nginx/nginx.conf
```

Verify:
```bash
docker run --rm -v letsencrypt:/etc/letsencrypt alpine ls /etc/letsencrypt/live/${DUCKDNS_DOMAIN}/
# Expected: cert.pem, chain.pem, fullchain.pem, privkey.pem
```

## Step 5 — Vercel Deploy (do this BEFORE bringing up the Oracle API)

See: `docs/deployment/vercel-deploy.md`

Summary:
1. Vercel Dashboard → Import this repo → set Root Directory `apps/dashboard`
2. Set env vars (Production scope):
   - `NEXT_PUBLIC_API_URL=https://${DUCKDNS_DOMAIN}`
   - `API_URL=https://${DUCKDNS_DOMAIN}`
3. Click **Deploy**. Wait ~3 minutes.
4. **Record the Production URL** — `https://<your-project-name>.vercel.app`

> **CORS sequencing constraint:** This Vercel deploy MUST happen before Step 6.
> The recorded Vercel URL is the input to `CORS_ALLOWED_ORIGINS`.

## Step 6 — CORS Handoff: Update .env.prod with Vercel URL

On the Oracle server, edit `/opt/webcrawler/.env.prod`:
```
CORS_ALLOWED_ORIGINS=https://<your-project-name>.vercel.app
```
(Exact URL from Step 5. No trailing slash. Single origin.)

Verify:
```bash
grep CORS_ALLOWED_ORIGINS /opt/webcrawler/.env.prod
# Expected: CORS_ALLOWED_ORIGINS=https://<your-project-name>.vercel.app  (no CHANGE_ME)
```

## Step 7 — First Stack Up

From `/opt/webcrawler/` on the Oracle server:
```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

Initial build takes ~5-10 minutes on Ampere A1 (Playwright base image is large).

Wait for all services healthy:
```bash
watch -n 2 docker compose -f docker-compose.prod.yml ps
# Wait until all services show Status=running and Health=healthy.
```

## Step 8 — Install Cert Renewal Cron

See: `docs/deployment/cert-bootstrap.md` → Renewal section.

```bash
crontab -e
# Add:
0 3,15 * * * DUCKDNS_TOKEN=<your-token> /opt/webcrawler/scripts/renew-cert.sh >> /var/log/cert-renew.log 2>&1
```

Dry-run test:
```bash
DUCKDNS_TOKEN=<your-token> docker run --rm -v letsencrypt:/etc/letsencrypt \
  -e DUCKDNS_TOKEN=$DUCKDNS_TOKEN \
  infinityofspace/certbot_dns_duckdns:latest renew --dry-run
# Expected: "Congratulations, all simulated renewals succeeded"
```

## Step 9 — ROADMAP SC-1..SC-5 Sign-Off

Run each verification. Mark the box only when the expected output matches.

### SC-1: `docker compose up` brings up all services healthy, no restarts within 5 min

On the Oracle server:
```bash
docker compose -f docker-compose.prod.yml ps
sleep 300
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml events --since 5m | grep -i "restart\|exit\|kill" || echo "no restart events in last 5min"
```
Pass: all services Status=running, Health=healthy in both `ps` outputs; no restart/exit events.

- [ ] **SC-1 PASS**

### SC-2: HTTPS with valid Let's Encrypt cert, no browser warnings

From your laptop:
```bash
curl -sI https://${DUCKDNS_DOMAIN}/health
# Expected first line: HTTP/1.1 200 OK or HTTP/2 200

curl -sv https://${DUCKDNS_DOMAIN}/health 2>&1 | grep -E "SSL certificate verify ok|issuer:"
# Expected: SSL certificate verify ok AND issuer: ... Let's Encrypt ...

curl -sI http://${DUCKDNS_DOMAIN}/health
# Expected: HTTP/1.1 301 Moved Permanently  (HTTP -> HTTPS redirect)
```
Browser test: open `https://${DUCKDNS_DOMAIN}/health` — no security warnings.

- [ ] **SC-2 PASS**

### SC-3: Vercel dashboard loads + SignalR WSS works

From your laptop browser, open `https://<your-project-name>.vercel.app`.

1. DevTools → Network tab — Page loads; `/api/entries` returns 200
2. DevTools → Network tab → filter `WS` — see request to
   `wss://${DUCKDNS_DOMAIN}/hubs/dashboard?id=...` with status `101 Switching Protocols`
3. Nav bar shows **Connected** (per Phase 9 D-03)
4. Console tab — no CORS or mixed-content errors

- [ ] **SC-3 PASS**

### SC-4: Bloom Filter survives `docker compose restart redis`

First, trigger at least one crawl so the bloom filter has state:
```bash
curl -X POST https://${DUCKDNS_DOMAIN}/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{"sourceId": "<a-source-uuid-from-/api/sources>"}'
sleep 30  # wait for crawl to complete
```

Then:
```bash
cd /opt/webcrawler
./scripts/verify-redis-aof.sh        # DEPLOY-04 AOF presence
./scripts/verify-bloom-persistence.sh # DEPLOY-05 bloom survives restart
```
See `docs/deployment/persistence-validation.md` for failure triage.

- [ ] **SC-4 PASS**

### SC-5: `docker compose restart crawler` does not duplicate or lose in-flight jobs

```bash
cd /opt/webcrawler
./scripts/verify-bullmq-survival.sh
```
See `docs/deployment/persistence-validation.md` for failure triage.

- [ ] **SC-5 PASS**

## Step 10 — Mark Phase 10 Complete

All 5 SCs pass → update `.planning/ROADMAP.md`:
- Change `- [ ] **Phase 10: Production Deployment**` → `- [x] **Phase 10: Production Deployment**`
- Add completion date in the Phases list and Progress table

Commit + push:
```bash
git add .planning/ROADMAP.md
git commit -m "docs(10): mark Phase 10 complete after production deploy sign-off"
git push
```

## Rollback

If a deploy goes wrong and SC fails:

```bash
# Stop the stack but keep volumes (data preserved).
docker compose -f docker-compose.prod.yml down

# Roll back the repo to the last known-good commit.
cd /opt/webcrawler
git log --oneline | head -10
git checkout <last-known-good-sha>

# Re-deploy from the rolled-back state.
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

Volumes (`postgres_data`, `redis_data`, `letsencrypt`) are preserved across `down` —
only `down -v` deletes them. **NEVER run `down -v` in production** unless you have a
Postgres backup AND can re-issue the cert AND can re-warm the bloom filter.

## Troubleshooting Quick Reference

| Symptom | Step | Doc |
|---------|------|-----|
| `docker compose up` fails: `volume letsencrypt not found` | Re-run Step 4 (cert bootstrap) | cert-bootstrap.md |
| nginx exits: `cannot load certificate ... <DUCKDNS_DOMAIN>` | Step 4 `sed` substitution skipped | cert-bootstrap.md |
| External `curl` times out | Step 1 VCN rule missing | oracle-firewall.md |
| External `curl` returns connection refused | Step 1 iptables rule missing OR nginx not running | oracle-firewall.md |
| Browser shows CORS error | Step 6 not done OR api container not restarted with new env | vercel-deploy.md |
| SignalR shows "Disconnected" | nginx /hubs/ upgrade headers missing | cert-bootstrap.md |
| Bloom filter empty after redis restart | redis_data volume missing in compose | persistence-validation.md |
| NEXT_PUBLIC_API_URL change ignored | Re-trigger Vercel deploy (build-time bake) | vercel-deploy.md |
