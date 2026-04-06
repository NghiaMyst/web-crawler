# Pitfalls Research
_Researched: 2026-04-07_

## Anti-Bot Detection

### Problem
Sites detect scrapers via: suspicious User-Agent, missing browser headers, too-regular request timing, too-fast request rate, no referrer header, no cookie handling, JavaScript fingerprinting (Playwright bypasses this).

### Mitigation
- Set a realistic User-Agent that identifies as a personal bot: `PersonalCrawlerBot/1.0 (+https://github.com/yourname/web-crawler)`
- Add standard browser headers for Cheerio requests: `Accept`, `Accept-Language`, `Accept-Encoding`
- Introduce jitter in politeness delay: `delay = 2000 + Math.random() * 1000` (2–3s range)
- Handle cookies: use `axios-cookiejar-support` + `tough-cookie` for session persistence
- For Playwright: `stealth` mode via `playwright-extra` + `puppeteer-extra-plugin-stealth` reduces bot fingerprint

### Severity: Medium
Most targeted sites (HoYoLAB, AniList, football-data.org) either have public APIs or are bot-tolerant. Risk is highest for ZingMP3 and Sofascore — avoid these for v1.

---

## Playwright on ARM/Docker

### Problem
Playwright bundles Chromium. The ARM64 build works since Playwright 1.20+ but Docker images need specific handling. Common failures: missing system dependencies (`libnss3`, `libatk-bridge2.0-0`), shared memory (`/dev/shm`) too small in containers.

### Mitigation
Use official Playwright Docker base image for ARM:
```dockerfile
FROM mcr.microsoft.com/playwright:v1.50.0-jammy
```
This includes all Chromium dependencies pre-installed.

If using a custom image, run `playwright install-deps chromium` in Dockerfile.

Add `--disable-dev-shm-usage` and `--no-sandbox` to Chromium launch args:
```typescript
await chromium.launch({
  args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox']
});
```

### Severity: High (if not addressed early)
Discovering this in production means rebuilding Docker images. Test Playwright container on ARM in Phase 1.

---

## BullMQ Reliability

### Problem
Jobs can be lost if: Redis crashes with no persistence, worker process crashes mid-job (job stays "active" forever), or workers are killed without `SIGTERM` handling.

### Mitigation
- Enable Redis persistence: `appendonly yes` in Redis config (already noted in ARCHITECTURE.md)
- BullMQ stalled job detection: `stalledInterval: 30000` (default) auto-recovers jobs from crashed workers
- Implement graceful shutdown:
```typescript
process.on('SIGTERM', async () => {
  await worker.close(); // finishes current job before shutting down
});
```
- Set `lockDuration: 30000` on workers — jobs held longer than this are considered stalled

### Exactly-once semantics
BullMQ is **at-least-once**. Design crawl jobs to be idempotent: inserting the same `(source_id, entry_key, content_hash)` twice should be a no-op (use `INSERT ... ON CONFLICT DO NOTHING`).

### Severity: Medium
Occasional double-processing is acceptable for a personal project. The idempotent insert handles it.

---

## PostgreSQL JSONB at Scale

### Problem
GIN indexes are update-heavy. At high INSERT rates (Phase 5: 50k URLs/day → ~50k entries/day), GIN index maintenance can slow writes by 2-3x. JSONB containment queries (`@>`) on non-indexed fields do full table scans.

### Mitigation
- Phase 1-3: GIN index on full `payload` column is fine
- Phase 4+: Switch to partial GIN index per category: `WHERE category = 'game'`
- Phase 5 signal: `EXPLAIN ANALYZE` shows `Seq Scan` instead of `Bitmap Index Scan` → time to add typed columns for hot query fields
- Use `VACUUM ANALYZE data_entries` regularly (cron job) to keep stats fresh

### Severity: Low for Phase 1-3
50k rows/day with GIN is well within PostgreSQL's comfortable range. Only a concern at Phase 5 scale.

---

## Bloom Filter False Positives

### Problem
At 1% false positive rate with 100k URLs: approximately 1 in 100 new URLs is mistakenly flagged as "already seen" and skipped. For a personal crawler monitoring ~10 sources, this means ~5 missed crawls per day at full scale.

### Detection
Monitor missed crawls: if a source hasn't had a new entry in unusually long time, check if URLs are being skipped incorrectly.

### Mitigation
- Use 0.1% false positive rate instead of 1% (costs ~180KB vs 120KB — trivial)
- Implement a "force re-crawl" mode that bypasses Bloom Filter for a specific source
- Reset strategy: delete Redis key + rebuild from DB on startup (add `--rebuild-bloom` CLI flag)

### Severity: Low
The data loss is tolerable for a personal monitoring tool. Not worth over-engineering.

---

## Oracle Cloud Free Tier Gotchas

### Problem
Several common issues when deploying to Oracle Cloud Always Free (ARM):

1. **Resource reclamation**: Oracle can reclaim idle Always Free instances. Mitigation: ensure instances have active traffic (health check pings, cron jobs running).
2. **Firewall**: Oracle's VCN has a stateful firewall. Ports 80/443/8080 must be opened in BOTH the VCN Security List AND the OS-level `iptables`/`firewalld`. Many people open VCN rules but forget the OS firewall.
3. **Docker ARM images**: Some popular images don't have ARM64 builds. Always check: `docker manifest inspect image:tag | grep arm64`. Known ARM64-compatible: `postgres:16-alpine`, `redis:7-alpine`, `node:20-alpine`, `mcr.microsoft.com/dotnet/aspnet:8.0`.
4. **Disk I/O**: 200GB block storage on Always Free uses Oracle's burstable I/O. Heavy PostgreSQL writes during initial data load can be slow. Not a concern for steady-state crawling.
5. **IPv6 only option**: Some Always Free regions only assign IPv6 by default. Ensure your VCN has an IPv4 subnet if needed.

### Severity: High (setup phase only)
Firewall misconfiguration is the #1 reason deployments fail silently. Document the exact firewall steps in the deployment runbook (Phase 4).
