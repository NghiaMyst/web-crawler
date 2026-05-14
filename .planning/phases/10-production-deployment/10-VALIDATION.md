---
phase: 10
slug: production-deployment
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-13
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Shell scripts + curl + docker compose commands |
| **Config file** | `docker-compose.prod.yml` (primary artifact) |
| **Quick run command** | `docker compose -f docker-compose.prod.yml ps` |
| **Full suite command** | `docker compose -f docker-compose.prod.yml ps && curl -sf https://<domain>/health` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `docker compose -f docker-compose.prod.yml config` (validates YAML)
- **After every plan wave:** Run full suite command on Oracle server
- **Before `/gsd-verify-work`:** All 5 success criteria from ROADMAP must pass
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | DEPLOY-01 | — | All services restart on failure | manual | `docker compose -f docker-compose.prod.yml config` | ✅ | ⬜ pending |
| 10-01-02 | 01 | 1 | DEPLOY-01 | — | Resource limits prevent OOM | manual | `docker inspect <container> \| grep -i memory` | ✅ | ⬜ pending |
| 10-02-01 | 02 | 2 | DEPLOY-02 | T-10-01 | HTTPS only; HTTP redirects to HTTPS | manual | `curl -I http://<domain>/health` | ✅ | ⬜ pending |
| 10-02-02 | 02 | 2 | DEPLOY-02 | T-10-01 | Valid Let's Encrypt cert (no browser warning) | manual | `curl -sv https://<domain>/health 2>&1 \| grep 'SSL certificate verify ok'` | ✅ | ⬜ pending |
| 10-02-03 | 02 | 2 | INFRA-02 | T-10-02 | Firewall: only 80/443 exposed | manual | `nmap -p 80,443,5000,5432 <oracle-ip>` | ✅ | ⬜ pending |
| 10-03-01 | 03 | 2 | DEPLOY-04 | — | AOF file written after crawl | manual | `docker exec redis ls /data/appendonly.aof` | ✅ | ⬜ pending |
| 10-04-01 | 04 | 3 | DEPLOY-04 | — | Bloom Filter survives Redis restart | manual | `docker compose restart redis && <bloom_check_script>` | ✅ | ⬜ pending |
| 10-04-02 | 04 | 3 | DEPLOY-05 | — | BullMQ jobs survive crawler restart | manual | `docker compose restart crawler && <check_no_duplicate>` | ✅ | ⬜ pending |
| 10-05-01 | 05 | 3 | DEPLOY-03 | T-10-03 | Dashboard loads from Vercel via HTTPS | manual | `curl -sf https://<vercel-url>` | ✅ | ⬜ pending |
| 10-05-02 | 05 | 3 | DEPLOY-03 | T-10-03 | SignalR WSS connects (no mixed-content) | manual | Browser DevTools — no mixed-content errors | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Phase 10 is infrastructure/deployment — no new test files needed. All verification is performed via shell commands and browser checks on the live Oracle instance and Vercel deployment.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All containers healthy after `up -d` | DEPLOY-01 | Requires live Oracle server | SSH in, run `docker compose -f docker-compose.prod.yml ps`, check all "healthy" |
| HTTPS cert valid (Let's Encrypt) | DEPLOY-02 | Requires live DNS + Certbot | `curl -sv https://<domain>/health 2>&1 \| grep 'SSL certificate verify ok'` |
| Oracle firewall (VCN + iptables) | INFRA-02 | Requires Oracle Console access + host shell | Confirm VCN rule ingress 80/443, `sudo iptables -L -n` shows ACCEPT for 80/443 |
| Bloom Filter dedup post-restart | DEPLOY-04 | Requires running Redis + crawl data | Restart Redis, submit previously-seen URL, verify not re-crawled |
| BullMQ job survival | DEPLOY-05 | Requires running BullMQ + crawler | Submit job, restart crawler mid-flight, confirm job completes (not duplicated) |
| Vercel + SignalR WSS | DEPLOY-03 | Requires live Vercel + Oracle API | Open dashboard in browser, check Network tab for WSS `101 Switching Protocols` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
