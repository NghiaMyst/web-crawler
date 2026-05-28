# Grafana + Prometheus Deployment Troubleshooting
> Session: 2026-05-28 — Phase 12 live UAT

---

## Overview

Deploying the monitoring stack (Prometheus + Grafana) required syncing config files to the GCE VM and resolving a chain of 8 distinct errors. Root cause for most: the CI/CD pipeline only updates Docker images, never config files.

---

## Error 1 — "no such service: prometheus"

**Command:** `docker compose -f docker-compose.prod.yml up -d prometheus grafana`

**Cause:**
The GCE VM was set up manually during Phase 10. The CI/CD pipeline only ever runs:
```bash
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env.prod
docker compose pull crawler api
docker compose up -d --no-deps crawler api
```
It never syncs config files. The VM's `docker-compose.prod.yml` was frozen at the Phase 10 snapshot, before Prometheus and Grafana were added in Phase 12.

**Resolution:**
```bash
git pull origin main   # syncs docker-compose.prod.yml, nginx/nginx.conf, monitoring/
```

---

## Error 2 — `scp` Permission denied (publickey)

**Cause:** Local machine's SSH key is not in the VM's `authorized_keys`. The VM only trusts the key stored in the `GCE_SSH_PRIVATE_KEY` GitHub secret.

**Resolution:** Use `git pull` directly on the VM (Option C) instead of `scp`. The monitoring configs are in git, so a pull syncs everything except `.htpasswd` (gitignored).

---

## Error 3 — `htpasswd: command not found`

**Cause:** `apache2-utils` not installed on the VM.

**Resolution:**
```bash
sudo apt-get install -y apache2-utils
htpasswd -cb /opt/webcrawler/monitoring/grafana/.htpasswd admin yourpassword
```

---

## Error 4 — nginx `<DUCKDNS_DOMAIN>` placeholder in git

**Cause:** `nginx/nginx.conf` was committed with `<DUCKDNS_DOMAIN>` as a literal placeholder for `server_name` and `ssl_certificate` paths. After `git pull`, the VM's actual domain was overwritten with the placeholder. nginx's `nginx -s reload` tested the config but silently failed to apply it because the SSL cert path `/etc/letsencrypt/live/<DUCKDNS_DOMAIN>/fullchain.pem` doesn't exist — nginx kept the old config loaded.

**Symptom:** `/grafana/` returned 404 with no basic-auth challenge; `/api/*` still worked.

**Resolution (VM):**
```bash
sed -i 's|<DUCKDNS_DOMAIN>|webcrawler-myst.duckdns.org|g' /opt/webcrawler/nginx/nginx.conf
docker compose -f docker-compose.prod.yml exec nginx nginx -t && \
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```
**Resolution (repo — permanent fix):**
The placeholder was replaced with the real domain and committed in `51f8788`.

---

## Error 5 — nginx 502 after container restart (stale DNS cache)

**Cause:** nginx resolves upstream hostnames (`api`, `grafana`) at config-load time and caches the IP. When a container is recreated, it gets a new Docker network IP. nginx keeps routing to the old IP → connection refused → 502.

**Symptom:** API or Grafana returns 502 immediately after any `docker compose up --force-recreate`.

**Resolution:** Always reload nginx after recreating any upstream container:
```bash
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

---

## Error 6 — nginx bind mount not picking up file changes (inode issue)

**Cause:** `sed -i` on Linux creates a new file (new inode) rather than editing in-place. Docker bind mounts on a running container track the original inode. The container continues reading the old file. `nginx -s reload` inside the container also reads the old inode.

**Symptom:** `docker exec nginx grep "grafana" /etc/nginx/nginx.conf` showed old content even after editing the host file.

**Resolution:** `--force-recreate` nginx — this remounts the bind mount to the current path/inode:
```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

---

## Error 7 — nginx redirect loop ("redirected you too many times")

**Cause:** The original nginx config used `rewrite ^/grafana/(.*) /$1 break` to strip the `/grafana/` prefix before proxying to Grafana. But `GF_SERVER_SERVE_FROM_SUB_PATH: "true"` means Grafana expects to receive requests **with** the `/grafana/` prefix intact. When nginx stripped it, Grafana received `/` and redirected back to `/grafana/` → nginx stripped again → infinite loop.

**Resolution:** Remove the `rewrite` directives from both Grafana location blocks. Let nginx pass the full `/grafana/` path through:
```nginx
location /grafana/ {
    auth_basic "Grafana";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://grafana:3000;   # no rewrite — Grafana handles /grafana/ prefix
}
```

---

## Error 8 — Grafana crash loop (128MB OOM)

**Cause:** Grafana 13 includes a built-in Kubernetes-compatible API server (`grafana-apiserver`) that loads many modules at startup. This spikes memory above the 128MB container limit. Docker killed the container; exit code showed 0 (not OOMKilled) due to how Docker reports cgroup kills in some kernel versions.

**Symptom:** Container repeatedly showed "Up N seconds" after minutes of existence; logs always cut off at `starting module=grafana-apiserver`.

**Resolution:** Increase Grafana memory limit to 256MB in `docker-compose.prod.yml`:
```yaml
grafana:
  deploy:
    resources:
      limits:
        memory: 256M
      reservations:
        memory: 64M
```
Committed in `efc3017`.

---

## Error 9 — Grafana provisioning crash: "Datasource provisioning error: data source not found"

**Cause:** Two compounding issues:

1. **`version: 1` in datasource YAML** — In Grafana 13, the `version` field causes the provisioner to treat the config as an update of an existing datasource record. On a fresh database (after `docker volume rm webcrawler_grafana_data`), no record exists → "not found" → provisioning module fails → Grafana exits.

2. **`"uid": "-- Default --"` in dashboard JSONs** — This is a legacy Grafana placeholder that Grafana 13 no longer resolves. All panel datasource references must use a real UID.

**Symptom:** Grafana crashed on every start with `starting module provisioning: Datasource provisioning error: data source not found`. Even with correct provisioning files mounted.

**Resolution — datasource YAML** (remove `version` field):
```yaml
# monitoring/grafana/provisioning/datasources/prometheus.yml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
    editable: true
```

**Resolution — dashboard JSONs** (replace placeholder UID):
```bash
# Get the actual UID Grafana assigned
docker exec webcrawler-grafana-1 wget -qO- \
  http://admin:PASSWORD@localhost:3000/api/datasources | python3 -m json.tool | grep uid

# Replace in dashboard files
sed -i 's/"uid": "-- Default --"/"uid": "ACTUAL_UID_HERE"/g' \
  monitoring/grafana/dashboards/crawler.json \
  monitoring/grafana/dashboards/api.json
```

---

## Final Working State

| Component | Status |
|-----------|--------|
| Prometheus targets (prometheus, crawler, api) | ✅ all `"health": "up"` |
| Grafana at `/grafana/` | ✅ running, basic auth working |
| nginx routing | ✅ API + SignalR + Grafana all routed correctly |
| Dashboard datasource panels | ✅ fixed with real UID |

---

## Key Lessons

1. **CI/CD only updates images** — config file changes (docker-compose, nginx, monitoring) must be manually synced to the VM via `git pull`.
2. **nginx reload ≠ safe after container recreate** — always `nginx -s reload` after any upstream container is recreated.
3. **`sed -i` breaks bind mounts** — use `--force-recreate` to refresh Docker's inode reference.
4. **Grafana 13 provisioning quirks** — `version:` field and `"-- Default --"` UID are both broken in Grafana 13. Use minimal YAML and real UIDs.
5. **128MB is not enough for Grafana 13** — minimum 256MB due to the embedded k8s API server.
