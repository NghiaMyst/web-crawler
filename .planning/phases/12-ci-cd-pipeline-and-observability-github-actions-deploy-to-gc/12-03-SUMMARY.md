---
phase: 12-ci-cd-pipeline-and-observability-github-actions-deploy-to-gc
plan: "03"
subsystem: infra
tags: [github-actions, docker-compose, artifact-registry, gce, ssh-deploy, appleboy]

# Dependency graph
requires:
  - phase: 12-02
    provides: build-and-push GitHub Actions workflow that pushes crawler and api images to Artifact Registry
provides:
  - docker-compose.prod.yml with image: references pointing to Artifact Registry for crawler and api
  - deploy job in .github/workflows/deploy.yml that SSH deploys to GCE VM via appleboy/ssh-action
  - IMAGE_TAG sed-based in-place update pattern that preserves all other .env.prod secrets
affects:
  - 12-04
  - 12-05
  - production-deployment

# Tech tracking
tech-stack:
  added: [appleboy/ssh-action@v1.2.5]
  patterns:
    - IMAGE_TAG variable with :-latest default for local/CI compatibility
    - sed -i anchored regex for single-key .env.prod update without exposing other secrets
    - docker compose pull + up --no-deps for zero-downtime partial service restart

key-files:
  created: []
  modified:
    - docker-compose.prod.yml
    - .github/workflows/deploy.yml

key-decisions:
  - "Hardcoded GCP project ID in image paths — personal project with stable project ID; avoids requiring GCP_PROJECT_ID in .env.prod on VM"
  - "IMAGE_TAG with :-latest default — allows local docker compose up without CI while CI sets exact SHA"
  - "sed -i with | delimiter and anchored ^IMAGE_TAG= regex — safe in-place update, other secrets structurally unreachable"
  - "pull crawler api only, up --no-deps crawler api — skips postgres/redis/nginx restart, avoids unnecessary downtime"
  - "timeout 90s healthcheck — accounts for EF Core DB migration on API startup"

patterns-established:
  - "Partial service restart: docker compose pull <services> then up -d --no-deps <services>"
  - "Safe env file mutation: sed -i with anchored key pattern + grep -q fallback for first-run"

requirements-completed: [CICD-03]

# Metrics
duration: 6min
completed: 2026-05-26
---

# Phase 12 Plan 03: Deploy Job and docker-compose image: references Summary

**Closed CI/CD loop: docker-compose.prod.yml uses Artifact Registry image: references and GitHub Actions deploy job SSHes to GCE VM to pull and restart only crawler + api via appleboy/ssh-action**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-26T02:14:00Z
- **Completed:** 2026-05-26T02:19:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced `build:` directives in docker-compose.prod.yml with `image:` references to Artifact Registry for crawler and api, enabling pull-based deployment without source on VM
- Added `deploy` job to `.github/workflows/deploy.yml` using appleboy/ssh-action@v1.2.5 with sed-based IMAGE_TAG update that preserves all other `.env.prod` secrets
- Deploy job correctly depends on `build-and-push`, pulls only crawler+api images, restarts only those services with `--no-deps`, and verifies health with 90s timeout

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace build: with image: in docker-compose.prod.yml** - `16e9785` (feat)
2. **Task 2: Add deploy job to GitHub Actions workflow** - `5cbcfa2` (feat)

## Files Created/Modified
- `docker-compose.prod.yml` - crawler and api services now use `image:` from Artifact Registry with `${IMAGE_TAG:-latest}` default
- `.github/workflows/deploy.yml` - added `deploy` job after `build-and-push`; SSH deploys to GCE VM, updates IMAGE_TAG in-place, restarts only crawler+api

## Decisions Made
- Hardcoded GCP project ID `project-c67469b2-5925-4167-b6a` in image paths rather than using `${GCP_PROJECT_ID}` — avoids needing GCP_PROJECT_ID in `.env.prod` on the VM for a personal project with a stable project ID
- `IMAGE_TAG:-latest` default allows `docker compose up` to work locally without needing to set IMAGE_TAG, while CI sets the exact commit SHA
- Used `|` as sed delimiter to avoid conflicts with path characters in the IMAGE_TAG value
- `grep -q "^IMAGE_TAG=" .env.prod || echo "IMAGE_TAG=${IMAGE_TAG}" >> .env.prod` handles first deploy when `.env.prod` was created without IMAGE_TAG

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Git worktree was initialized from an older base commit than the target. The initial `git reset --soft` caused staged deletions of files from later commits. Resolved by using `git add` to stage only the target files individually (not `git add -A`), so the task commits contain only the intended changes.

## Threat Mitigations Applied

Per plan threat model:
- **T-12-03-01 (Tampering):** `sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|"` uses anchored regex matching only lines starting with `IMAGE_TAG=`; `set -e` ensures script fails on sed error
- **T-12-03-04 (Spoofing):** `fingerprint: ${{ secrets.GCE_SSH_KNOWN_HOSTS }}` prevents MITM attacks on SSH connection

## User Setup Required

Before the deploy job can run, the following GitHub Secrets must be configured in the repository:
- `GCE_SSH_HOST` — External IP of the GCE VM
- `GCE_SSH_USER` — SSH username on the VM
- `GCE_SSH_PRIVATE_KEY` — Full Ed25519 private key content
- `GCE_SSH_KNOWN_HOSTS` — Output of `ssh-keyscan <VM_IP>` for host key verification

The `/opt/webcrawler` directory on the VM must exist and contain `docker-compose.prod.yml` and `.env.prod`.

## Next Phase Readiness
- CI/CD loop is complete: push to main → build images → push to Artifact Registry → SSH deploy to GCE VM → health check
- Plan 12-04 (Prometheus metrics) and Plan 12-05 (Grafana dashboards) can proceed independently — they add observability on top of the running stack

---
*Phase: 12-ci-cd-pipeline-and-observability-github-actions-deploy-to-gc*
*Completed: 2026-05-26*
