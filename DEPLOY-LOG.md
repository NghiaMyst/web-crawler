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

### 2026-05-19 — Docker Installed on VM

**What:** Installed Docker Engine and Docker Compose plugin on the GCP VM.

**Commands run:**
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker gcp-webcrawler
newgrp docker
```

**Verified:**
- Docker version 29.5.1, build 2518b52 ✓
- Docker Compose version v5.1.3 ✓
- `docker ps` returns empty table (no errors) ✓

**Next:** Clone the project repo onto the VM.

---

### 2026-05-19 — Session Paused

**Status:** Paused before repo clone. Resuming tomorrow from a different Ubuntu machine.

**Completed so far:**
- [x] GCP VM created and running
- [x] SSH access from Windows confirmed
- [x] Docker 29.5.1 + Compose v5.1.3 installed on VM

**Remaining for Phase 10:**
- [ ] Push local code to GitHub (do this before leaving Windows today)
- [ ] Set up SSH access to VM from Ubuntu machine
- [ ] Clone repo onto VM at `/opt/webcrawler`
- [ ] Create prod env files on VM
- [ ] Set up DuckDNS subdomain
- [ ] Issue Let's Encrypt TLS cert (Certbot DNS-01)
- [ ] Author `docker-compose.prod.yml` (AMD64, 4GB limits)
- [ ] Start stack: `docker compose -f docker-compose.prod.yml up -d`
- [ ] Deploy dashboard to Vercel
- [ ] Smoke test all health checks

---

## Resume Guide — Ubuntu Machine

Follow these steps tomorrow to restore full access from a new Ubuntu machine.

### 1 — Generate a new SSH key on the Ubuntu machine

```bash
ssh-keygen -t ed25519 -C "gcp-webcrawler"
# Accept default path (~/.ssh/id_ed25519), skip passphrase or set one
cat ~/.ssh/id_ed25519.pub
# Copy the full output
```

### 2 — Add the key to the GCP VM

1. Go to **console.cloud.google.com → Compute Engine → VM instances**
2. Click **webcrawler-prod → Edit**
3. Scroll to **SSH Keys → Add item**
4. Paste the public key → **Save**

### 3 — Create SSH config on Ubuntu

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat >> ~/.ssh/config << 'EOF'

Host webcrawler
  HostName 34.87.36.185
  User gcp-webcrawler
  IdentityFile ~/.ssh/id_ed25519
EOF
chmod 600 ~/.ssh/config
```

### 4 — Connect

```bash
ssh webcrawler
# Type yes on first connect
# Should land at: gcp-webcrawler@webcrawler-prod:~$
```

### 5 — Continue deployment

Once on the VM, proceed with cloning the repo:

```bash
# Create deploy directory
sudo mkdir -p /opt/webcrawler
sudo chown gcp-webcrawler:gcp-webcrawler /opt/webcrawler

# Clone (needs GitHub PAT — generate one at github.com → Settings → Developer settings → PAT)
git clone https://<YOUR_GITHUB_PAT>@github.com/NghiaMyst/web-crawler.git /opt/webcrawler

# Verify
ls /opt/webcrawler
```

Then open a new Claude Code session and run `/gsd:resume-work` to restore full context.

---

<!-- Add new entries below as deployment progresses -->
