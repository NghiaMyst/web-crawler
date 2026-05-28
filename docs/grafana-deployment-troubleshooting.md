# Grafana + Prometheus Deployment Troubleshooting
> Last updated: 2026-05-28 — covers Phase 12 initial deploy (Errors 1–9) and post-deploy debug session (Errors 10–13)

---

## Overview

Deploying and stabilising the monitoring stack (Prometheus + Grafana 13 behind nginx) required resolving 13 distinct errors across two sessions. The errors cluster into three categories:

- **Infrastructure**: CI/CD config drift, SSH access, nginx bind mount issues
- **nginx routing**: stale DNS cache, redirect loops, proxy config
- **Grafana 13 provisioning**: memory limits, datasource YAML quirks, dashboard JSON format

Root cause for most config errors: the CI/CD pipeline only updates Docker images (`crawler`, `api`). It never syncs config files. Any change to `docker-compose.prod.yml`, `nginx/nginx.conf`, or `monitoring/` must reach the VM via `git pull`.

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

**Resolution:** Use `git pull` directly on the VM instead of `scp`. The monitoring configs are in git, so a pull syncs everything except `.htpasswd` (gitignored).

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

**Cause:** `nginx/nginx.conf` was committed with `<DUCKDNS_DOMAIN>` as a literal placeholder for `server_name` and `ssl_certificate` paths. After `git pull`, the VM's actual domain was overwritten with the placeholder. `nginx -s reload` tested the config but silently failed to apply it because the SSL cert path `/etc/letsencrypt/live/<DUCKDNS_DOMAIN>/fullchain.pem` doesn't exist — nginx kept the old config loaded in memory.

**Symptom:** `/grafana/` returned 404 with no basic-auth challenge; `/api/*` still worked.

**Resolution (VM — one-time):**
```bash
sed -i 's|<DUCKDNS_DOMAIN>|webcrawler-myst.duckdns.org|g' /opt/webcrawler/nginx/nginx.conf
docker compose -f docker-compose.prod.yml exec nginx nginx -t && \
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```
**Resolution (repo — permanent):** Placeholder replaced with real domain and committed in `51f8788`.

---

## Error 5 — nginx 502 after any container restart (stale DNS cache)

**Cause:** nginx resolves upstream hostnames (`api`, `grafana`) **once at config-load time** and caches the IP forever. When any upstream container is recreated (or restarts), Docker assigns it a new IP on the bridge network. nginx keeps routing to the old IP → `111: Connection refused` → 502.

**Symptom:** Any `docker compose restart` or `up --no-deps` on an upstream service immediately causes 502 for that service until nginx itself is reloaded or recreated.

**Short-term workaround (before permanent fix):**
```bash
# Reload nginx after every upstream container recreate
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

**Permanent fix (committed `88712a7`):**
Add Docker's embedded DNS resolver to `nginx/nginx.conf` and use variables for all `proxy_pass` targets. nginx then re-resolves upstream hostnames on every request instead of caching at startup:

```nginx
http {
    # Docker's embedded DNS — forces per-request DNS resolution.
    # Without this, any upstream restart causes 502 until nginx restarts.
    resolver 127.0.0.11 valid=10s ipv6=off;

    server {
        # Variables + resolver = nginx re-resolves on every request
        set $grafana_upstream http://grafana:3000;
        set $api_upstream     http://api:5000;

        location /grafana/ {
            proxy_pass $grafana_upstream;
        }
        location / {
            proxy_pass $api_upstream;
        }
    }
}
```

**Why variables are required:** A literal `proxy_pass http://grafana:3000;` is resolved at config parse time and ignores the `resolver` directive. A variable `proxy_pass $grafana_upstream;` triggers DNS lookup through the configured resolver on each proxied request.

**Apply on VM:**
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

---

## Error 6 — nginx bind mount not picking up file changes (inode issue)

**Cause:** `sed -i` on Linux creates a new file (new inode) rather than editing in-place. Docker bind mounts on a running container track the **original inode** at mount time. The container continues reading the old inode. `nginx -s reload` inside the container also reads from the old inode.

**Symptom:** `docker exec nginx grep "grafana" /etc/nginx/nginx.conf` showed old content even after editing the host file.

**Resolution:** `--force-recreate` nginx — this remounts the bind mount to the current path/inode:
```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

> **Rule:** After any file edit that nginx uses (not just `sed -i` — any editor that does atomic writes), use `--force-recreate` rather than `nginx -s reload`.

---

## Error 7 — nginx redirect loop ("redirected you too many times")

**Cause:** The original nginx config used `rewrite ^/grafana/(.*) /$1 break` to strip the `/grafana/` prefix before proxying to Grafana. But `GF_SERVER_SERVE_FROM_SUB_PATH: "true"` means Grafana expects to receive requests **with** the `/grafana/` prefix intact. When nginx stripped it, Grafana received `/` and redirected back to `/grafana/` → nginx stripped again → infinite loop.

**Resolution:** Remove all `rewrite` directives from Grafana location blocks. Pass the full path through:
```nginx
location /grafana/ {
    auth_basic "Grafana";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass $grafana_upstream;  # full /grafana/ path passes through unchanged
}
```

---

## Error 8 — Grafana crash loop (OOM at 128 MB)

**Cause:** Grafana 13 ships a built-in Kubernetes-compatible API server (`grafana-apiserver`) that loads dozens of resource types at startup. This spikes memory well above 128 MB. Docker killed the container via cgroup OOM; exit code showed `0` (not `137`) due to how some kernel versions report cgroup kills.

**Symptom:** Container repeatedly showed "Up N seconds" after minutes of existence; logs always cut off at `starting module=grafana-apiserver`.

**Diagnosis:**
```bash
docker inspect webcrawler-grafana-1 --format='OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}}'
```

**Resolution:** Increase memory limit to 256 MB in `docker-compose.prod.yml` (committed `efc3017`):
```yaml
grafana:
  deploy:
    resources:
      limits:
        memory: 256M
      reservations:
        memory: 64M
```

> **Note:** 256 MB is the minimum for Grafana 13 to survive startup. Under sustained load or with many dashboards, more may be needed.

---

## Error 9 — Grafana crash loop: "Datasource provisioning error: data source not found" (Phase 12 session)

**Cause (two compounding issues at the time):**

1. **`version: 1` in datasource YAML** — Grafana 13 interprets this field as "update an existing record by this version". On a fresh database, no such record exists → "not found" → crash.

2. **`"uid": "-- Default --"` in dashboard JSONs** — A legacy Grafana placeholder UID that Grafana 13 no longer resolves. Panels silently showed no data.

**Symptom:** Grafana crashed on every start with `Datasource provisioning error: data source not found`.

**Resolution at the time:**
- Removed `version: 1` from datasource YAML (applied on VM only — **not committed to git**, which caused the error to recur later, see Error 11)
- Replaced `"-- Default --"` with the real auto-assigned UID in dashboard JSONs

> **⚠️ This resolution was incomplete.** The `version: 1` removal was only done manually on the VM, not committed. The `uid:` field was then added to lock in a stable UID, which introduced a new failure mode in Grafana 13.0.1 (see Error 12).

---

## Error 10 — Dashboards not appearing in Grafana UI

**Cause:** The provisioned dashboard JSON files were missing two fields required by Grafana 13:

- `"id": null` — Without this, Grafana 13's provisioner may silently skip the file because it cannot determine whether to create or update the dashboard record.
- `"editable": true` — Grafana 13 requires this to be explicit when `allowUiUpdates: true` is set in `provider.yml`; missing it can cause the provisioner to refuse the file.

**Symptom:** Grafana started successfully and showed no errors, but the "Web Crawler" folder in the dashboards section was empty.

**Resolution (committed `ab80c5e`):** Add both fields to the top level of each dashboard JSON:
```json
{
  "id": null,
  "uid": "api-overview",
  "title": "API Overview",
  "editable": true,
  ...
}
```

> **Note:** Dashboards provisioned via file appear under the folder named in `provider.yml` (`folder: 'Web Crawler'`), not under "General". Always look in that folder first.

---

## Error 11 — Grafana crash loop returns after git pull (version: 1 was never committed)

**Cause:** The `version: 1` fix from Error 9 was applied manually on the VM but never committed to git. After a later `git pull` (which pulled updated `docker-compose.prod.yml` and `nginx/nginx.conf`), the provisioning directory was also refreshed from git — restoring `version: 1` and causing the crash loop to return.

**Symptom:** Grafana worked for days, then started crash-looping after a routine `git pull` + container restart.

**Diagnosis:**
```bash
docker compose -f docker-compose.prod.yml logs grafana 2>&1 | grep "level=error"
# Output: Failed to provision data sources: Datasource provisioning error: data source not found
```

**Resolution (committed `ca0b8fc`):** Remove `version: 1` from `monitoring/grafana/provisioning/datasources/prometheus.yml` in git.

> **Lesson:** Any fix applied manually on the VM must also be committed. Manual-only fixes are silently overwritten by the next `git pull`.

---

## Error 12 — Grafana 13.0.1 crash loop: `uid:` field in datasource YAML

**Cause:** A Grafana 13.0.1 regression. Even after removing `version: 1`, specifying `uid: webcrawler-prometheus` in the datasource YAML still caused the same crash. In Grafana 13.0.1 with unified storage enabled, a datasource with a specified `uid` is treated as an **UPDATE** of an existing record, not a **CREATE**. On a fresh `grafana_data` volume (empty SQLite DB), no record with that UID exists → `ErrDataSourceNotFound` → provisioning module fails → all 34 dependent modules cascade-fail → Grafana exits.

This affects any deployment that:
- Wipes `grafana_data` (fresh deploy, disaster recovery, volume corruption)
- First-time deploy on a new VM

**Symptom:** Identical to Error 9/11 — crash loop with `Datasource provisioning error: data source not found` — but persists even after removing `version: 1` and wiping the volume.

**Verification:**
```bash
# Confirm it is NOT an OOM kill
docker inspect webcrawler-grafana-1 --format='OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}}'
# → OOMKilled=false ExitCode=0

# Confirm the error
docker compose -f docker-compose.prod.yml logs grafana 2>&1 | grep "level=error" | head -5
# → Failed to provision data sources: Datasource provisioning error: data source not found
```

**Resolution (committed `7a7eecc`):**

**Step 1 — Strip datasource YAML to the minimum** (no `uid`, no `version`, no `access`, no `jsonData`):
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
Without `uid:`, Grafana auto-assigns one at CREATE time. No lookup → no "not found".

**Step 2 — Replace hardcoded UID in dashboard JSONs with `${DS_PROMETHEUS}` template variable:**

Previously dashboard panels hardcoded `"uid": "webcrawler-prometheus"`. This breaks whenever the datasource UID changes (volume wipe, fresh deploy). Replace with a datasource template variable that resolves at load time to whatever Prometheus instance is the default:

```json
{
  "id": null,
  "uid": "api-overview",
  "title": "API Overview",
  "editable": true,
  "templating": {
    "list": [
      {
        "current": {},
        "hide": 2,
        "name": "DS_PROMETHEUS",
        "query": "prometheus",
        "refresh": 1,
        "type": "datasource"
      }
    ]
  },
  "panels": [
    {
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      ...
    }
  ]
}
```

- `"hide": 2` — variable is invisible in the dashboard UI
- `"refresh": 1` — resolves on every dashboard load
- `"isDefault": true` on the datasource YAML ensures `${DS_PROMETHEUS}` picks the right instance

**Apply on VM:**
```bash
git pull
docker compose -f docker-compose.prod.yml stop grafana
docker volume rm webcrawler_grafana_data   # wipe any partial/poisoned DB state
docker compose -f docker-compose.prod.yml up -d --no-deps grafana
```

---

## Error 13 — False 502 during Grafana startup ("Connection refused")

**Cause:** Grafana 13 takes 60–90 seconds to load its embedded API server before port 3000 opens for HTTP. Without a healthcheck, `docker ps` shows `Up N seconds` immediately — which looks healthy but means nothing about port availability. During this window, nginx routes requests to `grafana:3000` and gets `111: Connection refused` → 502.

This is different from a true 502 (wrong IP). The nginx error log shows the correct IP:
```
connect() failed (111: Connection refused) while connecting to upstream,
upstream: "http://172.18.0.6:3000/grafana/"
```
`111` = refused, not unreachable. The container is running but the port is not yet open.

**Symptom:** `/grafana/` returns 502 for ~60 seconds after every Grafana container restart, then recovers on its own.

**Resolution (committed `8ffb781`):** Add a healthcheck to Grafana in `docker-compose.prod.yml` using Grafana's own `/api/health` endpoint:

```yaml
grafana:
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 90s   # grace period for the slow API server load
```

After this, `docker ps` reports:

| Status | Meaning |
|--------|---------|
| `(health: starting)` | Still booting — wait, don't hit `/grafana/` yet |
| `(healthy)` | Port 3000 is open — safe to use |
| `(unhealthy)` | Crashed after startup — check `logs grafana` |

---

## Standard Recovery Procedure

When Grafana is crash-looping or unreachable, follow this sequence:

```bash
# 1. Pull latest config
git pull

# 2. Check what's killing it
docker compose -f docker-compose.prod.yml logs --tail=80 grafana 2>&1 | grep "level=error\|Error:"

# 3. If "Datasource provisioning error: data source not found"
#    → wipe the DB and restart fresh
docker compose -f docker-compose.prod.yml stop grafana
docker volume rm webcrawler_grafana_data
docker compose -f docker-compose.prod.yml up -d --no-deps grafana

# 4. Wait for healthy (up to 90s)
watch 'docker compose -f docker-compose.prod.yml ps grafana'

# 5. If 502 persists after grafana is (healthy)
#    → nginx has stale DNS (pre-resolver-fix VMs only)
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

---

## Final Working State

| Component | Status |
|-----------|--------|
| Prometheus targets (prometheus, crawler, api) | ✅ all `"health": "up"` |
| Grafana at `/grafana/` | ✅ running, basic auth working, dashboards visible |
| nginx routing | ✅ API + SignalR + Grafana all routed correctly |
| Dashboard datasource panels | ✅ wired via `${DS_PROMETHEUS}` — survives volume wipes |
| nginx stale-DNS 502 | ✅ permanently fixed — `resolver 127.0.0.11` + variables |
| Grafana healthcheck | ✅ `docker ps` shows real readiness state |

---

## Key Lessons

1. **CI/CD only updates images** — config file changes (`docker-compose.prod.yml`, `nginx/nginx.conf`, `monitoring/`) must reach the VM via `git pull`. Never apply fixes only on the VM.

2. **Manual VM fixes must be committed immediately** — a `git pull` silently overwrites any untracked manual fix (see Error 11).

3. **nginx literal `proxy_pass` hostnames are resolved once at startup** — use `resolver 127.0.0.11 valid=10s` + `set $var` variables so nginx re-resolves per-request. Eliminates all stale-DNS 502s after container restarts.

4. **`sed -i` breaks Docker bind mounts** — use `--force-recreate` to refresh the inode reference. `nginx -s reload` alone is not enough after a `sed -i` edit.

5. **Grafana 13 provisioning is strict about datasource YAML fields:**
   - `version:` field → always crash on fresh DB (triggers UPDATE, not CREATE)
   - `uid:` field → crash on fresh DB in Grafana 13.0.1 (same UPDATE path bug)
   - **Use the minimal YAML**: `name`, `type`, `url`, `isDefault`, `editable` only

6. **Dashboard JSONs must use `${DS_PROMETHEUS}` not hardcoded UIDs** — the UID Grafana assigns to a datasource changes on every fresh volume. Template variables survive this; hardcoded UIDs do not.

7. **128 MB is not enough for Grafana 13** — minimum 256 MB due to the embedded Kubernetes API server that loads at startup.

8. **Grafana 13 takes 60–90 seconds to open port 3000** — always add a healthcheck with `start_period: 90s`. A container status of "Up N seconds" without `(healthy)` means nothing.
