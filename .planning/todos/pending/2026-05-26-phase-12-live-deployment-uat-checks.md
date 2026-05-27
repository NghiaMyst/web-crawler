---
created: 2026-05-26T02:54:25.944Z
title: Phase 12 live deployment UAT checks
area: planning
files:
  - .planning/phases/12-ci-cd-pipeline-and-observability-github-actions-deploy-to-gc/12-HUMAN-UAT.md
---

## Problem

Phase 12 (CI/CD + Observability) passed all 14 automated checks but has 3 items that
require a live deployment to verify. These cannot be tested statically:

1. ✅ **GitHub Actions pipeline end-to-end** — VERIFIED 2026-05-27. WIF auth works,
   images push to Artifact Registry, SSH deploy updates IMAGE_TAG, restarts crawler+api,
   healthcheck passes via docker inspect. All 6 GitHub Secrets configured and working.
   Fixed: WIF pool/provider creation, iamcredentials API, artifactregistry API, Artifact
   Registry repo creation, VM service account pull permissions, docker inspect healthcheck.

2. **Grafana at /grafana/ subpath** — After running `docker compose up -d prometheus grafana`
   on the GCE VM (with .htpasswd and GRAFANA_ADMIN_PASSWORD set), visit
   https://webcrawler-myst.duckdns.org/grafana/ and verify: nginx basic auth gate,
   Grafana admin login, "Web Crawler" folder with Crawler Overview + API Overview dashboards,
   panels rendering live data.

3. **Prometheus scrape targets up** — Run on GCE VM:
   `docker exec webcrawler-prometheus-1 wget -qO- http://localhost:9090/api/v1/targets`
   All 3 targets (prometheus:9090, crawler:9464, api:5000/metrics) must show `"state": "up"`.

## Solution

1. Check off each result in `12-HUMAN-UAT.md` (update `result:` fields from `[pending]` to pass/fail)
2. Run `/gsd:verify-work 12` to close the UAT and mark phase 12 complete in ROADMAP
3. If issues found, run `/gsd:plan-phase 12 --gaps` for gap closure
