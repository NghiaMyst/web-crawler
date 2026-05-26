---
plan: 12-01
phase: 12
status: complete
completed: 2026-05-25
---

# Plan 12-01 Summary: GCP Infrastructure Documentation

## What Was Built

Two developer-reference documentation files that guide the one-time GCP setup required before CI/CD can function. No application code changes.

### Files Created

- **`docs/deployment/artifact-registry-setup.md`** (289 lines)
  - 8-step setup guide with every `gcloud` command filled in for `project-c67469b2-5925-4167-b6a`
  - Covers: Enable APIs, create Artifact Registry repo, create CI service account, create WIF pool, configure OIDC provider, bind SA, generate SSH deploy key, smoke test
  - Registry path: `asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler`
  - Verification commands included at end

- **`.github/secrets.md`** (gitignored — developer reference only)
  - All 7 required GitHub Secrets listed with descriptions and value sources
  - Includes: `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GCE_SSH_PRIVATE_KEY`, `GCE_SSH_HOST`, `GCE_SSH_USER`, `GCE_SSH_KNOWN_HOSTS`
  - Setup order, verification steps, and troubleshooting for common failures
  - Secret relationship diagram showing how each secret flows into the workflow

- **`.gitignore`** updated
  - Added `/.github/secrets.md` so the reference file cannot be accidentally committed

## Commits

- `0e58da8` — docs(12-01): add GCP Artifact Registry + WIF setup runbook (Task 1)
- `[gitignore]` — docs(12-01): add .github/secrets.md reference + gitignore entry (Task 2)

## Verification

- `docs/deployment/artifact-registry-setup.md` exists with all 8 steps ✅
- Project ID `project-c67469b2-5925-4167-b6a` appears in every gcloud command ✅
- `.github/secrets.md` lists all 7 secrets with descriptions ✅
- `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCE_SSH_KNOWN_HOSTS` both documented ✅
- `.github/secrets.md` is in `.gitignore` (threat T-12-01-01 mitigated) ✅

## Key Decisions

- Used Workload Identity Federation (keyless auth) instead of service account JSON key — no rotation required, principle of least privilege
- 7 secrets documented (plan said 6, but `GCE_SSH_KNOWN_HOSTS` is also required for the SSH deploy step — correctly included)
- SSH key generated without passphrase (required for CI automation; key rotation is the compensating control)
- Attribute condition `assertion.repository=='NghiaMyst/web-crawler'` restricts WIF token exchange to this repo only

## Self-Check: PASSED
