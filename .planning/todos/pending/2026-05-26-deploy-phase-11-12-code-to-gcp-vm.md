---
created: 2026-05-26T00:00:00.000Z
title: Deploy Phase 11+12 code to GCP VM
area: deployment
files:
  - .github/workflows/deploy.yml
  - .github/secrets.md
  - docs/deployment/artifact-registry-setup.md
  - apps/api/Endpoints/EntriesEndpoints.cs
---

## Problem

The GCP VM is still running the original Phase 10 Docker images. Phases 11 (FTS search)
and 12 (Prometheus/Grafana observability) have been merged to main but never deployed.

Symptoms:
- Searching in the dashboard (e.g. "luffy") returns no results — Phase 11 FTS migration
  (`AddFtsSearchVector`) has not run on the production DB
- Old entries have `search_vector = NULL` and are excluded from all `?q=` searches
- Grafana / Prometheus are not running on the VM

## Path A — Quick manual deploy (do this first to unblock search)

```bash
ssh webcrawler
cd /opt/webcrawler

# 1. Pull latest code
git pull

# 2. Rebuild and restart api + crawler (EF migration runs on API startup)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --no-deps api crawler

# 3. Confirm FTS migration was applied
docker logs webcrawler-api-1 2>&1 | grep -i "migration\|applying"

# 4. Backfill search vectors for existing rows
docker exec -i webcrawler-postgres-1 psql -U crawler -d webcrawler << 'SQL'
UPDATE data_entries
SET search_vector = to_tsvector('english',
  coalesce(entry_key, '') || ' ' ||
  coalesce(payload::text, '')
)
WHERE search_vector IS NULL;
SQL

# 5. Verify
curl -s https://webcrawler-myst.duckdns.org/health
```

Then test search at https://web-crawler-dashboard.vercel.app/entries?q=luffy

## Path B — Activate CI/CD (so future pushes auto-deploy)

Follow `docs/deployment/artifact-registry-setup.md` (all commands have real project ID).

Steps 1–7 in that doc, then add the 7 GitHub Secrets at:
https://github.com/NghiaMyst/web-crawler/settings/secrets/actions

| Secret | Value source |
|--------|-------------|
| `GCP_PROJECT_ID` | `project-c67469b2-5925-4167-b6a` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Step 6 output in artifact-registry-setup.md |
| `GCP_SERVICE_ACCOUNT` | `github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com` |
| `GCE_SSH_PRIVATE_KEY` | Contents of `~/.ssh/gce_deploy_key` (generate in Step 7) |
| `GCE_SSH_HOST` | `34.87.36.185` |
| `GCE_SSH_USER` | `nghianguyentrong1211` |
| `GCE_SSH_KNOWN_HOSTS` | Output of `ssh-keyscan -H 34.87.36.185` |

After secrets are set: Actions → Build, Push, Deploy → Run workflow → main.

## After Path B is done

See the existing Phase 12 UAT todo for verifying Grafana + Prometheus:
`.planning/todos/pending/2026-05-26-phase-12-live-deployment-uat-checks.md`
