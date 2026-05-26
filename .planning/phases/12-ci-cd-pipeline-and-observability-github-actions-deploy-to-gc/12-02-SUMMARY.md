---
phase: 12
plan: 02
subsystem: ci-cd
tags: [github-actions, docker, artifact-registry, wif, ci-cd]
dependency_graph:
  requires: []
  provides: [github-actions-build-push-workflow]
  affects: [deployment-pipeline]
tech_stack:
  added:
    - GitHub Actions workflow YAML
    - docker/build-push-action@v7.2.0
    - google-github-actions/auth@v3 (WIF)
    - docker/setup-buildx-action@v4.1.0
    - docker/login-action@v4.2.0
  patterns:
    - Matrix strategy for parallel Docker builds
    - Workload Identity Federation (WIF) for GCP auth
    - Registry-backed BuildKit cache with mode=max
key_files:
  created:
    - .github/workflows/deploy.yml
  modified: []
decisions:
  - platforms linux/amd64 only — GCE e2-medium is AMD64, avoids multi-arch build overhead
  - type=registry cache with mode=max — GitHub Actions 10GB cache limit would be exhausted by 1.5GB Playwright base image
  - oauth2accesstoken login pattern — required for Artifact Registry when using WIF (short-lived token, not password)
  - id-token:write at job level — principle of least privilege for WIF OIDC token exchange
  - No deploy job in this plan — kept to Plan 03 for focused, reviewable units
metrics:
  duration: 46s
  completed: "2026-05-25"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
---

# Phase 12 Plan 02: GitHub Actions Build-and-Push Workflow Summary

GitHub Actions workflow file creates parallel Docker image builds for crawler and api using matrix strategy, pushing to GCP Artifact Registry with WIF auth and registry-backed BuildKit cache.

## What Was Built

Created `.github/workflows/deploy.yml` with a `build-and-push` job that:
- Triggers on `push` to `main` branch and on `workflow_dispatch` (manual trigger)
- Uses matrix strategy with two entries (`crawler`, `api`) running in parallel
- Authenticates to GCP via Workload Identity Federation using `google-github-actions/auth@v3`
- Tags images with both `${{ github.sha }}` (immutable audit trail) and `latest`
- Uses `type=registry` BuildKit cache with `mode=max` to cache all layers including the Playwright builder stage
- Targets `linux/amd64` only — matching GCE e2-medium architecture, halving build time vs multi-arch

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create .github/workflows/deploy.yml with build-and-push matrix job | c51207a | .github/workflows/deploy.yml |

## Decisions Made

1. **Registry cache over GitHub Actions cache** — The Playwright base image (`mcr.microsoft.com/playwright:v1.50.1-noble`) is ~1.5GB. GitHub Actions cache has a 10GB limit that would be exhausted quickly. `type=registry` cache stores layers in Artifact Registry alongside the images, no size limit.

2. **mode=max caching** — Caches ALL intermediate layers including the builder stage, not just the final image layers. Critical for the multi-stage Dockerfile that uses Playwright as a build dependency.

3. **oauth2accesstoken pattern** — Artifact Registry requires this specific login pattern when using WIF. The `access_token` output from the auth step is a short-lived OAuth2 token, not a password, and expires after the job completes (security benefit).

4. **Deploy job deferred to Plan 03** — Keeps each plan focused and reviewable. The comment `# deploy job is added in Plan 03` is intentional per plan spec.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

No new security surfaces introduced beyond what is documented in the plan's threat model:
- T-12-02-01: WIF token exchange guarded by `--attribute-condition` set in Plan 01
- T-12-02-02: SHA-tagged images provide immutable audit trail
- T-12-02-03: Secrets masked by GitHub Actions automatically
- T-12-02-04: Cache corruption is non-fatal, BuildKit falls back to full rebuild

## Self-Check: PASSED

- `.github/workflows/deploy.yml` exists: FOUND
- Commit c51207a exists: FOUND
- YAML valid: PASSED (python3 yaml.safe_load)
- All verification checks passed: build-and-push job, docker/build-push-action@v7.2.0, type=registry cache, linux/amd64, id-token: write
