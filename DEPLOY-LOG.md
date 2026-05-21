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
| SSH users | `gcp-webcrawler` (Windows), `nghianguyentrong1211` (Ubuntu) |
| SSH alias | `ssh webcrawler` — both devices use this alias |

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

### 2026-05-20 — SSH Access from Ubuntu Machine + Repo Cloned

**What:** Restored SSH access from Ubuntu dev machine, fixed user/docker permissions, cloned repo onto VM.

**Steps completed:**
- Reused existing `~/.ssh/id_personal` key (ed25519) on Ubuntu — no new key needed
- Added public key to VM via GCP Console → VM → Edit → SSH Keys
- Added `webcrawler` SSH config entry pointing to 34.87.36.185 with `User nghianguyentrong1211`
- GCP maps the last word of the public key as the Linux username → two users now exist on VM:
  - `gcp-webcrawler` (Windows key, from Day 1)
  - `nghianguyentrong1211` (Ubuntu key, added today)
- Added both users to `docker` group: `sudo usermod -aG docker nghianguyentrong1211`
- Created deploy directory with shared group access:
  ```bash
  sudo mkdir -p /opt/webcrawler
  sudo chown root:docker /opt/webcrawler
  sudo chmod 775 /opt/webcrawler
  ```
- Cloned repo: `git clone https://<PAT>@github.com/NghiaMyst/web-crawler.git /opt/webcrawler`

**Also:** Tuned `docker-compose.prod.yml` resource limits for 4GB GCP VM (original was sized for Oracle 24GB):
| Service | Old limit | New limit |
|---------|-----------|-----------|
| postgres | 2G | 512M |
| redis | 512M | 256M |
| crawler | 4G | 1536M |
| api | 1G | 512M |
| nginx | 256M | 128M |
| **Total** | **7.75G** | **~2.9G** |

**Verified:**
- `ssh webcrawler` → `nghianguyentrong1211@webcrawler-prod:~$` ✓
- `docker ps` works without sudo ✓
- `/opt/webcrawler` contains full repo ✓

**Next:** Create prod env files on VM, then set up DuckDNS + TLS cert.

---

**Remaining for Phase 10:**
- [x] GCP VM created and running
- [x] SSH access from Windows confirmed
- [x] Docker 29.5.1 + Compose v5.1.3 installed on VM
- [x] SSH access from Ubuntu confirmed
- [x] Repo cloned at `/opt/webcrawler`
- [x] docker-compose.prod.yml tuned for 4GB GCP VM
- [ ] Create prod env files on VM
- [ ] Open GCP firewall rules (ports 80 + 443)
- [ ] Set up DuckDNS subdomain
- [ ] Issue Let's Encrypt TLS cert (Certbot DNS-01)
- [ ] Deploy dashboard to Vercel
- [ ] Start stack: `docker compose -f docker-compose.prod.yml up -d`
- [ ] Smoke test all health checks

---

### 2026-05-21 — Prod Env Files, DuckDNS, TLS Cert, Vercel Deploy

**What:** Completed env setup, registered domain, issued TLS cert, deployed dashboard to Vercel.

**Steps completed:**

**Env files (VM):**
- Copied `.env.prod.example` → `.env.prod`, `apps/api/.env.prod.example` → `apps/api/.env.prod`, `apps/crawler/.env.prod.example` → `apps/crawler/.env.prod`
- Filled in real values (Postgres password, Telegram/Discord secrets, API keys)
- Verified: `git status` shows no `.env.prod` files tracked ✓

**GCP Firewall:**
- Created VPC firewall rule `allow-http-https` — TCP 80 + 443 from 0.0.0.0/0
- Verified from local: `curl --connect-timeout 5 http://34.87.36.185` → `Connection refused` (port reachable, nothing listening yet) ✓

**DuckDNS:**
- Registered subdomain: `webcrawler-myst.duckdns.org` → 34.87.36.185
- Token saved locally

**Let's Encrypt TLS (DNS-01 via DuckDNS):**
```bash
docker volume create letsencrypt
export DUCKDNS_DOMAIN=webcrawler-myst.duckdns.org
export DUCKDNS_TOKEN=<token>
export CERT_EMAIL=nghianguyentrong1211@gmail.com
bash scripts/issue-cert.sh
sed -i "s|<DUCKDNS_DOMAIN>|${DUCKDNS_DOMAIN}|g" nginx/nginx.conf
```
- Cert issued, expires 2026-08-19 ✓
- `nginx/nginx.conf` patched with real domain ✓

**Vercel deploy (dashboard):**
- Project: `apps/dashboard` (pnpm + Turborepo monorepo)
- Troubleshooting: Vercel's Turbo auto-detection was overriding custom install command, causing "No Next.js version detected" error
- Fix: updated `apps/dashboard/vercel.json` — moved `pnpm install --frozen-lockfile` to `installCommand` so Vercel can detect Next.js version before build runs
- Env vars set: `NEXT_PUBLIC_API_URL=https://webcrawler-myst.duckdns.org`, `API_URL=https://webcrawler-myst.duckdns.org`
- Deploy successful ✓

**Verified:**
- Vercel dashboard URL loads ✓
- No data shown (expected — backend stack not started yet)

**Next:** Update CORS in `.env.prod` with Vercel URL, then start the stack.

---

**Remaining for Phase 10:**
- [x] GCP VM created and running
- [x] SSH access from Windows confirmed
- [x] Docker 29.5.1 + Compose v5.1.3 installed on VM
- [x] SSH access from Ubuntu confirmed
- [x] Repo cloned at `/opt/webcrawler`
- [x] docker-compose.prod.yml tuned for 4GB GCP VM
- [x] Create prod env files on VM
- [x] Open GCP firewall rules (ports 80 + 443)
- [x] Set up DuckDNS subdomain (webcrawler-myst.duckdns.org)
- [x] Issue Let's Encrypt TLS cert (Certbot DNS-01) — expires 2026-08-19
- [x] Deploy dashboard to Vercel
- [ ] Update CORS_ALLOWED_ORIGINS in .env.prod with Vercel URL
- [ ] Pull latest code on VM (vercel.json fix needs to be on VM too)
- [ ] Start stack: `docker compose -f docker-compose.prod.yml up -d`
- [ ] Smoke test all health checks (SC-1..SC-5)

---

<!-- Add new entries below as deployment progresses -->
