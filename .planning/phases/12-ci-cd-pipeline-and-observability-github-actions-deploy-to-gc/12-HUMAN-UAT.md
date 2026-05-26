---
status: partial
phase: 12-ci-cd-pipeline-and-observability-github-actions-deploy-to-gc
source: [12-VERIFICATION.md]
started: 2026-05-26T09:40:00Z
updated: 2026-05-26T09:40:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. GitHub Actions end-to-end pipeline run
expected: Push to main triggers the workflow; WIF token exchange succeeds; both Docker images (crawler, api) are built and pushed to GCP Artifact Registry; the `deploy` job SSHes to the GCE VM, updates IMAGE_TAG in .env.prod, pulls the new images, restarts crawler+api, and the API healthcheck passes within 90 seconds. All GitHub Secrets (GCP_WIF_PROVIDER, GCP_SERVICE_ACCOUNT, GCE_SSH_HOST, GCE_SSH_USER, GCE_SSH_PRIVATE_KEY, GCE_SSH_KNOWN_HOSTS) must be configured in the repository.
result: [pending]

### 2. Grafana dashboard access at /grafana/ subpath
expected: After starting the monitoring stack on the GCE VM (with .htpasswd and GRAFANA_ADMIN_PASSWORD configured), visiting https://webcrawler-myst.duckdns.org/grafana/ shows nginx basic auth gate, then Grafana login page, then the "Crawler Overview" and "API Overview" dashboards in the "Web Crawler" folder with panels rendering data.
result: [pending]

### 3. Prometheus scrape target health
expected: Running `docker exec webcrawler-prometheus-1 wget -qO- http://localhost:9090/api/v1/targets` on the GCE VM shows all 3 targets (prometheus at localhost:9090, crawler at crawler:9464, api at api:5000/metrics) with `"state": "up"`.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
