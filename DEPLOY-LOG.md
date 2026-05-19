# Deployment Log — Web Crawler Production

Tracks every step of the Phase 10 deployment to GCP for learning and reference.

---

## Server Details

| Field | Value |
|-------|-------|
| Provider | Google Cloud Platform (free trial) |
| Instance | webcrawler-prod |
| Region | asia-southeast1-b (Singapore) |
| Spec | e2-medium — 2 vCPU, 4GB RAM, 30GB balanced disk |
| OS | Ubuntu 24.04.4 LTS (x86_64 / AMD64) |
| External IP | 34.87.36.185 |
| SSH alias | `ssh webcrawler` (user: gcp-webcrawler) |

---

## Log

### 2026-05-19 — VM Created and SSH Access Confirmed

**What:** Created GCP VM instance and established local SSH access from Windows.

**Steps completed:**
- Created GCP e2-medium VM in asia-southeast1-b with Ubuntu 24.04 LTS, 30GB balanced disk
- Generated ed25519 SSH key pair on local Windows machine (`~/.ssh/id_ed25519`)
- Added public key to VM via GCP Console → VM → Edit → SSH Keys
- Created `~/.ssh/config` entry with alias `webcrawler` pointing to 34.87.36.185
- Connected successfully: `ssh webcrawler` → `gcp-webcrawler@webcrawler-prod:~$`

**Verified:**
- Ubuntu 24.04.4 LTS (GNU/Linux 6.17.0-1016-gcp x86_64) ✓
- SSH alias works without specifying IP or key path ✓

**Next:** Install Docker on the VM.

---

<!-- Add new entries below as deployment progresses -->
