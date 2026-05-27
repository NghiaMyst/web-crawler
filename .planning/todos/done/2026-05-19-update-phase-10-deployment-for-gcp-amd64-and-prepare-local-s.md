---
created: 2026-05-19T16:29:39.781Z
title: Update Phase 10 deployment for GCP AMD64 and prepare local SSH access
area: planning
files:
  - .planning/phases/10-production-deployment/10-CONTEXT.md
  - .planning/phases/10-production-deployment/10-01-PLAN.md
  - .planning/phases/10-production-deployment/10-RESEARCH.md
  - docker-compose.prod.yml
---

## Problem

Phase 10 plans and docker-compose.prod.yml were written targeting Oracle Cloud Ampere A1
(ARM64, 4 vCPU, 24GB RAM). The actual deployment target has changed to Google Cloud Platform
e2-medium (AMD64 / x86_64, 2 vCPU, 4GB RAM, 30GB balanced disk, Ubuntu 24.04 LTS).

All `platform: linux/arm64` tags in plans and compose files are wrong for this host.
Resource limits sized for 24GB RAM are too generous and need tightening to fit 4GB.
Oracle-specific firewall instructions (VCN Security List + iptables two-layer model)
no longer apply — GCP uses VPC firewall rules instead.

Local machine (Windows 11) needs SSH key setup and `~/.ssh/config` entry so the user
can connect with a short alias (`ssh webcrawler`) instead of remembering the IP each time.

## Solution

1. Update 10-CONTEXT.md decisions:
   - Replace ARM64 → AMD64 (remove platform tags or set linux/amd64)
   - Adjust resource limits: crawler 2G, api 512M, postgres 1G, redis 256M, nginx 128M
   - Replace Oracle two-layer firewall notes with GCP VPC firewall rules (already set via
     Console when VM was created with "Allow HTTP/HTTPS" checkboxes)

2. Update docker-compose.prod.yml (10-01-PLAN.md output):
   - Remove all `platform: linux/arm64` lines
   - Apply tightened memory limits for 4GB host

3. Prepare local SSH access from Windows:
   - Generate ed25519 key pair on local machine
   - Add public key to GCP VM (via Console → VM → Edit → SSH Keys)
   - Create `~/.ssh/config` entry:
       Host webcrawler
         HostName <GCP_EXTERNAL_IP>
         User <username>
         IdentityFile ~/.ssh/id_ed25519
   - Verify: `ssh webcrawler` connects without specifying IP or key path
