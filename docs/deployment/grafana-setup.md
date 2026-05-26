# Grafana Setup Guide

After deploying with `docker compose up -d` (including prometheus and grafana services),
follow these steps to complete the Grafana setup.

## Step 1: Add GRAFANA_ADMIN_PASSWORD to .env.prod on the VM

SSH into the GCE VM and edit `/opt/webcrawler/.env.prod`:
```bash
echo "GRAFANA_ADMIN_PASSWORD=<your-secure-password>" >> /opt/webcrawler/.env.prod
# Or set GRAFANA_ADMIN_USER if you want a different admin username:
echo "GRAFANA_ADMIN_USER=admin" >> /opt/webcrawler/.env.prod
```

Do this BEFORE running `docker compose up -d grafana` for the first time.
If Grafana starts without GRAFANA_ADMIN_PASSWORD, the container will error.

## Step 2: Create the .htpasswd file for nginx basic auth

The nginx config protects `/grafana/` with HTTP basic auth via `.htpasswd`.
Create the file on your local machine and copy it to the VM:

```bash
# Option A — using apache2-utils (install if needed: sudo apt install apache2-utils):
htpasswd -c monitoring/grafana/.htpasswd grafana_admin
# Enter password when prompted

# Option B — using Docker (no local install needed):
docker run --rm httpd htpasswd -nb grafana_admin <password> > monitoring/grafana/.htpasswd

# Copy to VM:
scp monitoring/grafana/.htpasswd nghianguyentrong1211@34.87.36.185:/opt/webcrawler/monitoring/grafana/.htpasswd
```

> Note: `.htpasswd` is in `.gitignore` — never commit it.

> **Precondition warning**: The nginx service bind-mounts `./monitoring/grafana/.htpasswd`. If this
> file does not exist when `docker compose up -d` is run for the full stack, Docker will create it
> as a *directory*, causing nginx to fail to start (breaking the API proxy entirely). Always create
> `.htpasswd` on the VM before starting nginx with the grafana volumes mount.

## Step 3: Start the monitoring stack

```bash
ssh nghianguyentrong1211@34.87.36.185
cd /opt/webcrawler
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d prometheus grafana
```

## Step 4: Access Grafana

Visit: https://webcrawler-myst.duckdns.org/grafana/

1. Enter the nginx basic auth credentials (from `.htpasswd`)
2. Enter the Grafana admin credentials (GRAFANA_ADMIN_USER / GRAFANA_ADMIN_PASSWORD)
3. Navigate to Dashboards → Web Crawler folder
4. Open "Crawler Overview" or "API Overview"

## Verify Prometheus is scraping

Check Prometheus targets (internal only — no external access):
```bash
ssh nghianguyentrong1211@34.87.36.185 \
  "docker exec webcrawler-prometheus-1 wget -qO- http://localhost:9090/api/v1/targets | python3 -m json.tool | grep state"
```
All 3 targets (prometheus, crawler, api) should show `"state": "up"`.

## Memory usage check

```bash
ssh nghianguyentrong1211@34.87.36.185 "docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}'"
```
Expected: prometheus <= 256M, grafana <= 128M.

## Rollback

If prometheus or grafana cause memory pressure:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod stop prometheus grafana
```
All other services (crawler, api, nginx, postgres, redis) continue running unaffected.
